"""
Script to remove AAPL positions from the database
Usage: python -m scripts.remove_aapl_positions [--user-email EMAIL]
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.models.position import Position
from app.models.dividend import Dividend
from app.models.user import User
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def remove_aapl_positions(user_email: str = None):
    """
    Remove all AAPL positions from the database.
    If user_email is provided, only remove AAPL positions for that user.
    Otherwise, remove AAPL positions for all users.
    """
    db = SessionLocal()
    
    try:
        # Build query
        query = db.query(Position).filter(Position.ticker == "AAPL")
        
        if user_email:
            # Find user by email
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                logger.error(f"User with email {user_email} not found")
                return
            query = query.filter(Position.user_id == user.id)
            logger.info(f"Removing AAPL positions for user: {user_email} (ID: {user.id})")
        else:
            logger.info("Removing AAPL positions for all users")
        
        # Find all AAPL positions
        aapl_positions = query.all()
        
        if not aapl_positions:
            logger.info("No AAPL positions found")
            return
        
        logger.info(f"Found {len(aapl_positions)} AAPL position(s) to delete")
        
        # Count related dividends (will be cascade deleted)
        position_ids = [pos.id for pos in aapl_positions]
        dividend_count = db.query(Dividend).filter(
            Dividend.position_id.in_(position_ids)
        ).count()
        
        if dividend_count > 0:
            logger.info(f"  - Will also delete {dividend_count} related dividend(s) (cascade)")
        
        # Delete positions (dividends will be cascade deleted)
        for position in aapl_positions:
            logger.info(f"  - Deleting position: {position.ticker} (ID: {position.id}, User ID: {position.user_id}, Shares: {position.shares})")
            db.delete(position)
        
        db.commit()
        logger.info(f"✅ Successfully removed {len(aapl_positions)} AAPL position(s)!")
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Error removing AAPL positions: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Remove AAPL positions from the database")
    parser.add_argument(
        "--user-email",
        type=str,
        help="Email of the user whose AAPL positions should be removed (optional, removes from all users if not specified)"
    )
    
    args = parser.parse_args()
    remove_aapl_positions(user_email=args.user_email)

