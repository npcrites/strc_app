"""
Portfolio API endpoints for current value and historical performance
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional
from datetime import datetime, timedelta
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from app.services.price_service import PriceService
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class PositionValue(BaseModel):
    """Position value breakdown"""
    ticker: str
    shares: float
    cost_basis: float
    current_value: float
    price_per_share: float
    unrealized_gain_loss: float
    unrealized_gain_loss_percent: float


class CurrentPortfolioValue(BaseModel):
    """Current portfolio value response"""
    total_value: float
    investment_value: float
    cash_balance: float
    dividends_paid: float = Field(default=0.0, description="Total dividends paid out (cumulative)")
    positions: List[PositionValue]
    last_updated: datetime
    price_fresh: bool = Field(default=True, description="Whether prices are fresh (< 5 min old)")


class ChartDataPoint(BaseModel):
    """Single data point for chart"""
    timestamp: datetime
    value: float


class PerformanceChart(BaseModel):
    """Historical performance chart data"""
    timeframe: str
    data_points: List[ChartDataPoint]
    start_value: float
    current_value: float
    profit_loss: float
    profit_loss_percent: float
    data_available: bool = Field(default=True, description="Whether sufficient data exists")


@router.get("/current", response_model=CurrentPortfolioValue)
async def get_current_portfolio_value(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get current portfolio value with live prices.
    
    Calculates portfolio value on-the-fly using:
    - Current positions from positions table
    - Latest prices from price cache (price * shares for each position)
    - Total dividends paid out (cumulative)
    
    Formula: total_value = sum(latest_price * shares) + dividends_paid
    
    Returns:
        CurrentPortfolioValue with total value, breakdown, and position details
    """
    try:
        user_id = int(user.get("user_id"))
        
        # Get user's current positions
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        # Get all unique symbols
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        
        # Get prices from cache
        price_service = PriceService()
        prices = price_service.get_prices(db, symbols)
        
        # Check price freshness (5 minutes max age)
        price_fresh = True
        if symbols:
            price_fresh = all(
                price_service.is_price_fresh(db, symbol, max_age_seconds=300)
                for symbol in symbols
            )
        
        # Calculate portfolio values
        total_investment_value = Decimal('0.00')
        position_values = []
        
        for position in positions:
            symbol = position.ticker.upper()
            shares = Decimal(str(position.shares))
            cost_basis = Decimal(str(position.cost_basis))
            
            # Get price (use cached price or fallback to market_value/shares)
            price = prices.get(symbol)
            if price is None and position.market_value and shares > 0:
                price = float(position.market_value) / float(shares)
            
            if price is None:
                # Skip positions without prices
                continue
            
            price_decimal = Decimal(str(price))
            current_value = shares * price_decimal
            total_investment_value += current_value
            
            unrealized_gain_loss = current_value - cost_basis
            unrealized_gain_loss_percent = 0.0
            if cost_basis > 0:
                unrealized_gain_loss_percent = float((unrealized_gain_loss / cost_basis) * 100)
            
            position_values.append(PositionValue(
                ticker=symbol,
                shares=float(shares),
                cost_basis=float(cost_basis),
                current_value=float(current_value),
                price_per_share=float(price),
                unrealized_gain_loss=float(unrealized_gain_loss),
                unrealized_gain_loss_percent=unrealized_gain_loss_percent
            ))
        
        # Get cash balance (will be from User.balance field once added)
        cash_balance = Decimal('0.00')
        
        # Get total dividends paid out (cumulative)
        total_dividends = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
            Dividend.user_id == user_id,
            Dividend.status == DividendStatus.PAID
        ).scalar() or Decimal('0.00')
        
        # Total portfolio value = (current stock value) + (dividends paid out)
        # Note: Cash balance is separate - dividends are added to portfolio value
        total_value = total_investment_value + Decimal(str(total_dividends))
        
        # Get last price update time
        last_updated = datetime.utcnow()
        if symbols:
            # Get the most recent price update time
            from app.models.asset_price import AssetPrice
            latest_price = db.query(func.max(AssetPrice.updated_at)).filter(
                func.upper(AssetPrice.symbol).in_([s.upper() for s in symbols])
            ).scalar()
            if latest_price:
                last_updated = latest_price
        
        return CurrentPortfolioValue(
            total_value=float(total_value),
            investment_value=float(total_investment_value),
            cash_balance=float(cash_balance),
            dividends_paid=float(total_dividends),
            positions=position_values,
            last_updated=last_updated,
            price_fresh=price_fresh
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error calculating portfolio value: {str(e)}"
        )


@router.get("/performance", response_model=PerformanceChart)
async def get_performance_chart(
    timeframe: str = Query(
        "1D",
        regex="^(1D|1W|1M|3M|YTD|ALL)$",
        description="Time range: 1D, 1W, 1M, 3M, YTD, or ALL"
    ),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get historical performance chart data for specified timeframe.
    
    Uses pre-computed portfolio snapshots for fast retrieval.
    Aggregates snapshots into appropriate time buckets based on timeframe.
    
    Args:
        timeframe: Time range (1D, 1W, 1M, 3M, YTD, ALL)
        db: Database session
        user: Authenticated user
        
    Returns:
        PerformanceChart with time series data points
    """
    try:
        user_id = int(user.get("user_id"))
        
        # Calculate time range
        now = datetime.utcnow()
        start_date = _get_start_date(timeframe, now)
        
        # Query portfolio snapshots in range
        snapshots = db.query(PortfolioSnapshot).filter(
            and_(
                PortfolioSnapshot.user_id == user_id,
                PortfolioSnapshot.timestamp >= start_date,
                PortfolioSnapshot.timestamp <= now
            )
        ).order_by(PortfolioSnapshot.timestamp).all()
        
        if not snapshots:
            # No data available
            return PerformanceChart(
                timeframe=timeframe,
                data_points=[],
                start_value=0.0,
                current_value=0.0,
                profit_loss=0.0,
                profit_loss_percent=0.0,
                data_available=False
            )
        
        # Aggregate snapshots based on timeframe
        data_points = _aggregate_snapshots(snapshots, timeframe)
        
        # Calculate metrics
        start_value = float(snapshots[0].total_value)
        current_value = float(snapshots[-1].total_value)
        profit_loss = current_value - start_value
        profit_loss_percent = 0.0
        if start_value > 0:
            profit_loss_percent = (profit_loss / start_value) * 100
        
        return PerformanceChart(
            timeframe=timeframe,
            data_points=data_points,
            start_value=start_value,
            current_value=current_value,
            profit_loss=profit_loss,
            profit_loss_percent=profit_loss_percent,
            data_available=True
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching performance data: {str(e)}"
        )


def _get_start_date(timeframe: str, now: datetime) -> datetime:
    """Calculate start date based on timeframe"""
    if timeframe == "1D":
        return now - timedelta(days=1)
    elif timeframe == "1W":
        return now - timedelta(weeks=1)
    elif timeframe == "1M":
        return now - timedelta(days=30)
    elif timeframe == "3M":
        return now - timedelta(days=90)
    elif timeframe == "YTD":
        # Year to date: start of current year
        return datetime(now.year, 1, 1)
    elif timeframe == "ALL":
        # All time: go back 10 years (or use a very old date)
        return now - timedelta(days=3650)
    else:
        raise ValueError(f"Invalid timeframe: {timeframe}")


def _aggregate_snapshots(snapshots: List[PortfolioSnapshot], timeframe: str) -> List[ChartDataPoint]:
    """
    Aggregate snapshots into time buckets based on timeframe.
    
    Uses PostgreSQL date_trunc for efficient bucketing:
    - 1D: 5-minute buckets
    - 1W: 30-minute buckets
    - 1M: 1-hour buckets
    - 3M: 3-hour buckets
    - YTD: daily buckets
    - ALL: daily buckets
    """
    if not snapshots:
        return []
    
    # For simplicity, we'll do aggregation in Python
    # For production, consider using PostgreSQL date_trunc in the query
    
    bucket_size = _get_bucket_size(timeframe)
    
    # Group snapshots into buckets
    buckets = {}
    for snapshot in snapshots:
        # Round timestamp to bucket size
        bucket_time = _round_to_bucket(snapshot.timestamp, bucket_size)
        
        # Keep the last snapshot in each bucket (most recent value)
        if bucket_time not in buckets or snapshot.timestamp > buckets[bucket_time].timestamp:
            buckets[bucket_time] = snapshot
    
    # Convert to sorted list
    data_points = [
        ChartDataPoint(
            timestamp=bucket_time,
            value=float(snapshot.total_value)
        )
        for bucket_time, snapshot in sorted(buckets.items())
    ]
    
    return data_points


def _get_bucket_size(timeframe: str) -> timedelta:
    """Get bucket size for aggregation"""
    if timeframe == "1D":
        return timedelta(minutes=5)
    elif timeframe == "1W":
        return timedelta(minutes=30)
    elif timeframe == "1M":
        return timedelta(hours=1)
    elif timeframe == "3M":
        return timedelta(hours=3)
    elif timeframe in ["YTD", "ALL"]:
        return timedelta(days=1)
    else:
        return timedelta(hours=1)


def _round_to_bucket(timestamp: datetime, bucket_size: timedelta) -> datetime:
    """Round timestamp to bucket boundary"""
    if bucket_size >= timedelta(days=1):
        # Daily buckets: round to midnight
        return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
    elif bucket_size >= timedelta(hours=1):
        # Hourly buckets: round to hour
        return timestamp.replace(minute=0, second=0, microsecond=0)
    elif bucket_size >= timedelta(minutes=1):
        # Minute buckets: round to minute
        minutes = (timestamp.minute // bucket_size.seconds // 60) * bucket_size.seconds // 60
        return timestamp.replace(minute=minutes, second=0, microsecond=0)
    else:
        return timestamp


@router.post("/refresh-prices")
async def refresh_prices(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Manually trigger a price update for all active positions.
    
    This endpoint:
    - Fetches latest prices from Alpaca API for all symbols in user's positions
    - Updates the asset_prices cache table
    - Returns statistics about the update
    
    Note: The scheduler should be updating prices automatically,
    but this endpoint allows manual refresh.
    """
    try:
        from app.models.asset_price import AssetPrice
        from sqlalchemy import func
        
        # Get current status before update
        price_service = PriceService()
        
        # Get user's active symbols
        user_id = int(user.get("user_id"))
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        
        # Count existing prices
        existing_count = db.query(AssetPrice).filter(
            func.upper(AssetPrice.symbol).in_([s.upper() for s in symbols])
        ).count() if symbols else 0
        
        # Get last update time
        last_update = None
        if symbols:
            last_update = db.query(func.max(AssetPrice.updated_at)).filter(
                func.upper(AssetPrice.symbol).in_([s.upper() for s in symbols])
            ).scalar()
        
        # Trigger price update
        stats = price_service.update_all_prices(db)
        
        # Get updated count after refresh
        updated_count = db.query(AssetPrice).filter(
            func.upper(AssetPrice.symbol).in_([s.upper() for s in symbols])
        ).count() if symbols else 0
        
        return {
            "status": "success",
            "message": "Price update completed",
            "statistics": {
                "symbols_checked": stats["symbols_checked"],
                "prices_fetched": stats["prices_fetched"],
                "prices_updated": stats["prices_updated"],
                "cached_prices_count": updated_count,
                "existing_before": existing_count,
            },
            "last_update_before": last_update.isoformat() if last_update else None,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error refreshing prices: {str(e)}"
        )


@router.get("/price-status")
async def get_price_status(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get status of price cache for user's positions.
    
    Returns information about:
    - Which symbols are cached
    - How fresh the prices are
    - When prices were last updated
    - Whether scheduler is likely running
    """
    try:
        from app.models.asset_price import AssetPrice
        from sqlalchemy import func
        from datetime import timedelta
        
        user_id = int(user.get("user_id"))
        
        # Get user's active symbols
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        
        if not symbols:
            return {
                "status": "no_positions",
                "message": "User has no active positions",
                "symbols": [],
                "cached_prices": [],
                "summary": {
                    "total_symbols": 0,
                    "cached_count": 0,
                    "missing_count": 0,
                    "fresh_count": 0,
                    "stale_count": 0,
                }
            }
        
        # Get cached prices for these symbols
        cached_prices = db.query(AssetPrice).filter(
            func.upper(AssetPrice.symbol).in_([s.upper() for s in symbols])
        ).all()
        
        now = datetime.utcnow()
        fresh_threshold = timedelta(minutes=5)
        
        price_details = []
        cached_symbols = set()
        fresh_count = 0
        stale_count = 0
        
        for price in cached_prices:
            age = now - price.updated_at
            is_fresh = age < fresh_threshold
            
            if is_fresh:
                fresh_count += 1
            else:
                stale_count += 1
            
            cached_symbols.add(price.symbol.upper())
            price_details.append({
                "symbol": price.symbol,
                "price": float(price.price),
                "updated_at": price.updated_at.isoformat(),
                "age_seconds": age.total_seconds(),
                "is_fresh": is_fresh,
            })
        
        missing_symbols = [s for s in symbols if s not in cached_symbols]
        
        # Get most recent update time across all prices
        all_prices_max = db.query(func.max(AssetPrice.updated_at)).scalar()
        
        return {
            "status": "ok",
            "symbols": symbols,
            "cached_prices": sorted(price_details, key=lambda x: x["symbol"]),
            "missing_symbols": missing_symbols,
            "summary": {
                "total_symbols": len(symbols),
                "cached_count": len(cached_prices),
                "missing_count": len(missing_symbols),
                "fresh_count": fresh_count,
                "stale_count": stale_count,
            },
            "most_recent_update": all_prices_max.isoformat() if all_prices_max else None,
            "scheduler_status": {
                "likely_running": (
                    all_prices_max is not None and 
                    (now - all_prices_max).total_seconds() < 300  # Updated in last 5 min
                ) if all_prices_max else False,
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting price status: {str(e)}"
        )
