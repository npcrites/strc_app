"""
Assets API endpoints for price history
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.position_snapshot import PositionSnapshot
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.asset_price import AssetPrice
from app.services.dashboard.models.time_range import TimeRange, TimeGranularity
from app.services.dashboard.queries.positions import _get_bucket_key
from app.services.price_service import PriceService
from app.services.market_hours_service import MarketHoursService
from app.core.config import settings
from sqlalchemy import and_, func
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assets", tags=["assets"])


class PricePoint(BaseModel):
    """Single price data point"""
    timestamp: datetime
    price: float
    value: Optional[float] = None  # Total position value at this time


class AssetPriceHistory(BaseModel):
    """Asset price history response"""
    ticker: str
    current_price: Optional[float]
    granularity: str
    series: List[PricePoint]


def _fetch_historical_prices_from_alpaca(
    ticker: str,
    start_date: Optional[datetime],
    end_date: datetime,
    granularity: TimeGranularity
) -> List[PricePoint]:
    """
    Fetch historical price data from Alpaca Data API.
    
    Args:
        ticker: Stock ticker symbol
        start_date: Start date (None for ALL)
        end_date: End date
        granularity: Time granularity
    
    Returns:
        List of PricePoint objects
    """
    if not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
        logger.warning("Alpaca credentials not configured, cannot fetch historical data")
        return []
    
    try:
        # Map granularity to Alpaca timeframe
        # Alpaca supports: 1Min, 5Min, 15Min, 30Min, 1Hour, 1Day, 1Week, 1Month
        # For short timeframes, use higher frequency data to show price movements
        timeframe_map = {
            TimeGranularity.DAILY: "15Min",  # Use 15-minute bars for daily/weekly views (Coinbase-style)
            TimeGranularity.WEEKLY: "1Week",
            TimeGranularity.MONTHLY: "1Month",
        }
        alpaca_timeframe = timeframe_map.get(granularity, "1Day")
        
        # Override for very short time ranges (1W) - use even higher frequency
        if start_date and end_date:
            time_diff = (end_date - start_date).total_seconds()
            if time_diff <= 7 * 86400:  # 1 week or less
                alpaca_timeframe = "5Min"  # 5-minute bars for 1W view
            elif time_diff <= 30 * 86400:  # 1 month or less
                alpaca_timeframe = "15Min"  # 15-minute bars for 1M view
        
        # Calculate start date (default to 1 year ago if None)
        if start_date is None:
            start_date = end_date - timedelta(days=365)
        
        # Format dates for Alpaca API (ISO format)
        start_str = start_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")  # EST timezone
        end_str = end_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")
        
        # Alpaca Data API endpoint for historical bars
        url = f"https://data.alpaca.markets/v2/stocks/{ticker}/bars"
        params = {
            "timeframe": alpaca_timeframe,
            "start": start_str,
            "end": end_str,
            "adjustment": "raw",  # Raw prices, not adjusted
            "feed": "iex"  # IEX feed for paper trading
        }
        
        headers = {
            "APCA-API-KEY-ID": settings.ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": settings.ALPACA_SECRET_KEY,
        }
        
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers, params=params)
            
            if response.status_code == 404:
                logger.warning(f"Symbol {ticker} not found in Alpaca")
                return []
            
            response.raise_for_status()
            data = response.json()
            
            # Parse response: {"bars": [{"t": "2025-01-01T00:00:00Z", "o": 100, "h": 105, "l": 99, "c": 102, "v": 1000}, ...]}
            bars = data.get("bars", [])
            
            series = []
            for bar in bars:
                # Use close price (c) for the price point
                timestamp_str = bar.get("t")
                close_price = bar.get("c")
                
                if timestamp_str and close_price:
                    # Parse timestamp (Alpaca returns ISO format)
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    series.append(PricePoint(
                        timestamp=timestamp,
                        price=float(close_price),
                        value=None
                    ))
            
            logger.info(f"Fetched {len(series)} historical price points from Alpaca for {ticker}")
            return series
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Alpaca API HTTP error: {e.response.status_code} - {e.response.text}")
        return []
    except httpx.RequestError as e:
        logger.error(f"Alpaca API request error: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Error fetching historical prices from Alpaca: {str(e)}", exc_info=True)
        return []


@router.get("/{ticker}/price-history", response_model=AssetPriceHistory)
async def get_asset_price_history(
    ticker: str,
    time_range: str = Query("1M", regex="^(1W|1M|3M|1Y|ALL)$", description="Time range: 1W, 1M, 3M, 1Y, or ALL"),
    trading_hours_mode: str = Query("market", regex="^(market|extended)$", description="Trading hours mode: market or extended"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get historical price data for a specific asset.
    
    Uses position snapshots to extract historical prices, with the same
    granularity and timestamps as the portfolio dashboard.
    
    Args:
        ticker: Stock ticker symbol (e.g., "STRC", "AAPL")
        time_range: Time range shorthand (1M, 3M, 1Y, ALL)
        trading_hours_mode: "market" to show only market hours, "extended" to show all hours
        db: Database session
        user: Authenticated user from JWT
    
    Returns:
        AssetPriceHistory with price series
    """
    try:
        user_id = int(user.get("user_id"))
        ticker_upper = ticker.upper()
        
        # Convert shorthand to TimeRange
        tr = TimeRange.from_shorthand(time_range)
        
        # Adjust time range based on trading hours mode
        market_hours_service = MarketHoursService()
        if trading_hours_mode == "market":
            # Market hours mode: use trading days (1W = 5 trading days)
            adjusted_start, adjusted_end = market_hours_service.adjust_time_range_for_trading_days(
                tr.start_date,
                tr.end_date,
                time_range
            )
            tr.start_date = adjusted_start
            tr.end_date = adjusted_end
            logger.info(
                f"Adjusted time range for market hours: "
                f"start={tr.start_date}, end={tr.end_date}"
            )
        elif trading_hours_mode == "extended" and time_range == "1W":
            # Extended hours mode: 1W = 5 calendar days (not 7)
            from datetime import timedelta
            tr.start_date = tr.end_date - timedelta(days=5)
            logger.info(
                f"Adjusted time range for extended hours (1W): "
                f"start={tr.start_date}, end={tr.end_date} (5 calendar days)"
            )
        
        # Get current price
        current_price_obj = db.query(AssetPrice).filter(
            func.upper(AssetPrice.symbol) == ticker_upper
        ).first()
        current_price = float(current_price_obj.price) if current_price_obj else None
        
        # Query position snapshots for this ticker within the time range
        query = db.query(
            PortfolioSnapshot.timestamp,
            PositionSnapshot.price_per_share,
            PositionSnapshot.current_value
        ).join(
            PositionSnapshot,
            PositionSnapshot.portfolio_snapshot_id == PortfolioSnapshot.id
        ).filter(
            and_(
                PortfolioSnapshot.user_id == user_id,
                func.upper(PositionSnapshot.ticker) == ticker_upper
            )
        )
        
        # Apply time range filter (all timestamps in UTC)
        if tr.start_date:
            query = query.filter(PortfolioSnapshot.timestamp >= tr.start_date)
        query = query.filter(PortfolioSnapshot.timestamp <= tr.end_date)
        
        # Order by timestamp
        query = query.order_by(PortfolioSnapshot.timestamp.asc())
        
        # Get all snapshots
        snapshots = query.all()
        
        logger.info(
            f"Time range filter for {ticker_upper}: "
            f"start={tr.start_date}, end={tr.end_date}, "
            f"found {len(snapshots)} snapshots"
        )
        
        # Log first and last snapshot timestamps for debugging
        if snapshots:
            first_snapshot = snapshots[0].timestamp
            last_snapshot = snapshots[-1].timestamp
            logger.info(
                f"Snapshot range: first={first_snapshot}, last={last_snapshot}"
            )
        
        # Only fetch from Alpaca if we have NO snapshots at all
        # Always use position snapshots when available, even if price hasn't varied
        # This preserves the 5-minute snapshot data that users expect
        if not snapshots:
            logger.info(f"No snapshots found for {ticker_upper}, fetching historical data from Alpaca")
            historical_series = _fetch_historical_prices_from_alpaca(
                ticker_upper, 
                tr.start_date, 
                tr.end_date, 
                tr.granularity
            )
            
            if historical_series:
                return AssetPriceHistory(
                    ticker=ticker_upper,
                    current_price=current_price,
                    granularity=tr.granularity.value,
                    series=historical_series
                )
        
        # If we still have no snapshots after Alpaca fallback, return empty
        if not snapshots:
            return AssetPriceHistory(
                ticker=ticker_upper,
                current_price=current_price,
                granularity=tr.granularity.value,
                series=[]
            )
        
        # Determine granularity (same logic as dashboard)
        granularity = tr.granularity
        
        # For asset charts, we want to preserve 5-minute snapshot granularity
        # Only bucket if we have an extremely large number of snapshots (>10,000)
        # This preserves the 5-minute granularity that users expect to see
        MAX_SNAPSHOTS_BEFORE_BUCKETING = 10000
        
        if len(snapshots) < MAX_SNAPSHOTS_BEFORE_BUCKETING:
            # Return all snapshots - preserve 5-minute granularity
            logger.info(f"Returning all {len(snapshots)} snapshots for {ticker_upper} (preserving 5-minute granularity)")
            
            # Filter to market hours only if market hours mode
            if trading_hours_mode == "market":
                market_hours_service = MarketHoursService()
                # Filter to only trading days during market hours
                # This ensures we exclude weekends, holidays, and after-hours data
                filtered_snapshots = [
                    snap for snap in snapshots
                    if market_hours_service.is_market_open(snap.timestamp)
                ]
                logger.info(
                    f"Filtered to {len(filtered_snapshots)} market hours snapshots "
                    f"(from {len(snapshots)} total) for {ticker_upper}"
                )
                snapshots = filtered_snapshots
            
            series = [
                PricePoint(
                    timestamp=snap.timestamp,
                    price=float(snap.price_per_share),
                    value=float(snap.current_value) if snap.current_value else None
                )
                for snap in snapshots
            ]
        else:
            # Only bucket if we have an extremely large dataset (>10k snapshots)
            # Use hourly bucketing instead of daily to preserve more granularity
            logger.info(f"Bucketing {len(snapshots)} snapshots for {ticker_upper} (using hourly buckets)")
            bucketed = {}
            for snap in snapshots:
                # Bucket by hour instead of day to preserve more granularity
                bucket_key = snap.timestamp.replace(minute=0, second=0, microsecond=0)
                # Keep the latest snapshot in each bucket
                if bucket_key not in bucketed or snap.timestamp > bucketed[bucket_key].timestamp:
                    bucketed[bucket_key] = snap
            
            # Convert to sorted list
            bucketed_list = sorted(bucketed.values(), key=lambda x: x.timestamp)
            
            # Filter to market hours only if market hours mode
            if trading_hours_mode == "market":
                market_hours_service = MarketHoursService()
                bucketed_list = [
                    snap for snap in bucketed_list
                    if market_hours_service.is_market_open(snap.timestamp)
                ]
                logger.info(f"Filtered bucketed data to {len(bucketed_list)} market hours snapshots")
            
            series = [
                PricePoint(
                    timestamp=snap.timestamp,
                    price=float(snap.price_per_share),
                    value=float(snap.current_value) if snap.current_value else None
                )
                for snap in bucketed_list
            ]
            logger.info(f"After bucketing: {len(series)} data points")
        
        # Add current price as the latest point if we have it
        if current_price and series:
            # Only add if it's newer than the last snapshot
            last_timestamp = series[-1].timestamp
            now = datetime.utcnow()
            if (now - last_timestamp).total_seconds() > 60:  # More than 1 minute difference
                series.append(PricePoint(
                    timestamp=now,
                    price=current_price,
                    value=None
                ))
        elif current_price and not series:
            # If no historical data, just return current price
            series = [PricePoint(
                timestamp=datetime.utcnow(),
                price=current_price,
                value=None
            )]
        
        return AssetPriceHistory(
            ticker=ticker_upper,
            current_price=current_price,
            granularity=granularity.value,
            series=series
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching asset price history: {str(e)}"
        )

