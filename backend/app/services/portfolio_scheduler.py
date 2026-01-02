"""
Background scheduler for portfolio price updates and snapshots
"""
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.services.price_service import PriceService
from app.services.snapshot_service import SnapshotService
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Global scheduler instance
_scheduler: Optional[BackgroundScheduler] = None


def update_prices_job() -> None:
    """
    Job function that runs on schedule to update prices.
    Creates a new database session for each run.
    """
    if not settings.PRICE_UPDATE_ENABLED:
        logger.debug("Price updates are disabled")
        return
    
    db = SessionLocal()
    try:
        logger.info("Starting price update job")
        price_service = PriceService()
        stats = price_service.update_all_prices(db)
        logger.info(
            f"Price update completed: {stats['symbols_checked']} symbols checked, "
            f"{stats['prices_fetched']} prices fetched, {stats['prices_updated']} updated"
        )
    except Exception as e:
        logger.error(f"Error in price update job: {str(e)}", exc_info=True)
    finally:
        db.close()


def create_snapshots_job() -> None:
    """
    Job function that runs on schedule to create portfolio snapshots.
    Creates a new database session for each run.
    """
    if not settings.SNAPSHOT_ENABLED:
        logger.debug("Snapshots are disabled")
        return
    
    db = SessionLocal()
    try:
        logger.info("Starting snapshot creation job")
        snapshot_service = SnapshotService()
        stats = snapshot_service.create_snapshots_for_all_users(db)
        logger.info(
            f"Snapshot creation completed: {stats['total_users']} users, "
            f"{stats['successful']} successful, {stats['errors']} errors"
        )
    except Exception as e:
        logger.error(f"Error in snapshot creation job: {str(e)}", exc_info=True)
    finally:
        db.close()


def start_scheduler() -> Optional[BackgroundScheduler]:
    """
    Start the background scheduler for price updates and snapshots.
    
    Returns:
        BackgroundScheduler instance or None if disabled
    """
    global _scheduler
    
    if _scheduler and _scheduler.running:
        logger.warning("Portfolio scheduler is already running")
        return _scheduler
    
    # Check if any jobs are enabled
    if not settings.PRICE_UPDATE_ENABLED and not settings.SNAPSHOT_ENABLED:
        logger.info("Portfolio scheduler is disabled (both jobs disabled)")
        return None
    
    # Create scheduler
    _scheduler = BackgroundScheduler()
    
    # Schedule price update job
    if settings.PRICE_UPDATE_ENABLED:
        interval_seconds = settings.PRICE_UPDATE_INTERVAL_SECONDS
        _scheduler.add_job(
            func=update_prices_job,
            trigger=IntervalTrigger(seconds=interval_seconds),
            id='price_update_job',
            name='Price Update Job',
            replace_existing=True
        )
        logger.info(f"Price update job scheduled: every {interval_seconds} seconds")
    else:
        logger.info("Price update job is disabled")
    
    # Schedule snapshot creation job
    if settings.SNAPSHOT_ENABLED:
        interval_minutes = settings.SNAPSHOT_INTERVAL_MINUTES
        _scheduler.add_job(
            func=create_snapshots_job,
            trigger=IntervalTrigger(minutes=interval_minutes),
            id='snapshot_creation_job',
            name='Snapshot Creation Job',
            replace_existing=True
        )
        logger.info(f"Snapshot creation job scheduled: every {interval_minutes} minutes")
    else:
        logger.info("Snapshot creation job is disabled")
    
    # Start scheduler
    _scheduler.start()
    logger.info("Portfolio scheduler started")
    
    return _scheduler


def stop_scheduler() -> None:
    """Stop the background scheduler"""
    global _scheduler
    
    if _scheduler and _scheduler.running:
        _scheduler.shutdown()
        logger.info("Portfolio scheduler stopped")
        _scheduler = None

