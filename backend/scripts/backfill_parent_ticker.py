#!/usr/bin/env python3
"""
Script to backfill parent_ticker for positions
Usage: python -m scripts.backfill_parent_ticker
"""
import sys
from pathlib import Path
from datetime import datetime, timezone

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.position import Position
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Parent ticker mappings
# STRC, STRD, STRF, STRK are Strive Asset Management products with parent MSTR
PARENT_TICKER_MAPPINGS = {
    "STRC": "MSTR",  # Strive Asset Management products - parent is MicroStrategy
    "STRD": "MSTR",
    "STRF": "MSTR",
    "STRK": "MSTR",
    "SATA": "ASST",  # SATA parent is ASST
}


def backfill_parent_ticker():
    """
    Backfill parent_ticker for all positions matching the mappings.
    Only updates positions where parent_ticker is currently NULL.
    """
    db = SessionLocal()
    
    try:
        updated_count = 0
        skipped_count = 0
        
        for ticker, parent_ticker in PARENT_TICKER_MAPPINGS.items():
            if parent_ticker is None:
                logger.info(f"⚠️  Skipping {ticker}: parent_ticker not specified")
                skipped_count += 1
                continue
            
            # Find all positions with this ticker that don't have a parent_ticker set
            positions = db.query(Position).filter(
                Position.ticker == ticker,
                Position.parent_ticker.is_(None)
            ).all()
            
            if not positions:
                logger.info(f"ℹ️  No positions found for {ticker} with NULL parent_ticker")
                continue
            
            # Update each position
            for position in positions:
                position.parent_ticker = parent_ticker
                position.updated_at = datetime.now(timezone.utc)
                updated_count += 1
                logger.info(
                    f"✅ Updated position ID {position.id} ({ticker}): "
                    f"parent_ticker = {parent_ticker} (user_id: {position.user_id})"
                )
        
        if updated_count > 0:
            db.commit()
            logger.info(f"\n✅ Successfully updated {updated_count} positions")
        else:
            logger.info("\nℹ️  No positions were updated")
        
        if skipped_count > 0:
            logger.warning(f"⚠️  Skipped {skipped_count} tickers (parent_ticker not specified)")
        
        # Show summary of all positions with parent_ticker set
        logger.info("\n" + "="*60)
        logger.info("SUMMARY: Positions with parent_ticker")
        logger.info("="*60)
        
        all_positions_with_parent = db.query(Position).filter(
            Position.parent_ticker.isnot(None)
        ).all()
        
        if all_positions_with_parent:
            for pos in all_positions_with_parent:
                logger.info(f"  {pos.ticker} -> {pos.parent_ticker} (user_id: {pos.user_id})")
        else:
            logger.info("  No positions with parent_ticker set")
        
        logger.info("="*60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error backfilling parent_ticker: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    backfill_parent_ticker()

