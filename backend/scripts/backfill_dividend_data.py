"""
Backfill script for populating historical dividend data from FMP API

Usage:
    python scripts/backfill_dividend_data.py
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.dividend_data_service import DividendDataService
from app.core.config import settings
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    """Main function to backfill dividend data"""
    if not settings.ALPHA_VANTAGE_API_KEY:
        logger.error("ALPHA_VANTAGE_API_KEY not configured in environment variables")
        print("ERROR: ALPHA_VANTAGE_API_KEY not configured. Please set it in your .env file.")
        sys.exit(1)
    
    db: Session = SessionLocal()
    try:
        logger.info("Starting dividend data backfill...")
        print("\n" + "="*80)
        print("Dividend Data Backfill from Alpha Vantage API")
        print("="*80)
        print(f"\nBackfilling data for tickers: {', '.join(settings.ALLOWED_TICKERS)}")
        print(f"API Key: {settings.ALPHA_VANTAGE_API_KEY[:10]}...")
        
        service = DividendDataService()
        
        # Backfill historical data
        stats = service.backfill_historical(db)
        
        print("\n" + "-"*80)
        print("Backfill Summary:")
        print("-"*80)
        print(f"Tickers Processed: {stats['tickers_processed']}")
        print(f"Total Records Fetched: {stats['total_fetched']}")
        print(f"Records Created: {stats['total_created']}")
        print(f"Records Updated: {stats['total_updated']}")
        print(f"Errors: {stats['total_errors']}")
        
        print("\nPer-Ticker Breakdown:")
        for ticker_stat in stats['ticker_stats']:
            print(f"  {ticker_stat['ticker']}:")
            print(f"    - Fetched: {ticker_stat['fetched']}")
            print(f"    - Created: {ticker_stat['created']}")
            print(f"    - Updated: {ticker_stat['updated']}")
            if ticker_stat['errors'] > 0:
                print(f"    - Errors: {ticker_stat['errors']}")
        
        print("\n" + "="*80)
        print("Backfill completed successfully!")
        print("="*80 + "\n")
        
        # Optionally create user dividend records (skip in non-interactive mode if no ExDate records)
        if stats['total_created'] > 0 or stats['total_updated'] > 0:
            try:
                response = input("\nCreate user dividend records from ExDate records? (y/n): ")
                if response.lower() == 'y':
                    print("\nCreating user dividend records...")
                    total_created = 0
                    for ticker in settings.ALLOWED_TICKERS:
                        count = service.create_user_dividends_from_exdates(db, ticker)
                        total_created += count
                        if count > 0:
                            print(f"  {ticker}: {count} dividend records created/updated")
                    
                    print(f"\nTotal user dividend records created/updated: {total_created}")
            except EOFError:
                # Non-interactive mode - skip user dividend creation
                print("\n(Non-interactive mode: skipping user dividend record creation)")
                print("You can run the sync job manually or wait for the scheduled job.")
        
    except Exception as e:
        logger.error(f"Error during backfill: {str(e)}", exc_info=True)
        print(f"\nERROR: {str(e)}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

