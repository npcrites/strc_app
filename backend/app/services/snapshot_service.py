"""
Snapshot Service for creating historical portfolio snapshots
"""
from typing import Optional, Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from decimal import Decimal
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from app.services.price_service import PriceService
import logging

logger = logging.getLogger(__name__)


class SnapshotService:
    """Service for creating and managing portfolio snapshots"""
    
    def __init__(self):
        self.price_service = PriceService()
    
    def create_portfolio_snapshot(self, db: Session, user_id: int, timestamp: Optional[datetime] = None) -> Optional[PortfolioSnapshot]:
        """
        Create a portfolio snapshot for a user
        
        Args:
            db: Database session
            user_id: User ID
            timestamp: Snapshot timestamp (defaults to now)
            
        Returns:
            Created PortfolioSnapshot or None if failed
        """
        if timestamp is None:
            timestamp = datetime.utcnow()
        
        try:
            # Get user's current positions
            positions = db.query(Position).filter(
                Position.user_id == user_id,
                Position.shares > 0
            ).all()
            
            if not positions:
                logger.info(f"User {user_id} has no positions, creating zero-value snapshot")
                # Still create snapshot for consistency
                return self._create_empty_snapshot(db, user_id, timestamp)
            
            # Get all unique symbols
            symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
            
            # Get current prices from cache
            prices = self.price_service.get_prices(db, symbols)
            
            # Calculate portfolio values
            total_investment_value = Decimal('0.00')
            position_snapshots_data = []
            
            for position in positions:
                symbol = position.ticker.upper()
                shares = Decimal(str(position.shares))
                cost_basis = Decimal(str(position.cost_basis))
                
                # Get price (use cached price or fallback to market_value/shares if available)
                price = prices.get(symbol)
                if price is None and position.market_value and shares > 0:
                    # Fallback to existing market_value
                    price = float(position.market_value) / float(shares)
                    logger.warning(f"Price not found for {symbol}, using existing market_value")
                
                if price is None:
                    logger.warning(f"Price unavailable for {symbol}, skipping position in snapshot")
                    continue
                
                price_decimal = Decimal(str(price))
                current_value = shares * price_decimal
                total_investment_value += current_value
                
                position_snapshots_data.append({
                    "ticker": symbol,
                    "shares": shares,
                    "cost_basis": cost_basis,
                    "current_value": current_value,
                    "price_per_share": price_decimal
                })
            
            # Get cash balance (will be from User.balance field once added)
            cash_balance = Decimal('0.00')
            
            # Get total dividends paid out up to this timestamp (cumulative)
            total_dividends = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
                Dividend.user_id == user_id,
                Dividend.status == DividendStatus.PAID,
                Dividend.pay_date <= timestamp.date()  # Only dividends paid up to snapshot time
            ).scalar() or Decimal('0.00')
            
            # Total portfolio value = (current stock value) + (dividends paid out)
            total_value = total_investment_value + Decimal(str(total_dividends))
            
            # Check for duplicate snapshot (same user_id and timestamp within 1 second)
            # Use a small time window to handle race conditions
            existing = db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.user_id == user_id,
                func.abs(
                    func.extract('epoch', PortfolioSnapshot.timestamp - timestamp)
                ) < 1.0  # Within 1 second
            ).first()
            
            if existing:
                logger.warning(f"Snapshot already exists for user {user_id} at {timestamp}, skipping")
                return existing
            
            # Create portfolio snapshot
            portfolio_snapshot = PortfolioSnapshot(
                user_id=user_id,
                total_value=total_value,
                cash_balance=cash_balance,
                investment_value=total_investment_value,
                timestamp=timestamp
            )
            db.add(portfolio_snapshot)
            db.flush()  # Get the ID
            
            # Create position snapshots
            for pos_data in position_snapshots_data:
                position_snapshot = PositionSnapshot(
                    portfolio_snapshot_id=portfolio_snapshot.id,
                    ticker=pos_data["ticker"],
                    shares=pos_data["shares"],
                    cost_basis=pos_data["cost_basis"],
                    current_value=pos_data["current_value"],
                    price_per_share=pos_data["price_per_share"]
                )
                db.add(position_snapshot)
            
            db.commit()
            
            logger.info(
                f"Created snapshot for user {user_id}: "
                f"total_value=${total_value}, "
                f"investment_value=${total_investment_value}, "
                f"dividends_paid=${total_dividends}, "
                f"cash=${cash_balance}, "
                f"positions={len(position_snapshots_data)}"
            )
            
            return portfolio_snapshot
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating snapshot for user {user_id}: {str(e)}", exc_info=True)
            return None
    
    def _create_empty_snapshot(self, db: Session, user_id: int, timestamp: datetime) -> PortfolioSnapshot:
        """Create an empty snapshot (no positions)"""
        try:
            # Get cash balance (will be from User.balance field once added)
            cash_balance = Decimal('0.00')
            
            # Get total dividends paid out up to this timestamp
            total_dividends = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
                Dividend.user_id == user_id,
                Dividend.status == DividendStatus.PAID,
                Dividend.pay_date <= timestamp.date()
            ).scalar() or Decimal('0.00')
            
            # Total value = dividends (even with no positions)
            total_value = Decimal(str(total_dividends))
            
            portfolio_snapshot = PortfolioSnapshot(
                user_id=user_id,
                total_value=total_value,
                cash_balance=cash_balance,
                investment_value=Decimal('0.00'),
                timestamp=timestamp
            )
            db.add(portfolio_snapshot)
            db.commit()
            
            return portfolio_snapshot
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating empty snapshot: {str(e)}")
            raise
    
    def create_snapshots_for_all_users(self, db: Session) -> Dict[str, int]:
        """
        Create snapshots for all active users
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with statistics
        """
        from app.models.user import User
        
        try:
            users = db.query(User).filter(User.is_active == True).all()
            
            success_count = 0
            error_count = 0
            
            for user in users:
                try:
                    snapshot = self.create_portfolio_snapshot(db, user.id)
                    if snapshot:
                        success_count += 1
                    else:
                        error_count += 1
                except Exception as e:
                    error_count += 1
                    logger.error(f"Error creating snapshot for user {user.id}: {str(e)}")
                    # Continue with next user
                    continue
            
            logger.info(f"Snapshot creation completed: {success_count} successful, {error_count} errors")
            
            return {
                "total_users": len(users),
                "successful": success_count,
                "errors": error_count
            }
            
        except Exception as e:
            logger.error(f"Error in create_snapshots_for_all_users: {str(e)}", exc_info=True)
            return {"total_users": 0, "successful": 0, "errors": 0}

