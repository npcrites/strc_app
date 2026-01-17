"""
Script to create historical Dividend records from ExDate records
for all users who currently have positions.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.db.session import SessionLocal
from app.services.dividend_data_service import DividendDataService
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    """Create historical dividends for all tickers and users"""
    db = SessionLocal()
    try:
        logger.info("Starting historical dividend creation...")
        dividend_service = DividendDataService()
        
        total_created = 0
        for ticker in settings.ALLOWED_TICKERS:
            logger.info(f"Processing ticker: {ticker}")
            count = dividend_service.create_user_dividends_from_exdates(db, ticker)
            total_created += count
            logger.info(f"  Created/updated {count} dividend records for {ticker}")
        
        logger.info(f"✅ Completed! Total dividends created/updated: {total_created}")
        
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()

