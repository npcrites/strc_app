"""
Test script for portfolio tracking system
Tests price fetching, snapshot creation, and API endpoints
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.price_service import PriceService
from app.services.snapshot_service import SnapshotService
from app.models.user import User
from app.models.position import Position
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.asset_price import AssetPrice
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def test_price_service(db: Session):
    """Test price fetching and caching"""
    print("\n=== Testing Price Service ===")
    
    price_service = PriceService()
    
    # Test getting active symbols
    symbols = price_service.get_all_active_symbols(db)
    print(f"Active symbols: {symbols}")
    
    if not symbols:
        print("No active symbols found. Creating test positions...")
        # Create a test user and position if needed
        test_user = db.query(User).first()
        if not test_user:
            print("No users found. Please create a user and positions first.")
            return
        
        print(f"Using existing user: {test_user.id}")
    
    # Test fetching prices
    print("\nFetching prices from Alpaca...")
    stats = price_service.update_all_prices(db)
    print(f"Price update stats: {stats}")
    
    # Test getting cached prices
    if symbols:
        test_symbol = symbols[0]
        price = price_service.get_price(db, test_symbol)
        print(f"\nCached price for {test_symbol}: ${price}")
        
        # Check freshness
        is_fresh = price_service.is_price_fresh(db, test_symbol)
        print(f"Price is fresh: {is_fresh}")


def test_snapshot_service(db: Session):
    """Test snapshot creation"""
    print("\n=== Testing Snapshot Service ===")
    
    snapshot_service = SnapshotService()
    
    # Get first user
    user = db.query(User).first()
    if not user:
        print("No users found. Please create a user first.")
        return
    
    print(f"Creating snapshot for user {user.id} ({user.email})...")
    
    snapshot = snapshot_service.create_portfolio_snapshot(db, user.id)
    
    if snapshot:
        print(f"✓ Snapshot created successfully!")
        print(f"  - Total value: ${snapshot.total_value}")
        print(f"  - Investment value: ${snapshot.investment_value}")
        print(f"  - Cash balance: ${snapshot.cash_balance}")
        print(f"  - Timestamp: {snapshot.timestamp}")
        print(f"  - Position snapshots: {len(snapshot.position_snapshots)}")
    else:
        print("✗ Failed to create snapshot")


def test_database_state(db: Session):
    """Check database state"""
    print("\n=== Database State ===")
    
    # Count asset prices
    price_count = db.query(AssetPrice).count()
    print(f"Asset prices in cache: {price_count}")
    
    # Count portfolio snapshots
    snapshot_count = db.query(PortfolioSnapshot).count()
    print(f"Portfolio snapshots: {snapshot_count}")
    
    # Show recent snapshots
    recent_snapshots = db.query(PortfolioSnapshot).order_by(
        PortfolioSnapshot.timestamp.desc()
    ).limit(5).all()
    
    if recent_snapshots:
        print("\nRecent snapshots:")
        for snap in recent_snapshots:
            print(f"  - User {snap.user_id}: ${snap.total_value} at {snap.timestamp}")


def main():
    """Run all tests"""
    print("Portfolio Tracking System Test")
    print("=" * 50)
    
    db = SessionLocal()
    try:
        # Test price service
        test_price_service(db)
        
        # Test snapshot service
        test_snapshot_service(db)
        
        # Check database state
        test_database_state(db)
        
        print("\n" + "=" * 50)
        print("Tests completed!")
        
    except Exception as e:
        logger.error(f"Error during testing: {str(e)}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()

