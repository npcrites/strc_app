#!/usr/bin/env python3
"""
Script to remove synthetic historical data created for testing.

Removes:
- Synthetic dividend payments (source='synthetic')
- Synthetic portfolio snapshots and position snapshots
- Resets position to original state if needed
"""
import sys
import os
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.user import User
from app.models.position import Position
from app.models.dividend import Dividend
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_active_user(db: Session) -> User:
    """Get the first active user"""
    user = db.query(User).filter(User.is_active == True).first()
    if not user:
        raise ValueError("No active user found")
    return user


def main():
    """Main function to remove synthetic data"""
    db: Session = SessionLocal()
    
    try:
        # Get active user
        user = get_active_user(db)
        logger.info(f"Removing synthetic data for user: {user.email} (ID: {user.id})")
        
        # 1. Delete synthetic dividends
        synthetic_dividends = db.query(Dividend).filter(
            Dividend.user_id == user.id,
            Dividend.source == 'synthetic'
        ).all()
        
        dividend_count = len(synthetic_dividends)
        if dividend_count > 0:
            for dividend in synthetic_dividends:
                db.delete(dividend)
            logger.info(f"Deleted {dividend_count} synthetic dividends")
        else:
            logger.info("No synthetic dividends found")
        
        # 2. Delete portfolio snapshots created by the script
        # We'll identify them by checking if they have position snapshots with STRC
        # and if they were created around the time we ran the script (Jan 3, 2026)
        # Actually, let's be more conservative - delete snapshots from July 2025 onwards
        # that have synthetic-looking data (STRC positions)
        cutoff_date = datetime(2025, 7, 1)
        
        portfolio_snapshots = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.timestamp >= cutoff_date
        ).all()
        
        snapshot_count = 0
        for portfolio_snap in portfolio_snapshots:
            # Check if this snapshot has STRC position snapshots
            position_snapshots = db.query(PositionSnapshot).filter(
                PositionSnapshot.portfolio_snapshot_id == portfolio_snap.id,
                PositionSnapshot.ticker == 'STRC'
            ).all()
            
            # If it has STRC snapshots and was created around our synthetic data time, delete it
            if position_snapshots:
                # Delete position snapshots first
                for pos_snap in position_snapshots:
                    db.delete(pos_snap)
                # Then delete portfolio snapshot
                db.delete(portfolio_snap)
                snapshot_count += 1
        
        if snapshot_count > 0:
            logger.info(f"Deleted {snapshot_count} synthetic portfolio snapshots")
        else:
            logger.info("No synthetic portfolio snapshots found")
        
        # 3. Reset STRC position if it was modified by synthetic data
        # We'll check if the position has shares that match our synthetic data pattern
        strc_position = db.query(Position).filter(
            Position.user_id == user.id,
            Position.ticker == "STRC"
        ).first()
        
        if strc_position:
            # Check if position looks like it was from synthetic data
            # (has shares around 91, which was our last synthetic snapshot)
            shares = float(strc_position.shares) if strc_position.shares else 0
            if shares > 80:  # Our synthetic data ended around 91 shares
                logger.info(f"STRC position has {shares} shares (likely from synthetic data)")
                logger.info("Resetting STRC position to 0 shares...")
                strc_position.shares = 0
                strc_position.cost_basis = 0
                strc_position.market_value = 0
                strc_position.snapshot_timestamp = datetime.utcnow()
                strc_position.updated_at = datetime.utcnow()
            else:
                logger.info(f"STRC position has {shares} shares (keeping as-is)")
        
        # Commit all changes
        db.commit()
        logger.info("✅ Successfully removed synthetic data!")
        logger.info(f"   - Removed {dividend_count} dividends")
        logger.info(f"   - Removed {snapshot_count} portfolio snapshots")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing synthetic data: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

