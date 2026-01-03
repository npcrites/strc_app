#!/usr/bin/env python3
"""
Script to create synthetic historical data for testing dashboard charts.

Creates:
- Historical dividend payments for STRC (quarterly, going back ~1 year)
- Historical portfolio snapshots with position snapshots (simulating purchases)
- Realistic price movements over time
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timedelta, date
from decimal import Decimal
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot
from app.models.asset_price import AssetPrice
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_active_user(db: Session) -> User:
    """Get the first active user"""
    user = db.query(User).filter(User.is_active == True).first()
    if not user:
        raise ValueError("No active user found")
    return user


def create_historical_dividends(db: Session, user: User, position: Position, start_date: date) -> list:
    """
    Create quarterly dividend payments going back from start_date.
    
    Assumes quarterly dividends with ~$0.25 per share per quarter.
    """
    dividends = []
    current_date = start_date
    
    # Go back ~1 year (4 quarters)
    for quarter in range(4):
        # Calculate ex_date (typically 1-2 weeks before pay_date)
        pay_date = current_date
        ex_date = pay_date - timedelta(days=14)
        
        # Calculate shares at ex_date (use current shares, or estimate based on purchase history)
        shares_at_ex_date = float(position.shares) if position else 100.0
        
        # Dividend per share (quarterly)
        dividend_per_share = Decimal('0.25')
        total_amount = Decimal(str(shares_at_ex_date)) * dividend_per_share
        
        dividend = Dividend(
            user_id=user.id,
            position_id=position.id if position else None,
            ticker="STRC",
            amount=total_amount,
            pay_date=pay_date,
            status=DividendStatus.PAID,
            dividend_per_share=dividend_per_share,
            shares_at_ex_date=Decimal(str(shares_at_ex_date)),
            ex_date=ex_date,
            source="synthetic",
            notes="Synthetic data for testing"
        )
        db.add(dividend)
        dividends.append(dividend)
        
        # Move back 3 months for next quarter
        current_date = current_date - timedelta(days=90)
    
    return dividends


def create_historical_snapshots(
    db: Session,
    user: User,
    start_date: datetime,
    end_date: datetime,
    initial_shares: float = 0.0,
    initial_price: Decimal = Decimal('25.00')
) -> list:
    """
    Create historical portfolio snapshots with position snapshots.
    
    Simulates:
    - Monthly purchases of STRC (increasing position)
    - Price fluctuations over time
    - Portfolio value growth
    """
    snapshots = []
    current_date = start_date
    current_shares = Decimal(str(initial_shares))
    current_price = initial_price
    total_cost_basis = Decimal('0.00')
    
    # Price movement simulation (random walk with slight upward trend)
    import random
    random.seed(42)  # For reproducibility
    
    # Monthly snapshots
    while current_date <= end_date:
        # Simulate price movement (±2% per month, slight upward trend)
        price_change_pct = (random.random() - 0.4) * 0.04  # -2% to +2%, slightly positive
        current_price = current_price * (Decimal('1.0') + Decimal(str(price_change_pct)))
        current_price = max(current_price, Decimal('20.00'))  # Floor at $20
        current_price = min(current_price, Decimal('30.00'))  # Ceiling at $30
        
        # Monthly purchase (if not first snapshot)
        if current_date > start_date:
            # Purchase ~10-20 shares per month
            shares_to_buy = Decimal(str(random.randint(10, 20)))
            purchase_price = current_price * Decimal('0.98')  # Buy slightly below market
            purchase_cost = shares_to_buy * purchase_price
            
            current_shares += shares_to_buy
            total_cost_basis += purchase_cost
        
        # Calculate current value
        current_value = current_shares * current_price
        
        # Get total dividends paid up to this date
        total_dividends = db.query(Dividend).filter(
            Dividend.user_id == user.id,
            Dividend.status == DividendStatus.PAID,
            Dividend.pay_date <= current_date.date()
        ).all()
        dividends_paid = sum(float(d.amount) for d in total_dividends)
        
        # Create portfolio snapshot
        portfolio_snapshot = PortfolioSnapshot(
            user_id=user.id,
            total_value=current_value + Decimal(str(dividends_paid)),
            cash_balance=Decimal('0.00'),
            investment_value=current_value,
            timestamp=current_date
        )
        db.add(portfolio_snapshot)
        db.flush()  # Get the ID
        
        # Create position snapshot
        position_snapshot = PositionSnapshot(
            portfolio_snapshot_id=portfolio_snapshot.id,
            ticker="STRC",
            shares=current_shares,
            cost_basis=total_cost_basis,
            current_value=current_value,
            price_per_share=current_price
        )
        db.add(position_snapshot)
        
        snapshots.append(portfolio_snapshot)
        
        # Move to next month
        current_date = current_date + timedelta(days=30)
    
    return snapshots


def update_asset_price(db: Session, symbol: str, price: Decimal):
    """Update or create asset price"""
    asset_price = db.query(AssetPrice).filter(AssetPrice.symbol == symbol.upper()).first()
    if asset_price:
        asset_price.price = price
        asset_price.updated_at = datetime.utcnow()
    else:
        asset_price = AssetPrice(
            symbol=symbol.upper(),
            price=price,
            updated_at=datetime.utcnow()
        )
        db.add(asset_price)


def main():
    """Main function to create synthetic data"""
    db: Session = SessionLocal()
    
    try:
        # Get active user
        user = get_active_user(db)
        logger.info(f"Creating synthetic data for user: {user.email} (ID: {user.id})")
        
        # Get or create STRC position
        position = db.query(Position).filter(
            Position.user_id == user.id,
            Position.ticker == "STRC"
        ).first()
        
        if not position:
            logger.info("Creating STRC position...")
            position = Position(
                user_id=user.id,
                ticker="STRC",
                name="STRC Preferred Stock",
                shares=Decimal('0.00'),
                cost_basis=Decimal('0.00'),
                market_value=Decimal('0.00'),
                asset_type="preferred_stock",
                snapshot_timestamp=datetime.utcnow()
            )
            db.add(position)
            db.flush()
        
        # Calculate date range (6 months back to now)
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=180)  # 6 months
        
        # Create historical dividends (quarterly, going back 1 year)
        logger.info("Creating historical dividends...")
        dividend_start_date = date.today() - timedelta(days=90)  # Start 3 months ago
        dividends = create_historical_dividends(db, user, position, dividend_start_date)
        logger.info(f"Created {len(dividends)} historical dividends")
        
        # Create historical snapshots (monthly, going back 6 months)
        logger.info("Creating historical portfolio snapshots...")
        snapshots = create_historical_snapshots(
            db,
            user,
            start_date,
            end_date,
            initial_shares=0.0,
            initial_price=Decimal('25.00')
        )
        logger.info(f"Created {len(snapshots)} historical snapshots")
        
        # Update current position to match last snapshot
        if snapshots:
            last_snapshot = snapshots[-1]
            last_position_snapshot = db.query(PositionSnapshot).filter(
                PositionSnapshot.portfolio_snapshot_id == last_snapshot.id
            ).first()
            
            if last_position_snapshot:
                position.shares = last_position_snapshot.shares
                position.cost_basis = last_position_snapshot.cost_basis
                position.market_value = last_position_snapshot.current_value
                position.snapshot_timestamp = last_snapshot.timestamp
                position.updated_at = datetime.utcnow()
                
                # Update asset price
                update_asset_price(db, "STRC", last_position_snapshot.price_per_share)
                logger.info(f"Updated current position: {position.shares} shares @ ${last_position_snapshot.price_per_share}")
                
                # Commit position update
                db.commit()
        
        # Commit all changes
        db.commit()
        logger.info("✅ Successfully created synthetic data!")
        logger.info(f"   - {len(dividends)} dividends")
        logger.info(f"   - {len(snapshots)} portfolio snapshots")
        logger.info(f"   - Current position: {position.shares} shares")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating synthetic data: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

