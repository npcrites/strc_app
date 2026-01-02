"""
Script to:
1. Wipe all data for user_id = 3
2. Create user_id = 4 with demo@example.com / demo123
3. Create dummy data: weekly STRC purchases + monthly dividends
"""
import sys
from pathlib import Path
from datetime import date, datetime, timedelta
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, engine
from app.models import User, Position, Dividend, DividendStatus, ExDate
from app.core.security import get_password_hash
from sqlalchemy import text


def wipe_user_data(db, user_id: int):
    """Delete all data for a specific user"""
    print(f"🗑️  Wiping all data for user_id = {user_id}...")
    
    # Delete in order to respect foreign key constraints
    db.query(Dividend).filter(Dividend.user_id == user_id).delete()
    db.query(Position).filter(Position.user_id == user_id).delete()
    db.query(ExDate).filter(ExDate.user_id == user_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    
    db.commit()
    print(f"✅ Deleted all data for user_id = {user_id}")


def create_demo_user(db):
    """Create user with id = 4"""
    print("👤 Creating demo user (id=4)...")
    
    # Check if user 4 already exists
    existing = db.query(User).filter(User.id == 4).first()
    if existing:
        print("⚠️  User 4 already exists, deleting...")
        wipe_user_data(db, 4)
    
    # Reset sequence if needed to allow id = 4
    # First check current max id
    max_id_result = db.execute(text("SELECT COALESCE(MAX(id), 0) FROM users"))
    max_id = max_id_result.scalar()
    
    if max_id < 4:
        # Set sequence to start after 4
        db.execute(text("SELECT setval('users_id_seq', 4, false)"))
        db.commit()
    
    # Create user
    user = User(
        id=4,
        email="demo@example.com",
        hashed_password=get_password_hash("demo123"),
        full_name="Demo User",
        is_active=True
    )
    db.add(user)
    db.flush()  # Get the ID without committing
    db.refresh(user)
    
    print(f"✅ Created user: {user.email} (id={user.id})")
    return user


def create_demo_data(db, user):
    """Create dummy data for demo user"""
    print("📊 Creating dummy data...")
    
    # Weekly purchases starting Jan 1, 2025
    # Purchase $100 worth per week (roughly 1 share, assuming ~$100/share)
    start_date = date(2025, 1, 1)
    end_date = date.today()
    
    # Price per share (assuming STRC is around $100/share)
    price_per_share = Decimal("100.00")
    weekly_purchase_amount = Decimal("100.00")
    shares_per_week = weekly_purchase_amount / price_per_share  # ~1 share per week
    
    # Calculate weeks
    current_date = start_date
    week_number = 0
    total_shares = Decimal("0")
    total_cost_basis = Decimal("0")
    positions_created = []
    
    print(f"📈 Creating weekly STRC purchases from {start_date}...")
    print(f"   Purchase amount: ${weekly_purchase_amount} per week (~{shares_per_week:.2f} shares)")
    
    while current_date <= end_date:
        # Purchase $100 worth this week
        shares_purchased = shares_per_week
        total_shares += shares_purchased
        total_cost_basis += weekly_purchase_amount
        
        # Market value = current shares * price
        market_value = total_shares * price_per_share
        
        # Create or update position
        # Find existing position for this user and ticker
        existing_position = db.query(Position).filter(
            Position.user_id == user.id,
            Position.ticker == "STRC"
        ).first()
        
        if existing_position:
            # Update existing position
            existing_position.shares = total_shares
            existing_position.cost_basis = total_cost_basis
            existing_position.market_value = market_value
            existing_position.snapshot_timestamp = datetime.combine(current_date, datetime.min.time())
            position = existing_position
        else:
            # Create new position
            position = Position(
                user_id=user.id,
                ticker="STRC",
                name="STRC Preferred Stock",
                shares=total_shares,
                cost_basis=total_cost_basis,
                market_value=market_value,
                asset_type="preferred_stock",
                snapshot_timestamp=datetime.combine(current_date, datetime.min.time())
            )
            db.add(position)
            db.flush()
            db.refresh(position)
        
        positions_created.append((current_date, total_shares))
        week_number += 1
        
        # Move to next week (7 days)
        current_date += timedelta(days=7)
    
    db.commit()
    print(f"✅ Created {week_number} weekly purchase records")
    print(f"   Total shares accumulated: {total_shares:.6f}")
    print(f"   Total cost basis: ${total_cost_basis:.2f}")
    
    # Monthly dividends: 0.916% of total STRC value owned on the 1st of each month
    # Paid on the 15th of each month
    print(f"💰 Creating monthly dividends...")
    
    # Create 13 dividends: Jan 15, 2025 through Jan 15, 2026
    dividends_created = 0
    price_per_share = Decimal("100.00")  # Same as purchase price
    shares_per_week = weekly_purchase_amount / price_per_share  # 1.0 share per week
    
    # Start from January 15, 2025 (first dividend)
    dividend_pay_date = date(2025, 1, 15)
    
    # Create 13 dividends (Jan 2025 through Jan 2026)
    for month_num in range(13):
        # Calculate the 1st of this month to determine shares owned
        if month_num == 0:
            # January 2025
            month_first = date(2025, 1, 1)
        else:
            # Calculate month and year
            year = 2025 + (month_num // 12)
            month = (month_num % 12) + 1
            if month == 12:
                month_first = date(year, 12, 1)
            else:
                month_first = date(year, month, 1)
        
        # Calculate shares owned on the 1st of this month
        # Purchases happen weekly starting Jan 1, 2025
        # On Jan 1, first purchase happens, so shares = 1
        # Count how many complete weeks have passed INCLUDING the purchase on the 1st
        days_from_start = (month_first - start_date).days
        
        if days_from_start < 0:
            # Before first purchase, no shares
            shares_on_first = Decimal("0")
        else:
            # Calculate complete weeks (including the week starting on Jan 1)
            # If it's Jan 1, that's week 0 (0 complete weeks), but first purchase happens on Jan 1
            # So we need to count: if days_from_start == 0, that's 1 share (first purchase)
            # If days_from_start >= 7, that's (days_from_start // 7) + 1 shares
            if days_from_start == 0:
                shares_on_first = shares_per_week  # First purchase on Jan 1
            else:
                # Complete weeks + 1 (for the first purchase on Jan 1)
                complete_weeks = (days_from_start // 7) + 1
                shares_on_first = Decimal(str(complete_weeks)) * shares_per_week
        
        # Calculate dividend: 0.916% of total value owned on the 1st
        total_value = shares_on_first * price_per_share
        dividend_amount = total_value * Decimal("0.00916")  # 0.916%
        
        # Ex-date is 15 days before pay date
        ex_date = dividend_pay_date - timedelta(days=15)
        
        # Check if dividend already exists
        existing_dividend = db.query(Dividend).filter(
            Dividend.user_id == user.id,
            Dividend.ticker == "STRC",
            Dividend.pay_date == dividend_pay_date
        ).first()
        
        if not existing_dividend:
            dividend = Dividend(
                user_id=user.id,
                position_id=position.id,
                ticker="STRC",
                amount=dividend_amount,
                pay_date=dividend_pay_date,
                ex_date=ex_date,
                status=DividendStatus.PAID if dividend_pay_date < date.today() else DividendStatus.UPCOMING,
                shares_at_ex_date=shares_on_first,
                dividend_per_share=dividend_amount / shares_on_first if shares_on_first > 0 else Decimal("0"),
                source="manual"
            )
            db.add(dividend)
            dividends_created += 1
            print(f"   Created dividend for {dividend_pay_date}: {shares_on_first:.6f} shares = ${dividend_amount:.2f}")
        
        # Move to next month (15th of next month)
        if dividend_pay_date.month == 12:
            dividend_pay_date = date(dividend_pay_date.year + 1, 1, 15)
        else:
            dividend_pay_date = date(dividend_pay_date.year, dividend_pay_date.month + 1, 15)
    
    db.commit()
    print(f"✅ Created {dividends_created} monthly dividend records")
    
    return {
        "position": position,
        "total_shares": total_shares,
        "dividends_created": dividends_created
    }


def main():
    """Main execution"""
    db = SessionLocal()
    
    try:
        # Step 1: Wipe user 3
        wipe_user_data(db, 3)
        
        # Step 2: Create user 4
        user = create_demo_user(db)
        
        # Step 3: Create dummy data
        data = create_demo_data(db, user)
        
        # Summary
        print("\n" + "="*60)
        print("✅ DEMO USER SETUP COMPLETE")
        print("="*60)
        print(f"User ID: {user.id}")
        print(f"Email: {user.email}")
        print(f"Password: demo123")
        print(f"\nData Created:")
        print(f"  - Total STRC Shares: {data['total_shares']}")
        print(f"  - Monthly Dividends: {data['dividends_created']}")
        print("="*60)
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

