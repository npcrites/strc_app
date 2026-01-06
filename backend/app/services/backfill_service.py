"""
Backfill Service for populating historical market data
"""
import httpx
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from decimal import Decimal
import logging
import time

from app.models.position import Position
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot
from app.models.asset_price import AssetPrice
from app.core.config import settings

logger = logging.getLogger(__name__)


class BackfillService:
    """Service for backfilling historical market data"""
    
    def __init__(self):
        self.api_key = settings.ALPACA_API_KEY
        self.secret_key = settings.ALPACA_SECRET_KEY
        self.base_url = "https://data.alpaca.markets"
        
        if not self.api_key or not self.secret_key:
            logger.warning("Alpaca API credentials not configured")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authentication headers for Alpaca API"""
        return {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
        }
    
    def fetch_historical_bars(
        self,
        ticker: str,
        start_date: datetime,
        end_date: datetime,
        timeframe: str = "1Day"
    ) -> List[Dict]:
        """
        Fetch historical bars from Alpaca Data API
        
        Args:
            ticker: Stock symbol
            start_date: Start date
            end_date: End date
            timeframe: Bar timeframe (1Day, 1Hour, 15Min, 5Min, etc.)
            
        Returns:
            List of bar data dictionaries
        """
        if not self.api_key or not self.secret_key:
            logger.error("Alpaca credentials not configured")
            return []
        
        try:
            # Format dates for Alpaca API (ISO format with timezone)
            start_str = start_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")  # EST timezone
            end_str = end_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")
            
            url = f"{self.base_url}/v2/stocks/{ticker}/bars"
            params = {
                "timeframe": timeframe,
                "start": start_str,
                "end": end_str,
                "adjustment": "raw",  # Raw prices, not adjusted
                "feed": "iex"  # IEX feed for paper trading
            }
            
            with httpx.Client(timeout=30.0) as client:
                response = client.get(
                    url,
                    headers=self._get_headers(),
                    params=params
                )
                
                if response.status_code == 404:
                    logger.warning(f"Symbol {ticker} not found in Alpaca")
                    return []
                
                response.raise_for_status()
                data = response.json()
                
                # Parse response: {"bars": [{"t": "2025-01-01T00:00:00Z", "o": 100, "h": 105, "l": 99, "c": 102, "v": 1000}, ...]}
                bars = data.get("bars", [])
                
                logger.info(f"Fetched {len(bars)} bars for {ticker} from {start_date.date()} to {end_date.date()}")
                return bars
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Alpaca API HTTP error for {ticker}: {e.response.status_code} - {e.response.text}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Alpaca API request error for {ticker}: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Error fetching historical bars for {ticker}: {str(e)}", exc_info=True)
            return []
    
    def get_users_with_ticker(self, db: Session, ticker: str) -> List[Tuple[int, Position]]:
        """
        Get all users who have positions for a given ticker
        
        Args:
            db: Database session
            ticker: Stock ticker symbol
            
        Returns:
            List of tuples (user_id, Position)
        """
        try:
            positions = db.query(Position).filter(
                func.upper(Position.ticker) == ticker.upper(),
                Position.shares > 0
            ).all()
            
            # Group by user_id and get the position
            user_positions = {}
            for pos in positions:
                if pos.user_id not in user_positions:
                    user_positions[pos.user_id] = pos
            
            return [(user_id, pos) for user_id, pos in user_positions.items()]
            
        except Exception as e:
            logger.error(f"Error getting users with ticker {ticker}: {str(e)}", exc_info=True)
            return []
    
    def backfill_ticker(
        self,
        db: Session,
        ticker: str,
        days_back: int = 365,
        min_interval_minutes: int = 5
    ) -> Dict[str, int]:
        """
        Backfill historical data for a ticker
        
        Args:
            db: Database session
            ticker: Stock ticker symbol
            days_back: Number of days to backfill (default: 1 year)
            min_interval_minutes: Minimum interval between snapshots in minutes (default: 5)
            
        Returns:
            Dictionary with backfill statistics
        """
        ticker_upper = ticker.upper()
        logger.info(f"Starting backfill for {ticker_upper} (last {days_back} days)")
        
        # Get users who have this ticker
        user_positions = self.get_users_with_ticker(db, ticker_upper)
        
        if not user_positions:
            logger.warning(f"No users found with positions for {ticker_upper}")
            return {
                "ticker": ticker_upper,
                "users_found": 0,
                "snapshots_created": 0,
                "errors": 0
            }
        
        logger.info(f"Found {len(user_positions)} users with {ticker_upper} positions")
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        
        # Fetch historical data from Alpaca
        # Use daily bars for older data, then switch to hourly/15min for recent data
        bars = []
        
        # For data older than 30 days, use daily bars
        if days_back > 30:
            cutoff_date = end_date - timedelta(days=30)
            daily_bars = self.fetch_historical_bars(
                ticker_upper,
                start_date,
                cutoff_date,
                timeframe="1Day"
            )
            bars.extend(daily_bars)
            
            # For recent data (last 30 days), use 15-minute bars for better granularity
            recent_bars = self.fetch_historical_bars(
                ticker_upper,
                cutoff_date,
                end_date,
                timeframe="15Min"
            )
            bars.extend(recent_bars)
        else:
            # For short timeframes, use 15-minute bars
            bars = self.fetch_historical_bars(
                ticker_upper,
                start_date,
                end_date,
                timeframe="15Min"
            )
        
        if not bars:
            logger.warning(f"No historical data found for {ticker_upper}")
            return {
                "ticker": ticker_upper,
                "users_found": len(user_positions),
                "snapshots_created": 0,
                "errors": 0
            }
        
        logger.info(f"Fetched {len(bars)} historical bars for {ticker_upper}")
        
        # Create snapshots for each user
        total_snapshots = 0
        total_errors = 0
        
        for user_id, position in user_positions:
            try:
                snapshots_created = self._create_snapshots_for_user(
                    db,
                    user_id,
                    position,
                    bars,
                    min_interval_minutes
                )
                total_snapshots += snapshots_created
                logger.info(f"Created {snapshots_created} snapshots for user {user_id} ({ticker_upper})")
            except Exception as e:
                total_errors += 1
                logger.error(f"Error creating snapshots for user {user_id} ({ticker_upper}): {str(e)}", exc_info=True)
        
        return {
            "ticker": ticker_upper,
            "users_found": len(user_positions),
            "snapshots_created": total_snapshots,
            "errors": total_errors,
            "bars_fetched": len(bars)
        }
    
    def _create_snapshots_for_user(
        self,
        db: Session,
        user_id: int,
        position: Position,
        bars: List[Dict],
        min_interval_minutes: int
    ) -> int:
        """
        Create snapshots for a user based on historical bars
        
        Args:
            db: Database session
            user_id: User ID
            position: Position object (for shares and cost_basis)
            bars: List of historical bar data from Alpaca
            min_interval_minutes: Minimum interval between snapshots
            
        Returns:
            Number of snapshots created
        """
        if not bars:
            return 0
        
        # Get existing snapshots to avoid duplicates
        existing_snapshots = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.timestamp >= (datetime.utcnow() - timedelta(days=365))
        ).order_by(PortfolioSnapshot.timestamp.asc()).all()
        
        existing_timestamps = {
            snap.timestamp.replace(second=0, microsecond=0)
            for snap in existing_snapshots
        }
        
        # Parse bars and create snapshots
        ticker = position.ticker.upper()
        shares = Decimal(str(position.shares))
        cost_basis = Decimal(str(position.cost_basis))
        
        snapshots_created = 0
        last_snapshot_time = None
        
        for bar in bars:
            try:
                # Parse timestamp
                timestamp_str = bar.get("t")
                if not timestamp_str:
                    continue
                
                # Parse timestamp (Alpaca returns ISO format)
                bar_timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                # Convert to UTC naive datetime
                if bar_timestamp.tzinfo:
                    bar_timestamp = bar_timestamp.replace(tzinfo=None)
                
                # Round to nearest minute for consistency
                bar_timestamp = bar_timestamp.replace(second=0, microsecond=0)
                
                # Skip if too close to last snapshot
                if last_snapshot_time:
                    time_diff = (bar_timestamp - last_snapshot_time).total_seconds() / 60
                    if time_diff < min_interval_minutes:
                        continue
                
                # Skip if portfolio snapshot already exists at this timestamp
                # (we'll check for position snapshot separately)
                if bar_timestamp in existing_timestamps:
                    # Check if position snapshot for this ticker already exists
                    existing_portfolio = db.query(PortfolioSnapshot).filter(
                        PortfolioSnapshot.user_id == user_id,
                        PortfolioSnapshot.timestamp == bar_timestamp
                    ).first()
                    
                    if existing_portfolio:
                        existing_position = db.query(PositionSnapshot).filter(
                            PositionSnapshot.portfolio_snapshot_id == existing_portfolio.id,
                            func.upper(PositionSnapshot.ticker) == ticker
                        ).first()
                        
                        if existing_position:
                            # Position snapshot already exists, skip
                            continue
                
                # Get close price
                close_price = bar.get("c")
                if not close_price:
                    continue
                
                price = Decimal(str(close_price))
                current_value = shares * price
                
                # Check if portfolio snapshot already exists at this timestamp
                # (might exist from backfilling another ticker for the same user)
                portfolio_snapshot = db.query(PortfolioSnapshot).filter(
                    PortfolioSnapshot.user_id == user_id,
                    PortfolioSnapshot.timestamp == bar_timestamp
                ).first()
                
                if not portfolio_snapshot:
                    # Create new portfolio snapshot with just this position's value
                    # Note: This is simplified - in reality, portfolio should include all positions
                    # But for backfilling purposes, this is sufficient since charts query by ticker
                    portfolio_snapshot = PortfolioSnapshot(
                        user_id=user_id,
                        total_value=current_value,
                        cash_balance=Decimal('0.00'),
                        investment_value=current_value,
                        timestamp=bar_timestamp
                    )
                    db.add(portfolio_snapshot)
                    db.flush()  # Get the ID
                # If portfolio snapshot exists, reuse it (don't update values to avoid conflicts)
                
                # Create position snapshot
                position_snapshot = PositionSnapshot(
                    portfolio_snapshot_id=portfolio_snapshot.id,
                    ticker=ticker,
                    shares=shares,
                    cost_basis=cost_basis,
                    current_value=current_value,
                    price_per_share=price
                )
                db.add(position_snapshot)
                
                snapshots_created += 1
                last_snapshot_time = bar_timestamp
                
                # Commit in batches of 100 to avoid memory issues
                if snapshots_created % 100 == 0:
                    db.commit()
                    logger.debug(f"Committed batch of 100 snapshots for user {user_id} ({ticker})")
                
            except Exception as e:
                logger.error(f"Error processing bar for {ticker}: {str(e)}", exc_info=True)
                continue
        
        # Final commit
        if snapshots_created > 0:
            db.commit()
        
        return snapshots_created
    
    def backfill_tickers(
        self,
        db: Session,
        tickers: List[str],
        days_back: int = 365,
        min_interval_minutes: int = 5
    ) -> Dict[str, Dict[str, int]]:
        """
        Backfill multiple tickers
        
        Args:
            db: Database session
            tickers: List of ticker symbols
            days_back: Number of days to backfill
            min_interval_minutes: Minimum interval between snapshots
            
        Returns:
            Dictionary mapping ticker to backfill statistics
        """
        results = {}
        
        for ticker in tickers:
            try:
                result = self.backfill_ticker(db, ticker, days_back, min_interval_minutes)
                results[ticker.upper()] = result
                
                # Small delay between tickers to respect rate limits
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Error backfilling {ticker}: {str(e)}", exc_info=True)
                results[ticker.upper()] = {
                    "ticker": ticker.upper(),
                    "users_found": 0,
                    "snapshots_created": 0,
                    "errors": 1
                }
        
        return results

