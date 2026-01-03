"""
Create a demo user with STRC positions bought monthly
"""
import sys
from pathlib import Path
from datetime import datetime, timedelta, date
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from sqlalchemy import func

def create_demo_user_with_strc():
    """Create demo user with STRC positions bought monthly for the past 12 months"""
    db = SessionLocal()
    
    try:
        # Check if demo user already exists
        demo_user = db.query(User).filter(User.email == "demo@example.com").first()
        
        if demo_user:
            print(f"Demo user already exists (ID: {demo_user.id})")
            print("Deleting existing demo user and recreating...")
            db.delete(demo_user)
            db.commit()
        
        # Create demo user (no password since we're using OAuth bypass)
        demo_user = User(
            email="demo@example.com",
            full_name="Demo User",
            is_active=True
        )
        db.add(demo_user)
        db.commit()
        db.refresh(demo_user)
        
        print(f"✅ Created demo user: {demo_user.email} (ID: {demo_user.id})")
        
        # Create STRC positions bought monthly (last 12 months)
        # Each month: buy $100 worth of STRC
        # Assume STRC price around $10/share (so ~10 shares per month)
        current_date = datetime.utcnow()
        total_shares = Decimal('0')
        total_cost_basis = Decimal('0')
        positions_created = []
        
        # Price per share (assume $10)
        price_per_share = Decimal('10.00')
        monthly_investment = Decimal('100.00')  # $100 per month
        shares_per_month = monthly_investment / price_per_share  # ~10 shares
        
        for month_offset in range(12, 0, -1):  # Last 12 months
            purchase_date = current_date - timedelta(days=30 * month_offset)
            
            # Accumulate shares and cost basis
            total_shares += shares_per_month
            total_cost_basis += monthly_investment
            
            # Create position snapshot for this purchase
            # Use current market value (assume price increased to $10.50)
            current_price = Decimal('10.50')
            market_value = total_shares * current_price
            
            position = Position(
                user_id=demo_user.id,
                ticker="STRC",
                name="Starco Preferred Stock",
                shares=total_shares,
                cost_basis=total_cost_basis,
                market_value=market_value,
                asset_type="preferred_stock",
                snapshot_timestamp=purchase_date
            )
            db.add(position)
            positions_created.append(position)
            
        db.commit()
        
        # Create current position (latest snapshot)
        latest_position = Position(
            user_id=demo_user.id,
            ticker="STRC",
            name="Starco Preferred Stock",
            shares=total_shares,
            cost_basis=total_cost_basis,
            market_value=total_shares * Decimal('10.50'),
            asset_type="preferred_stock",
            snapshot_timestamp=current_date
        )
        db.add(latest_position)
        db.commit()
        
        print(f"✅ Created {len(positions_created) + 1} position snapshots")
        print(f"   Total shares: {total_shares}")
        print(f"   Total cost basis: ${total_cost_basis}")
        print(f"   Current market value: ${total_shares * Decimal('10.50')}")
        
        # Create some dividend records (quarterly dividends)
        # Assume $0.25 per share quarterly dividend
        dividend_per_share = Decimal('0.25')
        
        for quarter in range(4):  # Last 4 quarters
            pay_date = current_date - timedelta(days=90 * (3 - quarter))
            ex_date = pay_date - timedelta(days=7)  # Ex-date is 7 days before pay date
            
            # Calculate shares at ex-date (approximate)
            shares_at_ex_date = total_shares * Decimal('0.7') + (Decimal(str(quarter)) * shares_per_month)
            if shares_at_ex_date > total_shares:
                shares_at_ex_date = total_shares
            
            dividend_amount = shares_at_ex_date * dividend_per_share
            
            dividend = Dividend(
                user_id=demo_user.id,
                position_id=latest_position.id,
                ticker="STRC",
                amount=dividend_amount,
                pay_date=pay_date.date(),
                ex_date=ex_date.date(),
                dividend_per_share=dividend_per_share,
                shares_at_ex_date=shares_at_ex_date,
                status=DividendStatus.PAID if pay_date < current_date else DividendStatus.UPCOMING,
                source="demo"
            )
            db.add(dividend)
        
        db.commit()
        print(f"✅ Created 4 dividend records")
        
        print("\n" + "=" * 60)
        print("✅ DEMO USER CREATED SUCCESSFULLY!")
        print("=" * 60)
        print(f"Email: demo@example.com")
        print(f"User ID: {demo_user.id}")
        print(f"STRC Positions: {len(positions_created) + 1} snapshots")
        print(f"Total STRC Shares: {total_shares}")
        print(f"Total Cost Basis: ${total_cost_basis}")
        print(f"Current Market Value: ${total_shares * Decimal('10.50')}")
        print(f"Dividends: 4 records")
        print("=" * 60)
        print("\nUse the 'Demo Login' button to login (bypasses OAuth)")
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error creating demo user: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Creating demo user with STRC monthly purchases...")
    create_demo_user_with_strc()

