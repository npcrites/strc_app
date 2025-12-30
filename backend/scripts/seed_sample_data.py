"""
Seed the database with sample data for development/testing
WARNING: This will add data to the database. Make sure you're not using production!

This script uses the MockDataFactory for standardized mock data generation.
"""
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.core.config import settings
from scripts.mock_data_factory import MockDataFactory


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


def seed_database(overwrite: bool = False):
    """
    Seed database with sample data using MockDataFactory.
    
    Args:
        overwrite: If True, delete existing user and recreate
    """
    db = SessionLocal()
    
    try:
        print("🌱 Seeding database with mock data...")
        print()
        
        # Use MockDataFactory to create complete portfolio
        result = MockDataFactory.create_complete_portfolio(
            db,
            user_email="demo@example.com",
            user_password="demo123",
            overwrite=overwrite
        )
        
        summary = result["summary"]
        
        print()
        print("=" * 60)
        print("✅ DATABASE SEEDED SUCCESSFULLY!")
        print("=" * 60)
        print(f"📧 Login credentials:")
        print(f"   Email: {summary['user_email']}")
        print(f"   Password: demo123")
        print()
        print(f"📊 Summary:")
        print(f"   Users: 1 (ID: {summary['user_id']})")
        print(f"   Brokerages: {summary['brokerages_count']}")
        print(f"   Accounts: {summary['accounts_count']}")
        print(f"   Positions: {summary['positions_count']}")
        print(f"   Dividends: {summary['dividends_count']}")
        print(f"   Ex-Dates: {summary['ex_dates_count']}")
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
    import argparse
    
    parser = argparse.ArgumentParser(description="Seed database with sample data")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Delete existing demo user and recreate (WARNING: This will delete all user data!)"
    )
    args = parser.parse_args()
    
    confirm_not_production()
    seed_database(overwrite=args.overwrite)

