#!/usr/bin/env python3
"""
Script to backfill NAV history for specific parent companies (MSTR, ASST) for one year.
Since the historical NAV endpoint isn't available, this uses the current NAV value
to create daily entries for the past year.
Usage: python -m scripts.backfill_nav_history
"""
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.asset_metrics import AssetMetrics
from app.services.nav_service import fetch_nav_from_api
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def backfill_nav_history_for_ticker(ticker: str, days: int = 365, db: SessionLocal = None) -> int:
    """
    Backfill NAV history for a parent ticker for the specified number of days.
    
    Since the API doesn't provide historical NAV data, this uses the current NAV
    value and creates daily entries going back in time.
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
        days: Number of days to backfill (default 365 for one year)
        db: Database session (will create one if not provided)
    
    Returns:
        Number of NAV metrics created
    """
    created_count = 0
    should_close_db = False
    
    if db is None:
        db = SessionLocal()
        should_close_db = True
    
    try:
        # Fetch current NAV
        logger.info(f"Fetching current NAV for {ticker}...")
        current_nav = fetch_nav_from_api(ticker)
        
        if not current_nav:
            logger.warning(f"Could not fetch NAV for {ticker}, skipping history backfill")
            return 0
        
        logger.info(f"Current NAV for {ticker}: ${current_nav:,.2f}")
        
        # Calculate date range (one year back, excluding today)
        end_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        start_date = end_date - timedelta(days=days)
        
        # Generate daily dates (excluding today, we already have current NAV)
        current_date = start_date
        dates_to_create = []
        
        while current_date < end_date:
            dates_to_create.append(current_date)
            current_date += timedelta(days=1)
        
        logger.info(f"Creating {len(dates_to_create)} NAV entries for {ticker} from {start_date.date()} to {end_date.date() - timedelta(days=1)}")
        
        # Create NAV entries for each date
        for date in dates_to_create:
            # Check if entry already exists
            existing = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True,
                AssetMetrics.timestamp == date
            ).first()
            
            if not existing:
                metric = AssetMetrics(
                    ticker=ticker,
                    metric_type="nav",
                    value=Decimal(str(current_nav)),
                    timestamp=date,
                    is_parent_level=True
                )
                db.add(metric)
                created_count += 1
        
        if created_count > 0:
            db.commit()
            logger.info(f"✅ Created {created_count} NAV history entries for {ticker}")
        else:
            logger.info(f"ℹ️  All NAV history entries for {ticker} already exist (skipped {len(dates_to_create)} entries)")
        
        return created_count
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error backfilling NAV history for {ticker}: {str(e)}", exc_info=True)
        return created_count
    finally:
        if should_close_db:
            db.close()


def backfill_nav_history():
    """
    Backfill NAV history for MSTR and ASST for one year.
    """
    db = SessionLocal()
    
    try:
        tickers = ["MSTR", "ASST"]
        total_created = 0
        
        logger.info("\n" + "="*60)
        logger.info("NAV History Backfill - One Year")
        logger.info("="*60 + "\n")
        
        for ticker in tickers:
            logger.info(f"Processing {ticker}...")
            created = backfill_nav_history_for_ticker(ticker, days=365, db=db)
            total_created += created
        
        logger.info("\n" + "="*60)
        logger.info("SUMMARY: NAV History Metrics")
        logger.info("="*60)
        
        for ticker in tickers:
            nav_count = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).count()
            
            earliest_nav = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).order_by(AssetMetrics.timestamp.asc()).first()
            
            latest_nav = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).order_by(AssetMetrics.timestamp.desc()).first()
            
            logger.info(f"  {ticker}:")
            logger.info(f"    Total NAV metrics: {nav_count}")
            if earliest_nav and latest_nav:
                logger.info(f"    Date range: {earliest_nav.timestamp.date()} to {latest_nav.timestamp.date()}")
                logger.info(f"    NAV value: ${float(latest_nav.value):,.2f}")
        
        logger.info("="*60)
        logger.info(f"\n✅ Total created: {total_created} NAV history entries")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error backfilling NAV history: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    backfill_nav_history()

