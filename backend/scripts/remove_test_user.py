"""
Script to remove the test user and all their synthetic data
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot as PositionSnapshotModel
from app.models.dividend import Dividend
from app.models.position import Position
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def remove_test_user():
    """Remove test user and all their data"""
    db = SessionLocal()
    
    try:
        test_email = "test_graph_user@example.com"
        
        # Find test user
        test_user = db.query(User).filter(User.email == test_email).first()
        
        if not test_user:
            logger.warning(f"Test user {test_email} not found")
            return
        
        user_id = test_user.id
        logger.info(f"Found test user: ID {user_id}, Email: {test_email}")
        
        # Count data to be deleted
        portfolio_count = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user_id
        ).count()
        
        position_count = db.query(Position).filter(
            Position.user_id == user_id
        ).count()
        
        dividend_count = db.query(Dividend).filter(
            Dividend.user_id == user_id
        ).count()
        
        logger.info(f"Data to be deleted:")
        logger.info(f"  - Portfolio snapshots: {portfolio_count}")
        logger.info(f"  - Positions: {position_count}")
        logger.info(f"  - Dividends: {dividend_count}")
        
        # Delete user (cascades to all related data)
        db.delete(test_user)
        db.commit()
        
        logger.info("✅ Successfully removed test user and all associated data!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error removing test user: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    remove_test_user()

