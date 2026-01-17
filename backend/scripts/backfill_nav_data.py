#!/usr/bin/env python3
"""
Script to backfill NAV (Net Asset Value) data for parent companies
Usage: python -m scripts.backfill_nav_data
"""
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, List

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.asset_metrics import AssetMetrics
from app.models.position import Position
from app.services.nav_service import ensure_nav_data_for_parent
from app.core.utils import get_parent_ticker
from app.core.config import settings
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def backfill_nav_for_parent(ticker: str, db: SessionLocal) -> int:
    """
    Backfill NAV data for a single parent ticker using the NAV service.
    
    Args:
        ticker: Parent ticker symbol
        db: Database session
    
    Returns:
        Number of NAV metrics created
    """
    try:
        # Use the NAV service to ensure data exists (fetches current + history)
        created_count = ensure_nav_data_for_parent(db, ticker, fetch_history=True)
        return created_count
    except Exception as e:
        logger.error(f"Error backfilling NAV for {ticker}: {str(e)}", exc_info=True)
        return 0


def backfill_all_nav_data():
    """
    Backfill NAV data for all parent companies found in positions.
    """
    db = SessionLocal()
    
    try:
        # Get all unique parent tickers from positions
        positions = db.query(Position).filter(
            Position.parent_ticker.isnot(None)
        ).all()
        
        parent_tickers = set()
        for position in positions:
            if position.parent_ticker:
                parent_tickers.add(position.parent_ticker.upper())
        
        if not parent_tickers:
            logger.info("No parent tickers found in positions. No NAV data to backfill.")
            return
        
        logger.info(f"\n{'='*60}")
        logger.info(f"Found {len(parent_tickers)} parent tickers: {', '.join(sorted(parent_tickers))}")
        logger.info(f"{'='*60}\n")
        
        total_created = 0
        
        for parent_ticker in sorted(parent_tickers):
            logger.info(f"Processing {parent_ticker}...")
            created = backfill_nav_for_parent(parent_ticker, db)
            total_created += created
            logger.info(f"  Created {created} NAV metrics for {parent_ticker}")
        
        if total_created > 0:
            db.commit()
            logger.info(f"\n✅ Successfully created {total_created} NAV metrics")
        else:
            logger.info("\nℹ️  No new NAV metrics created (may already exist or API not implemented)")
        
        # Show summary
        logger.info("\n" + "="*60)
        logger.info("SUMMARY: NAV Metrics by Parent Ticker")
        logger.info("="*60)
        
        for parent_ticker in sorted(parent_tickers):
            nav_count = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == parent_ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).count()
            
            latest_nav = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == parent_ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).order_by(AssetMetrics.timestamp.desc()).first()
            
            logger.info(f"  {parent_ticker}:")
            logger.info(f"    NAV metrics: {nav_count}")
            if latest_nav:
                logger.info(f"    Latest NAV: ${float(latest_nav.value):,.2f} ({latest_nav.timestamp.date()})")
        
        logger.info("="*60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error backfilling NAV data: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    backfill_all_nav_data()

