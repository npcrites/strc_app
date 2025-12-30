#!/usr/bin/env python3
"""
Simple script to test database connection and run migrations
Run: python3 scripts/test_and_migrate.py
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect
from app.core.config import settings
from app.db.session import engine


def test_connection():
    """Test database connection"""
    print("🧪 Testing database connection...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Database connection successful!")
            return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print(f"\nCurrent DATABASE_URL: {settings.DATABASE_URL}")
        print("\n💡 Tips:")
        print("   1. Make sure PostgreSQL is running")
        print("   2. Check your .env file has the correct DATABASE_URL")
        print("   3. Verify the database exists: createdb strc_tracker")
        return False


def check_migration_status():
    """Check current migration status"""
    print("\n📊 Checking migration status...")
    try:
        from alembic.config import Config
        from alembic import command
        
        alembic_cfg = Config("alembic.ini")
        command.current(alembic_cfg)
        return True
    except Exception as e:
        print(f"⚠️  Could not check migration status: {e}")
        return False


def run_migrations():
    """Run database migrations"""
    print("\n📦 Running migrations...")
    try:
        from alembic.config import Config
        from alembic import command
        
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")
        print("✅ Migrations completed successfully!")
        return True
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


def verify_tables():
    """Verify tables were created"""
    print("\n📋 Verifying tables...")
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        expected_tables = ['users', 'brokerages', 'accounts', 'positions', 'dividends', 'ex_dates']
        missing = [t for t in expected_tables if t not in tables]
        
        if missing:
            print(f"⚠️  Missing tables: {', '.join(missing)}")
        else:
            print(f"✅ All {len(tables)} tables found:")
            for table in sorted(tables):
                print(f"   - {table}")
        return len(missing) == 0
    except Exception as e:
        print(f"❌ Error verifying tables: {e}")
        return False


def main():
    """Main function"""
    print("="*60)
    print("Database Connection and Migration Test")
    print("="*60)
    print(f"\nDatabase URL: {settings.DATABASE_URL}")
    print()
    
    # Test connection
    if not test_connection():
        sys.exit(1)
    
    # Check migration status
    check_migration_status()
    
    # Run migrations
    if not run_migrations():
        sys.exit(1)
    
    # Verify tables
    if not verify_tables():
        sys.exit(1)
    
    print("\n" + "="*60)
    print("✅ All checks passed! Database is ready.")
    print("="*60)


if __name__ == "__main__":
    main()

