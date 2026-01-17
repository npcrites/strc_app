#!/usr/bin/env python3
"""
Script to backfill parent company metrics (btcHoldings, MarketCap, BTCNav, mNAV) 
for MSTR (back to 2020) and ASST (back to 2025).

Since historical endpoints may not be available, this uses current values 
to create daily entries for the historical period.

Usage: python -m scripts.backfill_parent_metrics
"""
import sys
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.asset_metrics import AssetMetrics
from app.services.nav_service import fetch_company_data_from_api, fetch_company_history, store_metric_if_new
from app.core.config import settings
from dateutil import parser as date_parser
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


def parse_history_timestamp(timestamp_str: str) -> Optional[datetime]:
    """
    Parse timestamp from history API response.
    Handles various formats: ISO strings, Unix timestamps, etc.
    """
    try:
        # Try ISO format first
        if isinstance(timestamp_str, str):
            # Try parsing as ISO format
            try:
                dt = date_parser.parse(timestamp_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except (ValueError, TypeError):
                pass
        
        # Try as datetime object
        if isinstance(timestamp_str, datetime):
            if timestamp_str.tzinfo is None:
                return timestamp_str.replace(tzinfo=timezone.utc)
            return timestamp_str
            
        return None
    except Exception as e:
        logger.warning(f"Could not parse timestamp {timestamp_str}: {e}")
        return None


def backfill_parent_metrics_for_ticker(
    ticker: str,
    start_date: datetime,
    end_date: datetime
) -> dict:
    """
    Backfill parent metrics for a ticker over a date range using history endpoint.
    
    Note: API has a limit of 1000 records per request, so we may need to batch requests
    for large date ranges (e.g., MSTR from 2020 to 2026).
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
        start_date: Start date for backfill
        end_date: End date for backfill
    
    Returns:
        Dict with counts of metrics created for each metric type
    """
    db = SessionLocal()
    try:
        logger.info(f"Fetching history for {ticker} from {start_date.date()} to {end_date.date()}")
        
        # Calculate date range
        total_days = (end_date - start_date).days
        logger.info(f"Date range spans {total_days} days")
        
        # If date range is large, we may need to batch requests
        # API limit is 1000 records, so we'll batch by time periods if needed
        all_history_data = []
        current_start = start_date
        
        # Batch requests if range is very large (e.g., > 1000 days)
        # We'll request in ~1 year chunks to stay under 1000 records
        batch_days = 365  # Request in ~1 year chunks
        
        while current_start < end_date:
            # Calculate batch end date
            batch_end = min(current_start + timedelta(days=batch_days), end_date)
            
            logger.info(f"  Fetching batch from {current_start.date()} to {batch_end.date()}")
            
            # Fetch historical data from API for this batch
            history_data = fetch_company_history(ticker, current_start, batch_end, limit=1000)
            
            if history_data:
                logger.info(f"  Received {len(history_data)} history data points for this batch")
                all_history_data.extend(history_data)
                
                # If we got less than 1000 records, we've likely reached the end
                if len(history_data) < 1000:
                    logger.info(f"  Received less than 1000 records, assuming we've fetched all available data")
                    break
            else:
                logger.warning(f"  No history data returned for batch {current_start.date()} to {batch_end.date()}")
            
            # Move to next batch
            current_start = batch_end + timedelta(days=1)
            
            # Small delay to avoid rate limits
            time.sleep(0.5)
        
        if not all_history_data:
            logger.warning(f"No history data returned for {ticker}")
            return {}
        
        logger.info(f"Total received {len(all_history_data)} history data points for {ticker}")
        
        metrics_created = {
            "mnav": 0,
            "btc_holdings": 0,
            "market_cap": 0,
            "btc_nav": 0
        }
        
        # Process each history data point
        for data_point in all_history_data:
            # Extract timestamp - could be in various fields
            timestamp_str = (
                data_point.get("timestamp") or 
                data_point.get("date") or 
                data_point.get("lastUpdated") or
                data_point.get("time")
            )
            
            if not timestamp_str:
                logger.warning(f"No timestamp found in history data point: {data_point.keys()}")
                continue
            
            timestamp = parse_history_timestamp(timestamp_str)
            if not timestamp:
                continue
            
            # Only process data within our date range
            if timestamp < start_date or timestamp > end_date:
                continue
            
            # Extract metric values
            mnav = data_point.get("mNav") or data_point.get("mnav")
            btc_holdings = data_point.get("btcHoldings") or data_point.get("btc_holdings")
            market_cap = data_point.get("marketCap") or data_point.get("market_cap")
            btc_nav = data_point.get("btcNav") or data_point.get("btc_nav")
            
            # Store each metric type
            if mnav is not None:
                try:
                    mnav_float = float(mnav)
                    if store_metric_if_new(db, ticker, "mnav", mnav_float, timestamp, True):
                        metrics_created["mnav"] += 1
                except (ValueError, TypeError):
                    pass
            
            if btc_holdings is not None:
                try:
                    btc_holdings_float = float(btc_holdings)
                    if store_metric_if_new(db, ticker, "btc_holdings", btc_holdings_float, timestamp, True):
                        metrics_created["btc_holdings"] += 1
                except (ValueError, TypeError):
                    pass
            
            if market_cap is not None:
                try:
                    market_cap_float = float(market_cap)
                    if store_metric_if_new(db, ticker, "market_cap", market_cap_float, timestamp, True):
                        metrics_created["market_cap"] += 1
                except (ValueError, TypeError):
                    pass
            
            if btc_nav is not None:
                try:
                    btc_nav_float = float(btc_nav)
                    if store_metric_if_new(db, ticker, "btc_nav", btc_nav_float, timestamp, True):
                        metrics_created["btc_nav"] += 1
                except (ValueError, TypeError):
                    pass
        
        # Commit all changes
        db.commit()
        logger.info(f"Stored {sum(metrics_created.values())} total metrics for {ticker}")
        
        return metrics_created
        
    except Exception as e:
        logger.error(f"Error backfilling {ticker}: {str(e)}", exc_info=True)
        db.rollback()
        return {}
    finally:
        db.close()


def main():
    """Main backfill function"""
    logger.info("Starting parent metrics backfill...")
    
    end_date = datetime.now(timezone.utc)
    
    # MSTR: back to 2020
    mstr_start = datetime(2020, 1, 1, tzinfo=timezone.utc)
    logger.info(f"\n=== Backfilling MSTR ===")
    mstr_metrics = backfill_parent_metrics_for_ticker("MSTR", mstr_start, end_date)
    
    # ASST: back to 2025
    asst_start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    logger.info(f"\n=== Backfilling ASST ===")
    asst_metrics = backfill_parent_metrics_for_ticker("ASST", asst_start, end_date)
    
    # Summary
    logger.info("\n=== SUMMARY ===")
    logger.info(f"MSTR metrics created:")
    for metric_type, count in mstr_metrics.items():
        logger.info(f"  {metric_type}: {count}")
    
    logger.info(f"\nASST metrics created:")
    for metric_type, count in asst_metrics.items():
        logger.info(f"  {metric_type}: {count}")
    
    # Verify data in database
    db = SessionLocal()
    try:
        for ticker in ["MSTR", "ASST"]:
            for metric_type in ["mnav", "btc_holdings", "market_cap", "btc_nav"]:
                count = db.query(AssetMetrics).filter(
                    AssetMetrics.ticker == ticker,
                    AssetMetrics.metric_type == metric_type,
                    AssetMetrics.is_parent_level == True
                ).count()
                
                if count > 0:
                    first = db.query(AssetMetrics).filter(
                        AssetMetrics.ticker == ticker,
                        AssetMetrics.metric_type == metric_type,
                        AssetMetrics.is_parent_level == True
                    ).order_by(AssetMetrics.timestamp.asc()).first()
                    
                    last = db.query(AssetMetrics).filter(
                        AssetMetrics.ticker == ticker,
                        AssetMetrics.metric_type == metric_type,
                        AssetMetrics.is_parent_level == True
                    ).order_by(AssetMetrics.timestamp.desc()).first()
                    
                    logger.info(f"{ticker} {metric_type}: {count} entries, "
                              f"date range {first.timestamp.date()} to {last.timestamp.date()}, "
                              f"latest value: {float(last.value)}")
    finally:
        db.close()
    
    logger.info("\nBackfill complete!")


if __name__ == "__main__":
    main()

