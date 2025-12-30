"""
Seed the database with sample data for development/testing
WARNING: This will add data to the database. Make sure you're not using production!
"""
import sys
import os
from pathlib import Path
from datetime import datetime, date, timedelta
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models import User, Brokerage, Account, Position, Dividend, ExDate
from app.models.dividend import DividendStatus
from app.core.security import get_password_hash
from app.core.config import settings


def confirm_not_production():
    """Verify this is not a production database"""
    db_url = settings.DATABASE_URL.lower()
    
    # Check for production indicators
    production_indicators = [
        'prod',
        'production',
        'amazonaws.com',
        'heroku',
        'railway',
        'render.com'
    ]
    
    is_production = any(indicator in db_url for indicator in production_indicators)
    is_localhost = 'localhost' in db_url or '127.0.0.1' in db_url
    
    print("=" * 60)
    print("DATABASE SEED SCRIPT")
    print("=" * 60)
    print(f"Database URL: {settings.DATABASE_URL}")
    print(f"Is localhost: {is_localhost}")
    print(f"DEBUG mode: {settings.DEBUG}")
    print(f"Plaid ENV: {settings.PLAID_ENV}")
    print("=" * 60)
    
    if is_production:
        print("❌ ERROR: This appears to be a PRODUCTION database!")
        print("   Refusing to seed production data.")
        sys.exit(1)
    
    if not is_localhost:
        response = input("⚠️  WARNING: Database is not localhost. Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            sys.exit(0)
    
    print("✅ Database appears to be local/development. Proceeding...")
    print()


def seed_database():
    """Seed database with sample data"""
    db = SessionLocal()
    
    try:
        # Create sample user
        user = User(
            email="demo@example.com",
            hashed_password=get_password_hash("demo123"),
            full_name="Demo User",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"✅ Created user: {user.email} (ID: {user.id})")
        
        # Create brokerages
        brokerages_data = [
            {"name": "Fidelity Investments"},
            {"name": "Charles Schwab"},
        ]
        
        brokerages = []
        for br_data in brokerages_data:
            brokerage = Brokerage(
                user_id=user.id,
                **br_data
            )
            db.add(brokerage)
            brokerages.append(brokerage)
        
        db.commit()
        for brokerage in brokerages:
            db.refresh(brokerage)
            print(f"✅ Created brokerage: {brokerage.name} (ID: {brokerage.id})")
        
        # Create accounts
        accounts_data = [
            {
                "brokerage_id": brokerages[0].id,
                "plaid_account_id": "acc_sample_fidelity_ira",
                "name": "Fidelity IRA",
                "type": "investment",
                "subtype": "ira",
                "balance": Decimal("125000.00")
            },
            {
                "brokerage_id": brokerages[0].id,
                "plaid_account_id": "acc_sample_fidelity_brokerage",
                "name": "Fidelity Brokerage Account",
                "type": "investment",
                "subtype": "brokerage",
                "balance": Decimal("75000.00")
            },
            {
                "brokerage_id": brokerages[1].id,
                "plaid_account_id": "acc_sample_schwab_401k",
                "name": "Schwab 401(k)",
                "type": "investment",
                "subtype": "401k",
                "balance": Decimal("200000.00")
            },
        ]
        
        accounts = []
        for acc_data in accounts_data:
            account = Account(
                user_id=user.id,
                **acc_data
            )
            db.add(account)
            accounts.append(account)
        
        db.commit()
        for account in accounts:
            db.refresh(account)
            print(f"✅ Created account: {account.name} (ID: {account.id}, Balance: ${account.balance:,.2f})")
        
        # Create positions (focused on preferred stocks like STRC, SATA, MSTR preferreds)
        positions_data = [
            {
                "account_id": accounts[0].id,
                "ticker": "STRC",
                "name": "Starco Preferred Stock",
                "shares": Decimal("100.000000"),
                "cost_basis": Decimal("10000.00"),
                "market_value": Decimal("10500.00"),
                "asset_type": "preferred_stock"
            },
            {
                "account_id": accounts[0].id,
                "ticker": "SATA",
                "name": "Sata Preferred Stock",
                "shares": Decimal("50.000000"),
                "cost_basis": Decimal("5000.00"),
                "market_value": Decimal("5250.00"),
                "asset_type": "preferred_stock"
            },
            {
                "account_id": accounts[0].id,
                "ticker": "MSTR-A",
                "name": "MicroStrategy Preferred Series A",
                "shares": Decimal("25.000000"),
                "cost_basis": Decimal("2500.00"),
                "market_value": Decimal("2625.00"),
                "asset_type": "preferred_stock"
            },
            {
                "account_id": accounts[1].id,
                "ticker": "AAPL",
                "name": "Apple Inc.",
                "shares": Decimal("10.000000"),
                "cost_basis": Decimal("1500.00"),
                "market_value": Decimal("1750.00"),
                "asset_type": "common_stock"
            },
            {
                "account_id": accounts[1].id,
                "ticker": "MSFT",
                "name": "Microsoft Corporation",
                "shares": Decimal("5.000000"),
                "cost_basis": Decimal("1500.00"),
                "market_value": Decimal("1750.00"),
                "asset_type": "common_stock"
            },
            {
                "account_id": accounts[2].id,
                "ticker": "STRC",
                "name": "Starco Preferred Stock",
                "shares": Decimal("200.000000"),
                "cost_basis": Decimal("20000.00"),
                "market_value": Decimal("21000.00"),
                "asset_type": "preferred_stock"
            },
        ]
        
        positions = []
        for pos_data in positions_data:
            position = Position(
                user_id=user.id,
                snapshot_timestamp=datetime.utcnow(),
                **pos_data
            )
            db.add(position)
            positions.append(position)
        
        db.commit()
        for position in positions:
            db.refresh(position)
            print(f"✅ Created position: {position.ticker} - {position.shares} shares @ ${position.cost_basis:,.2f} cost basis")
        
        # Create dividends (past and upcoming)
        today = date.today()
        dividends_data = [
            {
                "position_id": positions[0].id,  # STRC
                "ticker": "STRC",
                "amount": Decimal("250.0000"),
                "pay_date": today - timedelta(days=30),
                "status": DividendStatus.PAID,
                "dividend_per_share": Decimal("2.5000"),
                "shares_at_ex_date": Decimal("100.000000"),
                "ex_date": today - timedelta(days=45),
                "source": "manual"
            },
            {
                "position_id": positions[0].id,  # STRC
                "ticker": "STRC",
                "amount": Decimal("250.0000"),
                "pay_date": today + timedelta(days=30),
                "status": DividendStatus.UPCOMING,
                "dividend_per_share": Decimal("2.5000"),
                "shares_at_ex_date": Decimal("100.000000"),
                "ex_date": today + timedelta(days=15),
                "source": "manual"
            },
            {
                "position_id": positions[1].id,  # SATA
                "ticker": "SATA",
                "amount": Decimal("125.0000"),
                "pay_date": today - timedelta(days=20),
                "status": DividendStatus.PAID,
                "dividend_per_share": Decimal("2.5000"),
                "shares_at_ex_date": Decimal("50.000000"),
                "ex_date": today - timedelta(days=35),
                "source": "manual"
            },
            {
                "position_id": positions[2].id,  # MSTR-A
                "ticker": "MSTR-A",
                "amount": Decimal("62.5000"),
                "pay_date": today + timedelta(days=45),
                "status": DividendStatus.UPCOMING,
                "dividend_per_share": Decimal("2.5000"),
                "shares_at_ex_date": Decimal("25.000000"),
                "ex_date": today + timedelta(days=30),
                "source": "manual"
            },
            {
                "position_id": positions[5].id,  # STRC in 401k
                "ticker": "STRC",
                "amount": Decimal("500.0000"),
                "pay_date": today + timedelta(days=30),
                "status": DividendStatus.UPCOMING,
                "dividend_per_share": Decimal("2.5000"),
                "shares_at_ex_date": Decimal("200.000000"),
                "ex_date": today + timedelta(days=15),
                "source": "manual"
            },
        ]
        
        for div_data in dividends_data:
            dividend = Dividend(
                user_id=user.id,
                **div_data
            )
            db.add(dividend)
        
        db.commit()
        print(f"✅ Created {len(dividends_data)} dividend records")
        
        # Create ex-dates
        ex_dates_data = [
            {
                "ticker": "STRC",
                "ex_date": today + timedelta(days=15),
                "dividend_amount": Decimal("2.5000"),
                "pay_date": today + timedelta(days=30),
                "source": "manual",
                "notes": "Quarterly dividend"
            },
            {
                "ticker": "SATA",
                "ex_date": today + timedelta(days=60),
                "dividend_amount": Decimal("2.5000"),
                "pay_date": today + timedelta(days=75),
                "source": "manual",
                "notes": "Quarterly dividend"
            },
            {
                "ticker": "MSTR-A",
                "ex_date": today + timedelta(days=30),
                "dividend_amount": Decimal("2.5000"),
                "pay_date": today + timedelta(days=45),
                "source": "manual",
                "notes": "Quarterly dividend"
            },
        ]
        
        for ex_data in ex_dates_data:
            ex_date = ExDate(
                user_id=user.id,
                **ex_data
            )
            db.add(ex_date)
        
        db.commit()
        print(f"✅ Created {len(ex_dates_data)} ex-date records")
        
        print()
        print("=" * 60)
        print("✅ DATABASE SEEDED SUCCESSFULLY!")
        print("=" * 60)
        print(f"📧 Login credentials:")
        print(f"   Email: demo@example.com")
        print(f"   Password: demo123")
        print()
        print(f"📊 Summary:")
        print(f"   Users: 1")
        print(f"   Brokerages: {len(brokerages)}")
        print(f"   Accounts: {len(accounts)}")
        print(f"   Positions: {len(positions)}")
        print(f"   Dividends: {len(dividends_data)}")
        print(f"   Ex-Dates: {len(ex_dates_data)}")
        print("=" * 60)
        
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error seeding database: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    confirm_not_production()
    seed_database()

