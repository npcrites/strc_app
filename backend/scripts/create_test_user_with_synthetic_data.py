"""
Script to create a test user with synthetic data for graph testing
Creates 60 data points over the past year
"""
import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal
import random

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.position import Position
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot as PositionSnapshotModel
from app.models.dividend import Dividend, DividendStatus
from app.models.asset_price import AssetPrice
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_test_user_with_data():
    """Create a test user with 60 synthetic data points over the past year"""
    db = SessionLocal()
    
    try:
        # Create test user (no Alpaca credentials)
        test_email = "test_graph_user@example.com"
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == test_email).first()
        if existing_user:
            logger.warning(f"Test user {test_email} already exists. Use remove_test_user.py to delete first.")
            return
        
        logger.info(f"Creating test user: {test_email}")
        test_user = User(
            email=test_email,
            full_name="Test Graph User",
            is_active=True,
            # No Alpaca credentials - this is a synthetic test user
            alpaca_access_token=None,
            alpaca_refresh_token=None,
            alpaca_account_id=None,
            alpaca_account_number=None,
            alpaca_account_status=None,
            alpaca_trading_blocked=False,
        )
        db.add(test_user)
        db.flush()
        logger.info(f"✅ Created test user: ID {test_user.id}")
        
        # Create a position for STRC
        logger.info("Creating STRC position...")
        strc_position = Position(
            user_id=test_user.id,
            ticker="STRC",
            name="STRC Preferred Stock",
            shares=Decimal('100.00'),  # Start with 100 shares
            cost_basis=Decimal('10000.00'),  # $100 per share average
            market_value=Decimal('10000.00'),
            asset_type="preferred_stock",
            snapshot_timestamp=datetime.utcnow()
        )
        db.add(strc_position)
        db.flush()
        logger.info(f"✅ Created STRC position: {strc_position.shares} shares")
        
        # Get or create asset price for STRC
        strc_price = db.query(AssetPrice).filter(AssetPrice.symbol == "STRC").first()
        if not strc_price:
            strc_price = AssetPrice(
                symbol="STRC",
                price=100.00,
                updated_at=datetime.utcnow()
            )
            db.add(strc_price)
            db.flush()
        else:
            # Update existing price
            strc_price.price = 100.00
            strc_price.updated_at = datetime.utcnow()
        
        # Create 60 portfolio snapshots over the past year
        # That's roughly one every 6 days
        now = datetime.utcnow()
        one_year_ago = now - timedelta(days=365)
        days_between = 365 / 60  # ~6 days between snapshots
        
        logger.info(f"Creating 60 portfolio snapshots from {one_year_ago.date()} to {now.date()}...")
        
        # Simulate price movement: start at $100, fluctuate with some trend
        base_price = 100.0
        current_price = base_price
        shares = 100.0
        total_value = shares * current_price
        
        snapshots = []
        for i in range(60):
            # Calculate timestamp (spread evenly over the year)
            days_offset = i * days_between
            snapshot_time = one_year_ago + timedelta(days=days_offset)
            
            # Simulate price movement (random walk with slight upward trend)
            price_change = random.uniform(-2.0, 3.0)  # Slight upward bias
            current_price = max(80.0, min(120.0, current_price + price_change))  # Keep between $80-$120
            
            # Occasionally add shares (simulate purchases)
            if i > 0 and i % 15 == 0:  # Every ~3 months, add 10 shares
                shares += 10.0
                logger.info(f"  Snapshot {i+1}: Adding 10 shares (now {shares} shares)")
            
            total_value = shares * current_price
            
            # Create portfolio snapshot
            portfolio_snapshot = PortfolioSnapshot(
                user_id=test_user.id,
                total_value=Decimal(str(total_value)),
                cash_balance=Decimal('0.00'),
                investment_value=Decimal(str(total_value)),
                timestamp=snapshot_time
            )
            db.add(portfolio_snapshot)
            db.flush()
            
            # Create position snapshot
            position_snapshot = PositionSnapshotModel(
                portfolio_snapshot_id=portfolio_snapshot.id,
                ticker="STRC",
                shares=Decimal(str(shares)),
                cost_basis=Decimal(str(shares * 100.0)),  # Cost basis at $100/share
                current_value=Decimal(str(total_value)),
                price_per_share=Decimal(str(current_price))
            )
            db.add(position_snapshot)
            
            snapshots.append(portfolio_snapshot)
            
            if (i + 1) % 10 == 0:
                logger.info(f"  Created {i+1}/60 snapshots...")
        
        # Update asset price to current
        strc_price.price = current_price
        strc_price.updated_at = now
        
        # Update position to final state
        strc_position.shares = Decimal(str(shares))
        strc_position.market_value = Decimal(str(total_value))
        strc_position.cost_basis = Decimal(str(shares * 100.0))
        
        # Create a few synthetic dividends (quarterly)
        logger.info("Creating synthetic dividends...")
        dividend_dates = [
            one_year_ago + timedelta(days=90),
            one_year_ago + timedelta(days=180),
            one_year_ago + timedelta(days=270),
            now - timedelta(days=30),  # Recent dividend
        ]
        
        for div_date in dividend_dates:
            if div_date <= now:
                # Calculate shares at dividend time (approximate)
                div_shares = 100.0
                if div_date > one_year_ago + timedelta(days=180):
                    div_shares = 110.0
                if div_date > one_year_ago + timedelta(days=270):
                    div_shares = 120.0
                
                dividend_amount = div_shares * 0.50  # $0.50 per share
                
                dividend = Dividend(
                    user_id=test_user.id,
                    position_id=strc_position.id,
                    ticker="STRC",
                    amount=Decimal(str(dividend_amount)),
                    pay_date=div_date.date(),
                    status=DividendStatus.PAID,
                    dividend_per_share=Decimal('0.50'),
                    shares_at_ex_date=Decimal(str(div_shares)),
                    ex_date=(div_date - timedelta(days=14)).date(),  # Ex-date 2 weeks before
                    source="synthetic_test",
                    notes="Synthetic dividend for graph testing"
                )
                db.add(dividend)
        
        db.commit()
        
        logger.info("✅ Successfully created test user with synthetic data!")
        logger.info(f"   User ID: {test_user.id}")
        logger.info(f"   Email: {test_email}")
        logger.info(f"   Portfolio snapshots: {len(snapshots)}")
        logger.info(f"   Position: {shares} shares of STRC")
        logger.info(f"   Current value: ${total_value:.2f}")
        logger.info(f"   Dividends: {len(dividend_dates)}")
        logger.info(f"\n   To remove this user and all data, run:")
        logger.info(f"   python scripts/remove_test_user.py")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error creating test user: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_test_user_with_data()

