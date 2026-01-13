#!/usr/bin/env python3
"""
Script to backfill historical market data for specific tickers
Usage: python -m scripts.backfill_market_data
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app.services.backfill_service import BackfillService
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def main():
    """Main function to backfill market data"""
    # Tickers to backfill
    tickers = ["STRC", "STRD", "STRK", "STRF", "SATA"]
    
    # Check if user specified different tickers
    if len(sys.argv) > 1:
        tickers = [t.upper() for t in sys.argv[1:]]
        logger.info(f"Using tickers from command line: {tickers}")
    else:
        logger.info(f"Using default tickers: {tickers}")
        logger.info("Note: If you meant APPL instead of AAPL, specify it via command line")
    
    db = SessionLocal()
    backfill_service = BackfillService()
    
    try:
        logger.info("Starting market data backfill...")
        
        # Backfill last 1 year of data with 5-minute minimum intervals
        # This will create daily snapshots for older data and 15-minute snapshots for recent data
        results = backfill_service.backfill_tickers(
            db=db,
            tickers=tickers,
            days_back=365,  # 1 year
            min_interval_minutes=5  # Minimum 5 minutes between snapshots
        )
        
        # Print results
        logger.info("\n" + "="*60)
        logger.info("Backfill Results:")
        logger.info("="*60)
        
        total_snapshots = 0
        total_users = 0
        
        for ticker, stats in results.items():
            logger.info(f"\n{ticker}:")
            logger.info(f"  Users found: {stats.get('users_found', 0)}")
            logger.info(f"  Snapshots created: {stats.get('snapshots_created', 0)}")
            logger.info(f"  Bars fetched: {stats.get('bars_fetched', 0)}")
            logger.info(f"  Errors: {stats.get('errors', 0)}")
            
            total_snapshots += stats.get('snapshots_created', 0)
            total_users += stats.get('users_found', 0)
        
        logger.info("\n" + "="*60)
        logger.info(f"Total: {total_snapshots} snapshots created for {total_users} users")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"Error during backfill: {str(e)}", exc_info=True)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

