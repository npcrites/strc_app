"""
Assets API endpoints for price history
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta, time, date
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.position_snapshot import PositionSnapshot
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.asset_price import AssetPrice
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from app.models.user import User
from app.services.position_sync_service import condense_company_name
from app.services.alpaca_trading_service import AlpacaTradingService
from app.services.dashboard.models.time_range import TimeRange, TimeGranularity
from app.services.dashboard.queries.positions import _get_bucket_key
from app.services.price_service import PriceService
from app.services.market_hours_service import MarketHoursService
from app.core.config import settings
from sqlalchemy import and_, or_, func
import httpx
import logging
import pytz
import uuid
import os
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assets", tags=["assets"])


class PricePoint(BaseModel):
    """Single price data point"""
    timestamp: datetime
    price: float
    value: Optional[float] = None  # Total position value at this time


class MetricPoint(BaseModel):
    """Single metric data point (for NAV, volume, etc.)"""
    timestamp: datetime
    value: float


class AssetPriceHistory(BaseModel):
    """Asset price history response"""
    ticker: str
    name: Optional[str] = None  # Full security name
    current_price: Optional[float]
    granularity: str
    series: List[PricePoint]


class ParentNAVHistory(BaseModel):
    """Parent company NAV history response"""
    parent_ticker: str  # e.g., "MSTR"
    current_nav: Optional[float]  # Current NAV value
    granularity: str
    series: List[MetricPoint]  # Historical NAV series
    # Additional fields from mnav/latest endpoint
    mnav_data: Optional[Dict] = None  # All data from /api/v1/mnav/latest endpoint


class HoldingsResponse(BaseModel):
    """Holdings data for a specific asset"""
    ticker: str
    position_amount: float  # Total value of position (shares * current_price)
    shares: float  # Number of shares held
    total_dividends: float  # Sum of all dividends paid for this ticker
    next_ex_date: Optional[date] = None  # Next upcoming ex-dividend date (raw)
    next_invest_by_date: Optional[date] = None  # Last business day on or before ex_date (adjusted)
    next_pay_date: Optional[date] = None  # Payment date for next dividend (raw)
    next_pay_date_adjusted: Optional[date] = None  # Next business day on or after pay_date (adjusted)


def _normalize_snapshots_per_day(
    snapshots: List,
    target_per_day: int,
    market_hours_service: Optional[MarketHoursService] = None
) -> List:
    """
    Normalize snapshots to have the same number of data points per day.
    
    Buckets snapshots within each day and selects evenly distributed points.
    This ensures consistency between market hours and extended hours views.
    
    Uses ET dates to match the filtering logic, ensuring weekends/holidays
    are correctly excluded in market hours mode.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        target_per_day: Target number of snapshots per day
        market_hours_service: MarketHoursService instance (optional, for ET date conversion)
        
    Returns:
        List of normalized snapshots with consistent points per day
    """
    if not snapshots:
        return snapshots
    
    # Create MarketHoursService if not provided
    if market_hours_service is None:
        market_hours_service = MarketHoursService()
    
    # Group snapshots by date (use ET date to match filtering logic)
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        # Convert to ET date to match the filtering logic
        # This ensures that snapshots are grouped by their ET date, not UTC date
        if isinstance(snap_timestamp, datetime):
            snap_date = market_hours_service._to_et(snap_timestamp).date()
        else:
            snap_date = snap_timestamp
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append(snap)
    
    normalized = []
    for date, day_snapshots in sorted(snapshots_by_date.items()):
        # Sort by time
        day_snapshots.sort(key=lambda x: x[0])
        
        # For market hours mode, prefer snapshots during market hours (9:30 AM - 4:00 PM ET)
        # but include all snapshots if needed to reach target_per_day
        market_hours_snapshots = []
        other_snapshots = []
        for snap in day_snapshots:
            if market_hours_service.is_market_open(snap[0]):
                market_hours_snapshots.append(snap)
            else:
                other_snapshots.append(snap)
        
        # Prefer market hours snapshots, but use others if needed
        preferred_snapshots = market_hours_snapshots if market_hours_snapshots else other_snapshots
        
        if len(preferred_snapshots) == target_per_day:
            # Already has exactly target points, keep all
            normalized.extend(preferred_snapshots)
        elif len(preferred_snapshots) < target_per_day:
            # Has fewer points - duplicate to reach target_per_day
            # This ensures all days have the same number of points
            if len(preferred_snapshots) == 0:
                # No snapshots for this day - skip (shouldn't happen, but handle gracefully)
                continue
            elif len(preferred_snapshots) == 1:
                # Only one snapshot - duplicate it target_per_day times
                single_snapshot = preferred_snapshots[0]
                for _ in range(target_per_day):
                    normalized.append(single_snapshot)
            else:
                # Multiple snapshots but fewer than target - distribute evenly
                # We'll duplicate snapshots to fill gaps
                step = len(preferred_snapshots) / target_per_day
                for i in range(target_per_day):
                    index = int(i * step)
                    index = min(index, len(preferred_snapshots) - 1)
                    normalized.append(preferred_snapshots[index])
        else:
            # Has more points - downsample to target_per_day
            # Prefer market hours snapshots when downsampling
            step = len(preferred_snapshots) / target_per_day
            for i in range(target_per_day):
                index = int(i * step)
                # Ensure index doesn't exceed array bounds
                index = min(index, len(preferred_snapshots) - 1)
                normalized.append(preferred_snapshots[index])
    
    normalized.sort(key=lambda x: x[0])
    return normalized


def _get_previous_trading_day_closing_price(
    snapshots_by_date: dict,
    target_date: date,
    market_hours_service: MarketHoursService
) -> tuple[Optional[float], Optional[float]]:
    """
    Find the closing price from the most recent trading day before target_date.
    
    Returns the snapshot closest to market close (4:00 PM ET) from the previous trading day.
    This ensures holidays and weekends use the actual closing price, not just any snapshot.
    
    Args:
        snapshots_by_date: Dictionary mapping dates to lists of snapshots
        target_date: Date to find previous trading day for
        market_hours_service: MarketHoursService instance
        
    Returns:
        Tuple of (price_per_share, current_value) or (None, None) if not found
    """
    # Go back day by day to find the most recent trading day
    check_date = target_date - timedelta(days=1)
    max_days_back = 10  # Safety limit (shouldn't need more than 3-4 days for weekends/holidays)
    days_back = 0
    
    while days_back < max_days_back:
        if market_hours_service.is_trading_day(check_date):
            # Found a trading day - get its closing price
            if check_date in snapshots_by_date:
                day_snapshots = snapshots_by_date[check_date]
                if day_snapshots:
                    # Find snapshot closest to market close (4:00 PM ET)
                    # Market close is 4:00 PM ET = 8:00 PM UTC (during EST) or 9:00 PM UTC (during EDT)
                    market_close_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(check_date, time(
                            market_hours_service.MARKET_CLOSE_HOUR,
                            market_hours_service.MARKET_CLOSE_MINUTE
                        ))
                    )
                    market_close_utc = market_close_et.astimezone(pytz.utc).replace(tzinfo=None)
                    
                    # Find snapshot closest to (but not after) market close
                    closing_snapshot = None
                    min_time_diff = timedelta.max
                    
                    for snap in day_snapshots:
                        snap_time = snap[0]
                        if snap_time <= market_close_utc:
                            time_diff = market_close_utc - snap_time
                            if time_diff < min_time_diff:
                                min_time_diff = time_diff
                                closing_snapshot = snap
                    
                    # If no snapshot before market close, use the latest snapshot of the day
                    if closing_snapshot is None:
                        closing_snapshot = max(day_snapshots, key=lambda x: x[0])
                    
                    return closing_snapshot[1], closing_snapshot[2]  # price, value
        
        check_date -= timedelta(days=1)
        days_back += 1
    
    return None, None


def _generate_5minute_market_hours_snapshots(
    snapshots: List,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact 5-minute intervals during market hours (9:30 AM - 4:00 PM ET).
    
    For each trading day, creates snapshots at:
    - 9:30, 9:35, 9:40, ..., 3:50, 3:55 (4:00 PM is excluded as market closes at 4:00 PM)
    
    If a snapshot doesn't exist at an exact 5-minute mark, interpolates from surrounding snapshots.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact 5-minute intervals during market hours
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by trading day (ET date)
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        # Only include trading days
        if not market_hours_service.is_trading_day(snap_date):
            continue
            
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_et, snap[1], snap[2]))  # Store ET time for easier processing
    
    generated_snapshots = []
    
    # For each trading day, generate 5-minute intervals
    for date, day_snapshots in sorted(snapshots_by_date.items()):
        # Sort by time
        day_snapshots.sort(key=lambda x: x[0])
        
        # Generate 5-minute intervals from 9:30 AM to 3:55 PM ET
        # Market hours: 9:30 AM - 4:00 PM ET (78 intervals: 9:30, 9:35, ..., 3:55)
        market_open = time(9, 30)
        market_close = time(16, 0)
        
        # Create list of 5-minute interval times
        interval_times = []
        current_time = market_open
        while current_time < market_close:
            interval_times.append(current_time)
            # Add 5 minutes
            minutes = current_time.minute + 5
            hours = current_time.hour
            if minutes >= 60:
                hours += 1
                minutes = 0
            current_time = time(hours, minutes)
        
        # For each 5-minute interval, find or interpolate snapshot
        day_intervals = []
        for interval_time in interval_times:
            interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                datetime.combine(date, interval_time)
            )
            interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
            
            # Find closest snapshot(s) to this interval
            closest_snapshot = None
            min_time_diff = timedelta.max
            
            for snap_et, price, value in day_snapshots:
                time_diff = abs(snap_et - interval_datetime_et)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_snapshot = (snap_et, price, value)
            
            # If we found a snapshot within 2.5 minutes (half the interval), use it
            # Otherwise, interpolate from surrounding snapshots
            if min_time_diff <= timedelta(minutes=2, seconds=30):
                # Use the closest snapshot
                # Convert Decimal to float
                closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                day_intervals.append((interval_datetime_utc, closest_price, closest_value))
            else:
                # Interpolate from surrounding snapshots
                # Find snapshots before and after this interval
                before_snap = None
                after_snap = None
                
                for snap_et, price, value in day_snapshots:
                    if snap_et < interval_datetime_et:
                        if before_snap is None or snap_et > before_snap[0]:
                            before_snap = (snap_et, price, value)
                    elif snap_et > interval_datetime_et:
                        if after_snap is None or snap_et < after_snap[0]:
                            after_snap = (snap_et, price, value)
                
                # Interpolate price and value
                if before_snap and after_snap:
                    # Linear interpolation
                    # Convert Decimal to float for arithmetic operations
                    total_diff = (after_snap[0] - before_snap[0]).total_seconds()
                    interval_diff = (interval_datetime_et - before_snap[0]).total_seconds()
                    ratio = interval_diff / total_diff if total_diff > 0 else 0
                    
                    # Convert Decimal to float before interpolation
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    
                    interpolated_price = before_price + (after_price - before_price) * ratio
                    interpolated_value = before_value + (after_value - before_value) * ratio
                    
                    day_intervals.append((interval_datetime_utc, interpolated_price, interpolated_value))
                elif before_snap:
                    # Use before snapshot if no after snapshot
                    # Convert Decimal to float
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, before_price, before_value))
                elif after_snap:
                    # Use after snapshot if no before snapshot
                    # Convert Decimal to float
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, after_price, after_value))
                elif day_snapshots:
                    # Fallback: use first snapshot of the day
                    first_snap = day_snapshots[0]
                    # Convert Decimal to float
                    first_price = float(first_snap[1]) if first_snap[1] is not None else 0.0
                    first_value = float(first_snap[2]) if first_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, first_price, first_value))
        
        generated_snapshots.extend(day_intervals)
        
        # Log intervals generated for this day
        logger.debug(
            f"Generated {len(day_intervals)} 5-minute intervals for {date}: "
            f"first={day_intervals[0][0] if day_intervals else 'N/A'}, "
            f"last={day_intervals[-1][0] if day_intervals else 'N/A'}"
        )
    
    # Sort by timestamp
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} 5-minute interval snapshots "
        f"(from {len(snapshots)} original snapshots) for {len(snapshots_by_date)} trading days"
    )
    
    return generated_snapshots


def _generate_5minute_extended_hours_snapshots(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact 5-minute intervals for extended hours mode (all hours, all days).
    
    For each calendar day, creates snapshots at 5-minute intervals throughout the day (00:00 - 23:55).
    For trading days, uses actual snapshots when available.
    For weekends/holidays, first checks if actual prices exist - if yes, uses them; if no, uses previous trading day's closing price.
    If no data point exists for a 5-minute period, uses the previous 5-minute period's price.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact 5-minute intervals for all calendar days
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by date (ET date) - include ALL dates, not just trading days
    # Store as (utc_timestamp, price, value) for compatibility with _get_previous_trading_day_closing_price
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]  # UTC timestamp
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        # Store UTC timestamp for compatibility with _get_previous_trading_day_closing_price
        snapshots_by_date[snap_date].append((snap_timestamp, snap[1], snap[2]))
    
    # Determine date range - ALWAYS use the provided start_date and end_date
    # This ensures we generate snapshots for the full requested range, not just days with data
    # The start_date should already be adjusted for trading days (e.g., 60 trading days back for 3M)
    if not start_date:
        logger.error("start_date is None - cannot generate daily snapshots without start date")
        return []
    
    start_date_et = market_hours_service._to_et(start_date).date()
    end_date_et = market_hours_service._to_et(end_date).date()
    
    logger.info(
        f"Generating daily market hours snapshots: "
        f"start_date={start_date} (UTC), start_date_et={start_date_et} (ET), "
        f"end_date={end_date} (UTC), end_date_et={end_date_et} (ET), "
        f"snapshots_by_date has {len(snapshots_by_date)} days with data, "
        f"date_range_span={(end_date_et - start_date_et).days} calendar days"
    )
    
    generated_snapshots = []
    last_price = None
    last_value = None
    
    # Iterate through all calendar days in range
    current_date = start_date_et
    while current_date <= end_date_et:
        # Generate 5-minute intervals for the day
        # BUT: For the current day (end_date_et), only generate up to current time
        interval_times = []
        current_time = time(0, 0)
        
        # Determine the end time for interval generation
        if current_date == end_date_et:
            # For the current day, only generate intervals up to current time
            end_time_et = market_hours_service._to_et(end_date)
            end_time = end_time_et.time()
            # Round down to the nearest 5-minute interval
            end_minutes = (end_time.minute // 5) * 5
            end_time_limit = time(end_time.hour, end_minutes)
        else:
            # For historical days, generate full day (00:00 - 23:55)
            end_time_limit = time(23, 55)
        
        while current_time <= end_time_limit:
            interval_times.append(current_time)
            # Add 5 minutes
            minutes = current_time.minute + 5
            hours = current_time.hour
            if minutes >= 60:
                hours += 1
                minutes = 0
            if hours >= 24:
                break
            current_time = time(hours, minutes)
        
        day_snapshots = snapshots_by_date.get(current_date, [])
        day_snapshots.sort(key=lambda x: x[0])  # Sort by UTC timestamp
        
        # Check if this is a trading day
        is_trading_day = market_hours_service.is_trading_day(current_date)
        
        day_intervals = []
        
        if day_snapshots:
            # Day has actual snapshots - use them (whether trading day or not)
            for interval_time in interval_times:
                interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                    datetime.combine(current_date, interval_time)
                )
                interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                
                # Find closest snapshot(s) to this interval
                closest_snapshot = None
                min_time_diff = timedelta.max
                
                for snap_utc, price, value in day_snapshots:
                    # snap_utc is UTC timestamp, interval_datetime_utc is also UTC
                    time_diff = abs(snap_utc - interval_datetime_utc)
                    if time_diff < min_time_diff:
                        min_time_diff = time_diff
                        closest_snapshot = (snap_utc, price, value)
                
                # If we found a snapshot within 2.5 minutes, use it
                # Otherwise, use previous interval's price (forward fill)
                if min_time_diff <= timedelta(minutes=2, seconds=30) and closest_snapshot:
                    # Use the closest snapshot
                    closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                    closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, closest_price, closest_value))
                    last_price = closest_price
                    last_value = closest_value
                else:
                    # Use previous 5-minute period's price (forward fill)
                    if last_price is not None and last_value is not None:
                        day_intervals.append((interval_datetime_utc, last_price, last_value))
                    elif day_snapshots:
                        # Fallback: use first snapshot of the day
                        first_snap = day_snapshots[0]
                        first_price = float(first_snap[1]) if first_snap[1] is not None else 0.0
                        first_value = float(first_snap[2]) if first_snap[2] is not None else 0.0
                        day_intervals.append((interval_datetime_utc, first_price, first_value))
                        last_price = first_price
                        last_value = first_value
                    else:
                        # No snapshots and no previous price - skip this interval
                        continue
        elif not is_trading_day:
            # Weekend/holiday with no snapshots - use previous trading day's closing price
            closing_price, closing_value = _get_previous_trading_day_closing_price(
                snapshots_by_date, current_date, market_hours_service
            )
            
            # Use closing price if available, otherwise use last known price
            fill_price = closing_price if closing_price is not None else last_price
            fill_value = closing_value if closing_value is not None else last_value
            
            if fill_price is not None and fill_value is not None:
                # Convert Decimal to float
                fill_price = float(fill_price) if not isinstance(fill_price, float) else fill_price
                fill_value = float(fill_value) if not isinstance(fill_value, float) else fill_value
                
                # Use this price for all intervals in the day
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, fill_price, fill_value))
                
                # Update last known price for next day
                last_price = fill_price
                last_value = fill_value
            elif last_price is not None and last_value is not None:
                # No closing price available, use last known price
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        else:
            # Trading day with no snapshots - use last known price (forward fill)
            if last_price is not None and last_value is not None:
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        
        generated_snapshots.extend(day_intervals)
        
        # Log intervals generated for this day
        logger.debug(
            f"Generated {len(day_intervals)} 5-minute intervals for {current_date} "
            f"(trading_day={is_trading_day}, has_snapshots={len(day_snapshots) > 0}): "
            f"first={day_intervals[0][0] if day_intervals else 'N/A'}, "
            f"last={day_intervals[-1][0] if day_intervals else 'N/A'}"
        )
        
        current_date += timedelta(days=1)
    
    # Sort by timestamp
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} 5-minute interval snapshots for extended hours "
        f"(from {len(snapshots)} original snapshots) covering {len(snapshots_by_date)} days"
    )
    
    return generated_snapshots


def _generate_hourly_market_hours_snapshots(
    snapshots: List,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact hourly intervals during market hours (9:30 AM - 4:00 PM ET).
    
    For each trading day, creates snapshots at:
    - 9:30, 10:30, 11:30, 12:30, 1:30, 2:30, 3:30 (7 intervals per trading day)
    
    If a snapshot doesn't exist at an exact hour mark, interpolates from surrounding snapshots.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact hourly intervals during market hours
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by trading day (ET date)
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        # Only include trading days
        if not market_hours_service.is_trading_day(snap_date):
            continue
            
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_et, snap[1], snap[2]))
    
    generated_snapshots = []
    
    # For each trading day, generate hourly intervals
    for date, day_snapshots in sorted(snapshots_by_date.items()):
        # Sort by time
        day_snapshots.sort(key=lambda x: x[0])
        
        # Generate hourly intervals from 9:30 AM to 3:30 PM ET
        # Market hours: 9:30 AM - 4:00 PM ET (7 intervals: 9:30, 10:30, 11:30, 12:30, 1:30, 2:30, 3:30)
        interval_times = [
            time(9, 30),  # 9:30 AM
            time(10, 30), # 10:30 AM
            time(11, 30), # 11:30 AM
            time(12, 30), # 12:30 PM
            time(13, 30), # 1:30 PM
            time(14, 30), # 2:30 PM
            time(15, 30), # 3:30 PM
        ]
        
        # For each hourly interval, find or interpolate snapshot
        day_intervals = []
        for interval_time in interval_times:
            interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                datetime.combine(date, interval_time)
            )
            interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
            
            # Find closest snapshot(s) to this interval
            closest_snapshot = None
            min_time_diff = timedelta.max
            
            for snap_et, price, value in day_snapshots:
                time_diff = abs(snap_et - interval_datetime_et)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_snapshot = (snap_et, price, value)
            
            # If we found a snapshot within 30 minutes (half the interval), use it
            # Otherwise, interpolate from surrounding snapshots
            if min_time_diff <= timedelta(minutes=30):
                # Use the closest snapshot
                closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                day_intervals.append((interval_datetime_utc, closest_price, closest_value))
            else:
                # Interpolate from surrounding snapshots
                before_snap = None
                after_snap = None
                
                for snap_et, price, value in day_snapshots:
                    if snap_et < interval_datetime_et:
                        if before_snap is None or snap_et > before_snap[0]:
                            before_snap = (snap_et, price, value)
                    elif snap_et > interval_datetime_et:
                        if after_snap is None or snap_et < after_snap[0]:
                            after_snap = (snap_et, price, value)
                
                # Interpolate price and value
                if before_snap and after_snap:
                    total_diff = (after_snap[0] - before_snap[0]).total_seconds()
                    interval_diff = (interval_datetime_et - before_snap[0]).total_seconds()
                    ratio = interval_diff / total_diff if total_diff > 0 else 0
                    
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    
                    interpolated_price = before_price + (after_price - before_price) * ratio
                    interpolated_value = before_value + (after_value - before_value) * ratio
                    
                    day_intervals.append((interval_datetime_utc, interpolated_price, interpolated_value))
                elif before_snap:
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, before_price, before_value))
                elif after_snap:
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, after_price, after_value))
                elif day_snapshots:
                    first_snap = day_snapshots[0]
                    first_price = float(first_snap[1]) if first_snap[1] is not None else 0.0
                    first_value = float(first_snap[2]) if first_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, first_price, first_value))
        
        generated_snapshots.extend(day_intervals)
        
        logger.debug(
            f"Generated {len(day_intervals)} hourly intervals for {date}: "
            f"first={day_intervals[0][0] if day_intervals else 'N/A'}, "
            f"last={day_intervals[-1][0] if day_intervals else 'N/A'}"
        )
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} hourly interval snapshots "
        f"(from {len(snapshots)} original snapshots) for {len(snapshots_by_date)} trading days"
    )
    
    return generated_snapshots


def _generate_3hour_market_hours_snapshots(
    snapshots: List,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact 3-hour intervals during market hours (9:30 AM - 4:00 PM ET).
    
    For each trading day, creates snapshots at:
    - 9:30, 12:30, 3:30 (3 intervals per trading day)
    
    If a snapshot doesn't exist at an exact interval, interpolates from surrounding snapshots.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact 3-hour intervals during market hours
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by trading day (ET date)
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        # Only include trading days
        if not market_hours_service.is_trading_day(snap_date):
            continue
            
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_et, snap[1], snap[2]))
    
    generated_snapshots = []
    
    # For each trading day, generate 3-hour intervals
    for date, day_snapshots in sorted(snapshots_by_date.items()):
        # Sort by time
        day_snapshots.sort(key=lambda x: x[0])
        
        # Generate 3-hour intervals from 9:30 AM to 3:30 PM ET
        # Market hours: 9:30 AM - 4:00 PM ET (3 intervals: 9:30, 12:30, 3:30)
        interval_times = [
            time(9, 30),  # 9:30 AM
            time(12, 30), # 12:30 PM
            time(15, 30), # 3:30 PM
        ]
        
        # For each 3-hour interval, find or interpolate snapshot
        day_intervals = []
        for interval_time in interval_times:
            interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                datetime.combine(date, interval_time)
            )
            interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
            
            # Find closest snapshot(s) to this interval
            closest_snapshot = None
            min_time_diff = timedelta.max
            
            for snap_et, price, value in day_snapshots:
                time_diff = abs(snap_et - interval_datetime_et)
                if time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closest_snapshot = (snap_et, price, value)
            
            # If we found a snapshot within 90 minutes (half the interval), use it
            # Otherwise, interpolate from surrounding snapshots
            if min_time_diff <= timedelta(minutes=90):
                # Use the closest snapshot
                closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                day_intervals.append((interval_datetime_utc, closest_price, closest_value))
            else:
                # Interpolate from surrounding snapshots
                before_snap = None
                after_snap = None
                
                for snap_et, price, value in day_snapshots:
                    if snap_et < interval_datetime_et:
                        if before_snap is None or snap_et > before_snap[0]:
                            before_snap = (snap_et, price, value)
                    elif snap_et > interval_datetime_et:
                        if after_snap is None or snap_et < after_snap[0]:
                            after_snap = (snap_et, price, value)
                
                # Interpolate price and value
                if before_snap and after_snap:
                    total_diff = (after_snap[0] - before_snap[0]).total_seconds()
                    interval_diff = (interval_datetime_et - before_snap[0]).total_seconds()
                    ratio = interval_diff / total_diff if total_diff > 0 else 0
                    
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    
                    interpolated_price = before_price + (after_price - before_price) * ratio
                    interpolated_value = before_value + (after_value - before_value) * ratio
                    
                    day_intervals.append((interval_datetime_utc, interpolated_price, interpolated_value))
                elif before_snap:
                    before_price = float(before_snap[1]) if before_snap[1] is not None else 0.0
                    before_value = float(before_snap[2]) if before_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, before_price, before_value))
                elif after_snap:
                    after_price = float(after_snap[1]) if after_snap[1] is not None else 0.0
                    after_value = float(after_snap[2]) if after_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, after_price, after_value))
                elif day_snapshots:
                    first_snap = day_snapshots[0]
                    first_price = float(first_snap[1]) if first_snap[1] is not None else 0.0
                    first_value = float(first_snap[2]) if first_snap[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, first_price, first_value))
        
        generated_snapshots.extend(day_intervals)
        
        logger.debug(
            f"Generated {len(day_intervals)} 3-hour intervals for {date}: "
            f"first={day_intervals[0][0] if day_intervals else 'N/A'}, "
            f"last={day_intervals[-1][0] if day_intervals else 'N/A'}"
        )
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} 3-hour interval snapshots "
        f"(from {len(snapshots)} original snapshots) for {len(snapshots_by_date)} trading days"
    )
    
    return generated_snapshots


def _generate_hourly_extended_hours_snapshots(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact hourly intervals for extended hours mode (all hours, all days).
    
    For each calendar day, creates snapshots at hourly intervals (00:00 - 23:00).
    For trading days, uses actual snapshots when available.
    For weekends/holidays, first checks if actual prices exist - if yes, uses them; if no, uses previous trading day's closing price.
    If no data point exists for an hour, uses the previous hour's price.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact hourly intervals for all calendar days
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by date (ET date) - include ALL dates
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_timestamp, snap[1], snap[2]))
    
    # Determine date range
    if start_date:
        start_date_et = market_hours_service._to_et(start_date).date()
    else:
        start_date_et = min(snapshots_by_date.keys()) if snapshots_by_date else end_date.date()
    
    end_date_et = market_hours_service._to_et(end_date).date()
    
    generated_snapshots = []
    last_price = None
    last_value = None
    
    # Iterate through all calendar days in range
    current_date = start_date_et
    while current_date <= end_date_et:
        # Generate hourly intervals for the entire day (00:00 - 23:00)
        interval_times = [time(hour, 0) for hour in range(24)]
        
        day_snapshots = snapshots_by_date.get(current_date, [])
        day_snapshots.sort(key=lambda x: x[0])
        
        is_trading_day = market_hours_service.is_trading_day(current_date)
        day_intervals = []
        
        if day_snapshots:
            # Day has actual snapshots - use them
            # Convert snapshots to ET for comparison
            day_snapshots_et = []
            for snap_utc, price, value in day_snapshots:
                snap_et = market_hours_service._to_et(snap_utc)
                day_snapshots_et.append((snap_et, snap_utc, price, value))
            day_snapshots_et.sort(key=lambda x: x[0])  # Sort by ET time
            
            for interval_time in interval_times:
                interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                    datetime.combine(current_date, interval_time)
                )
                interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                
                closest_snapshot = None
                min_time_diff = timedelta.max
                
                # Find closest snapshot (compare in ET timezone for accuracy)
                for snap_et, snap_utc, price, value in day_snapshots_et:
                    time_diff = abs(snap_et - interval_datetime_et)
                    if time_diff < min_time_diff:
                        min_time_diff = time_diff
                        closest_snapshot = (snap_utc, price, value)
                
                if min_time_diff <= timedelta(minutes=30) and closest_snapshot:
                    # Found snapshot within 30 minutes - use it
                    closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                    closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, closest_price, closest_value))
                    last_price = closest_price
                    last_value = closest_value
                else:
                    # No snapshot within 30 minutes - use previous hour's price (forward fill)
                    if last_price is not None and last_value is not None:
                        day_intervals.append((interval_datetime_utc, last_price, last_value))
                    elif day_snapshots_et:
                        # First hour of day with no snapshot - use first snapshot of the day
                        first_snap = day_snapshots_et[0]
                        first_price = float(first_snap[2]) if first_snap[2] is not None else 0.0
                        first_value = float(first_snap[3]) if first_snap[3] is not None else 0.0
                        day_intervals.append((interval_datetime_utc, first_price, first_value))
                        last_price = first_price
                        last_value = first_value
                    else:
                        # No snapshots at all - use last known price
                        if last_price is not None and last_value is not None:
                            day_intervals.append((interval_datetime_utc, last_price, last_value))
        elif not is_trading_day:
            # Weekend/holiday with no snapshots - use previous trading day's closing price
            closing_price, closing_value = _get_previous_trading_day_closing_price(
                snapshots_by_date, current_date, market_hours_service
            )
            
            fill_price = closing_price if closing_price is not None else last_price
            fill_value = closing_value if closing_value is not None else last_value
            
            if fill_price is not None and fill_value is not None:
                fill_price = float(fill_price) if not isinstance(fill_price, float) else fill_price
                fill_value = float(fill_value) if not isinstance(fill_value, float) else fill_value
                
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, fill_price, fill_value))
                
                last_price = fill_price
                last_value = fill_value
            elif last_price is not None and last_value is not None:
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        else:
            # Trading day with no snapshots - use last known price
            if last_price is not None and last_value is not None:
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        
        generated_snapshots.extend(day_intervals)
        
        logger.debug(
            f"Generated {len(day_intervals)} hourly intervals for {current_date} "
            f"(trading_day={is_trading_day}, has_snapshots={len(day_snapshots) > 0})"
        )
        
        current_date += timedelta(days=1)
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} hourly interval snapshots for extended hours "
        f"(from {len(snapshots)} original snapshots) covering {len(snapshots_by_date)} days"
    )
    
    return generated_snapshots


def _generate_3hour_extended_hours_snapshots(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at exact 3-hour intervals for extended hours mode (all hours, all days).
    
    For each calendar day, creates snapshots at 3-hour intervals (00:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00).
    For trading days, uses actual snapshots when available.
    For weekends/holidays, first checks if actual prices exist - if yes, uses them; if no, uses previous trading day's closing price.
    If no data point exists for a 3-hour period, uses the previous period's price.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at exact 3-hour intervals for all calendar days
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by date (ET date) - include ALL dates
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_timestamp, snap[1], snap[2]))
    
    # Determine date range
    if start_date:
        start_date_et = market_hours_service._to_et(start_date).date()
    else:
        start_date_et = min(snapshots_by_date.keys()) if snapshots_by_date else end_date.date()
    
    end_date_et = market_hours_service._to_et(end_date).date()
    
    generated_snapshots = []
    last_price = None
    last_value = None
    
    # Iterate through all calendar days in range
    current_date = start_date_et
    while current_date <= end_date_et:
        # Generate 3-hour intervals for the entire day (00:00, 3:00, 6:00, 9:00, 12:00, 15:00, 18:00, 21:00)
        interval_times = [time(hour, 0) for hour in range(0, 24, 3)]  # 0, 3, 6, 9, 12, 15, 18, 21
        
        day_snapshots = snapshots_by_date.get(current_date, [])
        day_snapshots.sort(key=lambda x: x[0])
        
        is_trading_day = market_hours_service.is_trading_day(current_date)
        day_intervals = []
        
        if day_snapshots:
            # Day has actual snapshots - use them
            # Convert snapshots to ET for comparison
            day_snapshots_et = []
            for snap_utc, price, value in day_snapshots:
                snap_et = market_hours_service._to_et(snap_utc)
                day_snapshots_et.append((snap_et, snap_utc, price, value))
            day_snapshots_et.sort(key=lambda x: x[0])  # Sort by ET time
            
            for interval_time in interval_times:
                interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                    datetime.combine(current_date, interval_time)
                )
                interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                
                closest_snapshot = None
                min_time_diff = timedelta.max
                
                # Find closest snapshot (compare in ET timezone for accuracy)
                for snap_et, snap_utc, price, value in day_snapshots_et:
                    time_diff = abs(snap_et - interval_datetime_et)
                    if time_diff < min_time_diff:
                        min_time_diff = time_diff
                        closest_snapshot = (snap_utc, price, value)
                
                if min_time_diff <= timedelta(minutes=90) and closest_snapshot:
                    # Found snapshot within 90 minutes - use it
                    closest_price = float(closest_snapshot[1]) if closest_snapshot[1] is not None else 0.0
                    closest_value = float(closest_snapshot[2]) if closest_snapshot[2] is not None else 0.0
                    day_intervals.append((interval_datetime_utc, closest_price, closest_value))
                    last_price = closest_price
                    last_value = closest_value
                else:
                    # No snapshot within 90 minutes - use previous 3-hour period's price (forward fill)
                    if last_price is not None and last_value is not None:
                        day_intervals.append((interval_datetime_utc, last_price, last_value))
                    elif day_snapshots_et:
                        # First interval of day with no snapshot - use first snapshot of the day
                        first_snap = day_snapshots_et[0]
                        first_price = float(first_snap[2]) if first_snap[2] is not None else 0.0
                        first_value = float(first_snap[3]) if first_snap[3] is not None else 0.0
                        day_intervals.append((interval_datetime_utc, first_price, first_value))
                        last_price = first_price
                        last_value = first_value
                    else:
                        # No snapshots at all - use last known price
                        if last_price is not None and last_value is not None:
                            day_intervals.append((interval_datetime_utc, last_price, last_value))
        elif not is_trading_day:
            # Weekend/holiday with no snapshots - use previous trading day's closing price
            closing_price, closing_value = _get_previous_trading_day_closing_price(
                snapshots_by_date, current_date, market_hours_service
            )
            
            fill_price = closing_price if closing_price is not None else last_price
            fill_value = closing_value if closing_value is not None else last_value
            
            if fill_price is not None and fill_value is not None:
                fill_price = float(fill_price) if not isinstance(fill_price, float) else fill_price
                fill_value = float(fill_value) if not isinstance(fill_value, float) else fill_value
                
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, fill_price, fill_value))
                
                last_price = fill_price
                last_value = fill_value
            elif last_price is not None and last_value is not None:
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        else:
            # Trading day with no snapshots - use last known price
            if last_price is not None and last_value is not None:
                for interval_time in interval_times:
                    interval_datetime_et = market_hours_service.ET_TIMEZONE.localize(
                        datetime.combine(current_date, interval_time)
                    )
                    interval_datetime_utc = interval_datetime_et.astimezone(pytz.utc).replace(tzinfo=None)
                    day_intervals.append((interval_datetime_utc, last_price, last_value))
        
        generated_snapshots.extend(day_intervals)
        
        logger.debug(
            f"Generated {len(day_intervals)} 3-hour intervals for {current_date} "
            f"(trading_day={is_trading_day}, has_snapshots={len(day_snapshots) > 0})"
        )
        
        current_date += timedelta(days=1)
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} 3-hour interval snapshots for extended hours "
        f"(from {len(snapshots)} original snapshots) covering {len(snapshots_by_date)} days"
    )
    
    return generated_snapshots


def _generate_daily_market_hours_snapshots(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at market close (4:00 PM ET) for each trading day in the range.
    
    For each trading day, creates one snapshot at market close (4:00 PM ET).
    Uses the snapshot closest to market close, or the last snapshot of the day if none before close.
    For trading days with no snapshots, uses the previous trading day's closing price.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at market close for each trading day in the range
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by trading day (ET date)
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        # Only include trading days
        if not market_hours_service.is_trading_day(snap_date):
            continue
            
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_et, snap[1], snap[2]))
    
    # Determine date range
    if start_date:
        start_date_et = market_hours_service._to_et(start_date).date()
    else:
        start_date_et = min(snapshots_by_date.keys()) if snapshots_by_date else end_date.date()
    
    end_date_et = market_hours_service._to_et(end_date).date()
    
    generated_snapshots = []
    last_price = None
    last_value = None
    
    # Iterate through all calendar days in range, but only process trading days
    # CRITICAL: We must iterate from start_date_et to end_date_et to ensure we cover the full range
    current_date = start_date_et
    trading_days_processed = 0
    logger.debug(f"Starting iteration from {start_date_et} to {end_date_et}")
    
    while current_date <= end_date_et:
        # Only process trading days
        if not market_hours_service.is_trading_day(current_date):
            current_date += timedelta(days=1)
            continue
        
        trading_days_processed += 1
        
        # Market close is 4:00 PM ET
        market_close_et = market_hours_service.ET_TIMEZONE.localize(
            datetime.combine(current_date, time(
                market_hours_service.MARKET_CLOSE_HOUR,
                market_hours_service.MARKET_CLOSE_MINUTE
            ))
        )
        market_close_utc = market_close_et.astimezone(pytz.utc).replace(tzinfo=None)
        
        day_snapshots = snapshots_by_date.get(current_date, [])
        
        if day_snapshots:
            # Day has snapshots - use them
            day_snapshots.sort(key=lambda x: x[0])
            
            # Find snapshot closest to market close (prefer snapshots at or before market close)
            closing_snapshot = None
            min_time_diff = timedelta.max
            
            for snap_et, price, value in day_snapshots:
                time_diff = market_close_et - snap_et
                # Prefer snapshots at or before market close
                if time_diff >= timedelta(0) and time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closing_snapshot = (snap_et, price, value)
            
            # If no snapshot before market close, use the latest snapshot of the day
            if closing_snapshot is None:
                closing_snapshot = day_snapshots[-1]  # Last snapshot of the day
            
            closing_price = float(closing_snapshot[1]) if closing_snapshot[1] is not None else 0.0
            closing_value = float(closing_snapshot[2]) if closing_snapshot[2] is not None else 0.0
            
            generated_snapshots.append((market_close_utc, closing_price, closing_value))
            last_price = closing_price
            last_value = closing_value
            
            logger.debug(
                f"Generated daily snapshot for {current_date} at market close: "
                f"price={closing_price}, timestamp={market_close_utc}"
            )
        else:
            # Trading day with no snapshots - use previous trading day's closing price
            if last_price is not None and last_value is not None:
                generated_snapshots.append((market_close_utc, last_price, last_value))
                logger.debug(
                    f"Generated daily snapshot for {current_date} (no snapshots) using previous close: "
                    f"price={last_price}, timestamp={market_close_utc}"
                )
            else:
                # No previous price available - try to get from previous trading day in snapshots
                closing_price, closing_value = _get_previous_trading_day_closing_price(
                    snapshots_by_date, current_date, market_hours_service
                )
                if closing_price is not None and closing_value is not None:
                    fill_price = float(closing_price) if not isinstance(closing_price, float) else closing_price
                    fill_value = float(closing_value) if not isinstance(closing_value, float) else closing_value
                    generated_snapshots.append((market_close_utc, fill_price, fill_value))
                    last_price = fill_price
                    last_value = fill_value
                    logger.debug(
                        f"Generated daily snapshot for {current_date} (no snapshots) using previous trading day close: "
                        f"price={fill_price}, timestamp={market_close_utc}"
                    )
        
        current_date += timedelta(days=1)
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    # Count trading days in range for verification
    trading_days_count = 0
    check_date = start_date_et
    while check_date <= end_date_et:
        if market_hours_service.is_trading_day(check_date):
            trading_days_count += 1
        check_date += timedelta(days=1)
    
    # Log first and last snapshot dates for verification
    first_snapshot_date = None
    last_snapshot_date = None
    if generated_snapshots:
        first_snapshot_date = market_hours_service._to_et(generated_snapshots[0][0]).date()
        last_snapshot_date = market_hours_service._to_et(generated_snapshots[-1][0]).date()
    
    logger.info(
        f"Generated {len(generated_snapshots)} daily snapshots at market close "
        f"(from {len(snapshots)} original snapshots) for {trading_days_processed} trading days processed, "
        f"{trading_days_count} trading days in range ({start_date_et} to {end_date_et}). "
        f"First snapshot: {first_snapshot_date}, Last snapshot: {last_snapshot_date}"
    )
    
    if len(generated_snapshots) != trading_days_count:
        logger.error(
            f"ERROR: Generated {len(generated_snapshots)} snapshots but expected {trading_days_count} "
            f"for trading days in range {start_date_et} to {end_date_et}. "
            f"Processed {trading_days_processed} trading days during iteration. "
            f"First snapshot date: {first_snapshot_date}, Expected start: {start_date_et}"
        )
    
    if first_snapshot_date and first_snapshot_date != start_date_et:
        logger.error(
            f"ERROR: First snapshot date ({first_snapshot_date}) does not match expected start date ({start_date_et})"
        )
    
    return generated_snapshots


def _generate_daily_extended_hours_snapshots(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    market_hours_service: MarketHoursService
) -> List:
    """
    Generate snapshots at market close (4:00 PM ET) for each calendar day.
    
    For trading days, uses the snapshot closest to market close (4:00 PM ET).
    For weekends/holidays, uses the previous trading day's closing price.
    
    Args:
        snapshots: List of snapshot tuples (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        market_hours_service: MarketHoursService instance
        
    Returns:
        List of snapshots at market close for each calendar day
    """
    if not snapshots:
        return snapshots
    
    # Group snapshots by date (ET date) - include ALL dates
    snapshots_by_date = {}
    for snap in snapshots:
        snap_timestamp = snap[0]
        snap_et = market_hours_service._to_et(snap_timestamp)
        snap_date = snap_et.date()
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append((snap_timestamp, snap[1], snap[2]))
    
    # Determine date range
    if start_date:
        start_date_et = market_hours_service._to_et(start_date).date()
    else:
        start_date_et = min(snapshots_by_date.keys()) if snapshots_by_date else end_date.date()
    
    end_date_et = market_hours_service._to_et(end_date).date()
    
    generated_snapshots = []
    last_price = None
    last_value = None
    
    # Iterate through all calendar days in range
    current_date = start_date_et
    while current_date <= end_date_et:
        is_trading_day = market_hours_service.is_trading_day(current_date)
        
        # Market close is 4:00 PM ET
        market_close_et = market_hours_service.ET_TIMEZONE.localize(
            datetime.combine(current_date, time(
                market_hours_service.MARKET_CLOSE_HOUR,
                market_hours_service.MARKET_CLOSE_MINUTE
            ))
        )
        market_close_utc = market_close_et.astimezone(pytz.utc).replace(tzinfo=None)
        
        day_snapshots = snapshots_by_date.get(current_date, [])
        day_snapshots.sort(key=lambda x: x[0])
        
        if day_snapshots and is_trading_day:
            # Trading day with snapshots - use snapshot closest to market close
            # Convert snapshots to ET for comparison
            day_snapshots_et = []
            for snap_utc, price, value in day_snapshots:
                snap_et = market_hours_service._to_et(snap_utc)
                day_snapshots_et.append((snap_et, snap_utc, price, value))
            day_snapshots_et.sort(key=lambda x: x[0])
            
            closing_snapshot = None
            min_time_diff = timedelta.max
            
            # Find snapshot closest to market close (prefer at or before market close)
            for snap_et, snap_utc, price, value in day_snapshots_et:
                time_diff = market_close_et - snap_et
                if time_diff >= timedelta(0) and time_diff < min_time_diff:
                    min_time_diff = time_diff
                    closing_snapshot = (snap_utc, price, value)
            
            # If no snapshot before market close, use the latest snapshot of the day
            if closing_snapshot is None:
                last_snap = day_snapshots_et[-1]
                closing_snapshot = (last_snap[1], last_snap[2], last_snap[3])
            
            closing_price = float(closing_snapshot[1]) if closing_snapshot[1] is not None else 0.0
            closing_value = float(closing_snapshot[2]) if closing_snapshot[2] is not None else 0.0
            
            generated_snapshots.append((market_close_utc, closing_price, closing_value))
            last_price = closing_price
            last_value = closing_value
            
            logger.debug(
                f"Generated daily snapshot for {current_date} (trading day) at market close: "
                f"price={closing_price}"
            )
        elif not is_trading_day:
            # Weekend/holiday - use previous trading day's closing price
            closing_price, closing_value = _get_previous_trading_day_closing_price(
                snapshots_by_date, current_date, market_hours_service
            )
            
            fill_price = closing_price if closing_price is not None else last_price
            fill_value = closing_value if closing_value is not None else last_value
            
            if fill_price is not None and fill_value is not None:
                fill_price = float(fill_price) if not isinstance(fill_price, float) else fill_price
                fill_value = float(fill_value) if not isinstance(fill_value, float) else fill_value
                
                generated_snapshots.append((market_close_utc, fill_price, fill_value))
                last_price = fill_price
                last_value = fill_value
                
                logger.debug(
                    f"Generated daily snapshot for {current_date} (weekend/holiday) using previous trading day close: "
                    f"price={fill_price}"
                )
            elif last_price is not None and last_value is not None:
                generated_snapshots.append((market_close_utc, last_price, last_value))
                logger.debug(
                    f"Generated daily snapshot for {current_date} (weekend/holiday) using last known price: "
                    f"price={last_price}"
                )
        else:
            # Trading day with no snapshots - use last known price
            if last_price is not None and last_value is not None:
                generated_snapshots.append((market_close_utc, last_price, last_value))
                logger.debug(
                    f"Generated daily snapshot for {current_date} (trading day, no snapshots) using last known price: "
                    f"price={last_price}"
                )
        
        current_date += timedelta(days=1)
    
    generated_snapshots.sort(key=lambda x: x[0])
    
    logger.info(
        f"Generated {len(generated_snapshots)} daily snapshots for extended hours "
        f"(from {len(snapshots)} original snapshots) covering {len(snapshots_by_date)} days"
    )
    
    return generated_snapshots


def _fill_missing_days_for_extended_hours(
    snapshots: List,
    start_date: Optional[datetime],
    end_date: datetime,
    target_snapshots_per_day: int = 24,
    market_hours_service: Optional[MarketHoursService] = None
) -> List:
    """
    Fill in missing calendar days for extended hours mode.
    
    Creates synthetic snapshots for missing days using the same number of
    data points per day as trading days, ensuring consistency between
    market hours and extended hours views.
    
    For holidays and weekends, uses the previous trading day's closing price
    (4:00 PM ET) instead of just the latest snapshot.
    
    Args:
        snapshots: List of snapshot tuples/rows (timestamp, price_per_share, current_value)
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        target_snapshots_per_day: Number of synthetic snapshots to create per missing day
        market_hours_service: MarketHoursService instance (optional, created if not provided)
        
    Returns:
        List of snapshots with missing days filled in (as tuples)
    """
    if not snapshots:
        return snapshots
    
    if start_date is None:
        # For "ALL", don't fill - just return original snapshots
        return snapshots
    
    # Create MarketHoursService if not provided
    if market_hours_service is None:
        market_hours_service = MarketHoursService()
    
    # Create a set of dates that have snapshots and group by date
    dates_with_snapshots = set()
    snapshots_by_date = {}
    for snap in snapshots:
        # Access tuple by index: [0] = timestamp, [1] = price_per_share, [2] = current_value
        snap_timestamp = snap[0]
        snap_date = snap_timestamp.date() if isinstance(snap_timestamp, datetime) else snap_timestamp
        dates_with_snapshots.add(snap_date)
        
        if snap_date not in snapshots_by_date:
            snapshots_by_date[snap_date] = []
        snapshots_by_date[snap_date].append(snap)
    
    # Calculate average number of snapshots per day for days that have data
    # This will be used to create the same number of synthetic snapshots for missing days
    snapshot_counts = [len(snaps) for snaps in snapshots_by_date.values()]
    avg_snapshots_per_day = int(sum(snapshot_counts) / len(snapshot_counts)) if snapshot_counts else target_snapshots_per_day
    # Use calculated average, but ensure minimum of 3 and maximum of 24 (hourly) for synthetic snapshots
    actual_target = max(3, min(avg_snapshots_per_day, target_snapshots_per_day))
    
    logger.info(
        f"Fill function: {len(snapshots)} snapshots covering {len(dates_with_snapshots)} unique dates, "
        f"average {avg_snapshots_per_day:.1f} snapshots per day, "
        f"will create {actual_target} synthetic snapshots per missing day, "
        f"range: {start_date.date() if start_date else 'None'} to {end_date.date()}"
    )
    
    sorted_snapshots = sorted(snapshots, key=lambda x: x[0])
    first_snapshot = sorted_snapshots[0] if sorted_snapshots else None
    
    if not first_snapshot:
        return snapshots
    
    # Start with all existing snapshots
    filled_snapshots = list(snapshots)
    
    # For each missing calendar day, add synthetic snapshots
    # Use forward fill: use the last known price from the most recent previous day
    current_date = start_date.date()
    end_date_obj = end_date.date()
    
    # Track the last known price/value as we iterate through dates
    last_known_price = None
    last_known_value = None
    
    # Track which dates we're processing for debugging
    processed_dates = []
    missing_dates = []
    
    while current_date <= end_date_obj:
        processed_dates.append(current_date)
        if current_date in dates_with_snapshots:
            # This day has snapshots - update last known price/value
            day_snapshots = snapshots_by_date[current_date]
            if day_snapshots:
                # Use the latest snapshot of the day
                latest_snapshot = max(day_snapshots, key=lambda x: x[0])
                last_known_price = latest_snapshot[1]
                last_known_value = latest_snapshot[2]
        else:
            # This day has no snapshots - create synthetic snapshots throughout the day
            # For holidays and weekends, use the previous trading day's closing price
            missing_dates.append(current_date)
            
            # Try to get closing price from previous trading day
            closing_price, closing_value = _get_previous_trading_day_closing_price(
                snapshots_by_date,
                current_date,
                market_hours_service
            )
            
            # Use closing price if available, otherwise fall back to last known price
            fill_price = closing_price if closing_price is not None else (
                last_known_price if last_known_price is not None else first_snapshot[1]
            )
            fill_value = closing_value if closing_value is not None else (
                last_known_value if last_known_value is not None else first_snapshot[2]
            )
            
            if fill_price is not None:
                # Create actual_target synthetic snapshots evenly distributed throughout the day
                # This ensures missing days have the same number of data points as trading days
                for i in range(actual_target):
                    # Distribute evenly across the day (from 00:00 to 23:59:59)
                    hours_offset = (i * 24) / actual_target
                    hour = int(hours_offset)
                    minute = int((hours_offset - hour) * 60)
                    second = int(((hours_offset - hour) * 60 - minute) * 60)
                    
                    # Ensure we don't exceed 23:59:59
                    if hour >= 24:
                        hour = 23
                        minute = 59
                        second = 59
                    
                    synthetic_time = time(hour, minute, second)
                    synthetic_timestamp = datetime.combine(current_date, synthetic_time)
                    synthetic_snapshot = (synthetic_timestamp, fill_price, fill_value)
                    filled_snapshots.append(synthetic_snapshot)
                
                # Update last known for subsequent forward fills
                if not last_known_price:
                    last_known_price = fill_price
                    last_known_value = fill_value
        
        current_date += timedelta(days=1)
    
    # Sort by timestamp to maintain chronological order
    filled_snapshots.sort(key=lambda x: x[0])
    
    # Log how many synthetic snapshots were created
    synthetic_count = len(filled_snapshots) - len(snapshots)
    if synthetic_count > 0:
        logger.info(
            f"Fill function: Created {synthetic_count} synthetic snapshots for {len(missing_dates)} missing days "
            f"({actual_target} per missing day). Total: {len(filled_snapshots)} snapshots"
        )
        # Log sample of missing dates that were filled (first 10)
        if missing_dates:
            sample_missing = sorted(missing_dates)[:10]
            logger.info(f"Sample missing dates that were filled: {[str(d) for d in sample_missing]}")
    
    # Verify all dates in range are represented
    filled_dates = set(s[0].date() if isinstance(s[0], datetime) else s[0] for s in filled_snapshots)
    expected_dates = set(processed_dates)
    missing_in_filled = expected_dates - filled_dates
    if missing_in_filled:
        logger.warning(
            f"Fill function: Some dates in range are still missing after filling: "
            f"{sorted(missing_in_filled)[:10]}"
        )
    
    return filled_snapshots


def _fetch_historical_prices_from_alpaca(
    ticker: str,
    start_date: Optional[datetime],
    end_date: datetime,
    granularity: TimeGranularity
) -> List[PricePoint]:
    """
    Fetch historical price data from Alpaca Data API.
    
    Args:
        ticker: Stock ticker symbol
        start_date: Start date (None for ALL)
        end_date: End date
        granularity: Time granularity
    
    Returns:
        List of PricePoint objects
    """
    if not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
        logger.warning("Alpaca credentials not configured, cannot fetch historical data")
        return []
    
    try:
        # Map granularity to Alpaca timeframe
        # Alpaca supports: 1Min, 5Min, 15Min, 30Min, 1Hour, 1Day, 1Week, 1Month
        # For short timeframes, use higher frequency data to show price movements
        timeframe_map = {
            TimeGranularity.DAILY: "15Min",  # Use 15-minute bars for daily/weekly views (Coinbase-style)
            TimeGranularity.WEEKLY: "1Week",
            TimeGranularity.MONTHLY: "1Month",
        }
        alpaca_timeframe = timeframe_map.get(granularity, "1Day")
        
        # Override for very short time ranges (1W) - use even higher frequency
        if start_date and end_date:
            time_diff = (end_date - start_date).total_seconds()
            if time_diff <= 7 * 86400:  # 1 week or less
                alpaca_timeframe = "5Min"  # 5-minute bars for 1W view
            elif time_diff <= 30 * 86400:  # 1 month or less
                alpaca_timeframe = "15Min"  # 15-minute bars for 1M view
        
        # Calculate start date (default to 1 year ago if None)
        if start_date is None:
            start_date = end_date - timedelta(days=365)
        
        # Format dates for Alpaca API (ISO format)
        start_str = start_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")  # EST timezone
        end_str = end_date.strftime("%Y-%m-%dT%H:%M:%S-05:00")
        
        # Alpaca Data API endpoint for historical bars
        url = f"https://data.alpaca.markets/v2/stocks/{ticker}/bars"
        params = {
            "timeframe": alpaca_timeframe,
            "start": start_str,
            "end": end_str,
            "adjustment": "raw",  # Raw prices, not adjusted
            "feed": "iex"  # IEX feed for paper trading
        }
        
        headers = {
            "APCA-API-KEY-ID": settings.ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": settings.ALPACA_SECRET_KEY,
        }
        
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers, params=params)
            
            if response.status_code == 404:
                logger.warning(f"Symbol {ticker} not found in Alpaca")
                return []
            
            response.raise_for_status()
            data = response.json()
            
            # Parse response: {"bars": [{"t": "2025-01-01T00:00:00Z", "o": 100, "h": 105, "l": 99, "c": 102, "v": 1000}, ...]}
            bars = data.get("bars", [])
            
            series = []
            for bar in bars:
                # Use close price (c) for the price point
                timestamp_str = bar.get("t")
                close_price = bar.get("c")
                
                if timestamp_str and close_price:
                    # Parse timestamp (Alpaca returns ISO format)
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    series.append(PricePoint(
                        timestamp=timestamp,
                        price=float(close_price),
                        value=None
                    ))
            
            logger.info(f"Fetched {len(series)} historical price points from Alpaca for {ticker}")
            return series
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Alpaca API HTTP error: {e.response.status_code} - {e.response.text}")
        return []
    except httpx.RequestError as e:
        logger.error(f"Alpaca API request error: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Error fetching historical prices from Alpaca: {str(e)}", exc_info=True)
        return []


@router.get("/{ticker}/price-history", response_model=AssetPriceHistory)
async def get_asset_price_history(
    ticker: str,
    time_range: str = Query("1M", regex="^(1W|1M|3M|1Y|ALL)$", description="Time range: 1W, 1M, 3M, 1Y, or ALL"),
    trading_hours_mode: str = Query("market", regex="^(market|extended)$", description="Trading hours mode: market or extended"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get historical price data for a specific asset.
    
    Uses position snapshots to extract historical prices, with the same
    granularity and timestamps as the portfolio dashboard.
    
    Args:
        ticker: Stock ticker symbol (e.g., "STRC", "AAPL")
        time_range: Time range shorthand (1M, 3M, 1Y, ALL)
        trading_hours_mode: "market" to show only market hours, "extended" to show all hours
        db: Database session
        user: Authenticated user from JWT
    
    Returns:
        AssetPriceHistory with price series
    """
    try:
        user_id = int(user.get("user_id"))
        ticker_upper = ticker.upper()
        
        # Convert shorthand to TimeRange
        tr = TimeRange.from_shorthand(time_range)
        
        # Adjust time range based on trading hours mode
        market_hours_service = MarketHoursService()
        if trading_hours_mode == "market":
            # Market hours mode: use trading days (1W = 5 trading days)
            # IMPORTANT: Pass the time_range shorthand so it can calculate correctly
            # even if tr.start_date is set from TimeRange.from_shorthand
            adjusted_start, adjusted_end = market_hours_service.adjust_time_range_for_trading_days(
                tr.start_date,  # May be set from TimeRange.from_shorthand, but will be recalculated
                tr.end_date,
                time_range  # Pass the shorthand to ensure correct calculation
            )
            tr.start_date = adjusted_start
            tr.end_date = adjusted_end
            # Normalize to timezone-aware (UTC) for consistency with database timestamps
            if tr.start_date and tr.start_date.tzinfo is None:
                tr.start_date = pytz.utc.localize(tr.start_date)
            if tr.end_date.tzinfo is None:
                tr.end_date = pytz.utc.localize(tr.end_date)
            logger.info(
                f"Adjusted time range for market hours ({time_range}): "
                f"start={tr.start_date}, end={tr.end_date}"
            )
            
            # Verify the calculation worked correctly
            if tr.start_date:
                days_span = (tr.end_date.date() - tr.start_date.date()).days
                expected_days = {
                    "1W": 5,
                    "1M": 20,
                    "3M": 60,
                    "1Y": 252
                }.get(time_range, None)
                if expected_days:
                    logger.info(
                        f"Market hours {time_range}: {days_span} calendar days "
                        f"(expected ~{expected_days} trading days, ~{int(expected_days * 1.4)} calendar days)"
                    )
                    
                    # Additional verification for 3M
                    if time_range == "3M":
                        # Compare with 1M to ensure they're different
                        tr_1m = TimeRange.from_shorthand("1M")
                        adjusted_start_1m, adjusted_end_1m = market_hours_service.adjust_time_range_for_trading_days(
                            tr_1m.start_date, tr_1m.end_date, "1M"
                        )
                        if adjusted_start_1m and tr.start_date:
                            days_diff = (tr.start_date.date() - adjusted_start_1m.date()).days
                            logger.info(
                                f"3M vs 1M comparison: 3M starts {days_diff} days before 1M "
                                f"(3M: {tr.start_date.date()}, 1M: {adjusted_start_1m.date()})"
                            )
                            if days_diff < 30:
                                logger.warning(
                                    f"WARNING: 3M start date is only {days_diff} days before 1M. "
                                    f"This suggests the calculation may be incorrect."
                                )
        elif trading_hours_mode == "extended":
            # Extended hours mode: use calendar days instead of trading days
            # This ensures we include weekends, holidays, and all hours (not just market hours)
            from datetime import timedelta
            if time_range == "1W":
                # 1W = 5 calendar days
                tr.start_date = tr.end_date - timedelta(days=5)
            elif time_range == "1M":
                # 1M = 30 calendar days
                tr.start_date = tr.end_date - timedelta(days=30)
            elif time_range == "3M":
                # 3M = 90 calendar days
                tr.start_date = tr.end_date - timedelta(days=90)
            elif time_range == "1Y":
                # 1Y = 365 calendar days
                tr.start_date = tr.end_date - timedelta(days=365)
            # For "ALL", keep original start_date (None)
            # Normalize to timezone-aware (UTC) for consistency with database timestamps
            if tr.start_date and tr.start_date.tzinfo is None:
                tr.start_date = pytz.utc.localize(tr.start_date)
            if tr.end_date.tzinfo is None:
                tr.end_date = pytz.utc.localize(tr.end_date)
            logger.info(
                f"Adjusted time range for extended hours ({time_range}): "
                f"start={tr.start_date}, end={tr.end_date} (calendar days - includes all hours/days)"
            )
        
        # Get current price
        current_price_obj = db.query(AssetPrice).filter(
            func.upper(AssetPrice.symbol) == ticker_upper
        ).first()
        current_price = float(current_price_obj.price) if current_price_obj else None
        
        # Get asset name - try to fetch full name from Alpaca first, fallback to Position table
        asset_name = None
        
        # Try to fetch full name from Alpaca asset API
        try:
            db_user = db.query(User).filter(User.id == user_id).first()
            if db_user and (db_user.alpaca_access_token or db_user.alpaca_api_key):
                alpaca_service = AlpacaTradingService(
                    access_token=db_user.alpaca_access_token if db_user.alpaca_access_token else None,
                    api_key=db_user.alpaca_api_key if db_user.alpaca_api_key else None,
                    secret_key=db_user.alpaca_secret_key if db_user.alpaca_secret_key else None,
                    use_paper=True
                )
                asset_info = await alpaca_service.get_asset(ticker_upper)
                if asset_info and asset_info.get("name"):
                    # Use full name from Alpaca (not condensed)
                    asset_name = asset_info.get("name")
                    logger.info(f"Fetched full asset name from Alpaca for {ticker_upper}: {asset_name}")
                    logger.info(f"Full Alpaca asset response for {ticker_upper}: {asset_info}")
        except Exception as e:
            logger.warning(f"Failed to fetch asset name from Alpaca for {ticker_upper}: {e}")
        
        # Fallback to Position table if Alpaca fetch failed
        if not asset_name:
            position = db.query(Position).filter(
                and_(
                    Position.user_id == user_id,
                    func.upper(Position.ticker) == ticker_upper
                )
            ).first()
            
            if position and position.name:
                # Check if name is different from ticker (case-insensitive)
                if position.name.upper() != ticker_upper:
                    # Use the name from Position table (already condensed, but we'll use it as-is)
                    asset_name = position.name
                    logger.info(f"Using condensed name from Position table for {ticker_upper}: {asset_name}")
                else:
                    # Name is same as ticker, treat as no name
                    asset_name = None
                    logger.debug(f"Position name for {ticker_upper} is same as ticker, ignoring")
        
        # Log for debugging
        if asset_name:
            logger.info(f"Using asset name for {ticker_upper}: {asset_name}")
        else:
            logger.warning(f"No asset name found for {ticker_upper} for user {user_id}")
        
        # Query position snapshots for this ticker within the time range
        query = db.query(
            PortfolioSnapshot.timestamp,
            PositionSnapshot.price_per_share,
            PositionSnapshot.current_value
        ).join(
            PositionSnapshot,
            PositionSnapshot.portfolio_snapshot_id == PortfolioSnapshot.id
        ).filter(
            and_(
                PortfolioSnapshot.user_id == user_id,
                func.upper(PositionSnapshot.ticker) == ticker_upper
            )
        )
        
        # Apply time range filter (all timestamps in UTC)
        # For 3M and 1Y market hours, we need to query back a bit further to ensure we have data
        # for backfilling missing trading days
        query_start_date = tr.start_date
        if (time_range == "3M" or time_range == "1Y") and trading_hours_mode == "market" and tr.start_date:
            # Query back an additional 10 trading days to ensure we have data for backfilling
            # This ensures we can get the previous trading day's closing price for missing days
            extra_days = 10
            if time_range == "3M":
                query_start_date = market_hours_service.get_n_trading_days_back(70, tr.end_date)
            elif time_range == "1Y":
                query_start_date = market_hours_service.get_n_trading_days_back(262, tr.end_date)  # 252 + 10
            logger.info(
                f"{time_range} market hours: Querying back to {query_start_date} ({extra_days} extra trading days) "
                f"to ensure data for backfilling missing days"
            )
        
        logger.info(
            f"About to apply time range filter: "
            f"start_date={tr.start_date}, query_start_date={query_start_date}, end_date={tr.end_date}, "
            f"time_range={time_range}, trading_hours_mode={trading_hours_mode}"
        )
        # Ensure all datetimes are timezone-aware (UTC) for SQLAlchemy comparisons
        # Database timestamps are timezone-aware, so filter datetimes must be too
        if query_start_date:
            if query_start_date.tzinfo is None:
                query_start_date = pytz.utc.localize(query_start_date)
            query = query.filter(PortfolioSnapshot.timestamp >= query_start_date)
        if tr.end_date.tzinfo is None:
            end_date_aware = pytz.utc.localize(tr.end_date)
        else:
            end_date_aware = tr.end_date
        query = query.filter(PortfolioSnapshot.timestamp <= end_date_aware)
        
        # Order by timestamp
        query = query.order_by(PortfolioSnapshot.timestamp.asc())
        
        # Get all snapshots
        snapshots = query.all()
        
        logger.info(
            f"Time range filter for {ticker_upper} ({time_range}, {trading_hours_mode}): "
            f"start={tr.start_date}, end={tr.end_date}, "
            f"found {len(snapshots)} snapshots"
        )
        
        # Log the actual date range for debugging
        if snapshots:
            first_timestamp = snapshots[0][0]
            last_timestamp = snapshots[-1][0]
            logger.info(
                f"Snapshot date range: {first_timestamp.date()} to {last_timestamp.date()}, "
                f"span: {(last_timestamp.date() - first_timestamp.date()).days} calendar days"
            )
            # Check if the first snapshot matches the expected start date
            if tr.start_date:
                expected_start = tr.start_date.date()
                actual_start = first_timestamp.date()
                if actual_start > expected_start:
                    logger.warning(
                        f"WARNING: First snapshot date ({actual_start}) is AFTER expected start date ({expected_start}). "
                        f"This suggests there's no data before {actual_start} in the database."
                    )
                elif actual_start < expected_start:
                    logger.warning(
                        f"WARNING: First snapshot date ({actual_start}) is BEFORE expected start date ({expected_start}). "
                        f"Query filter may not be working correctly."
                    )
        else:
            logger.warning(
                f"WARNING: No snapshots found for {ticker_upper} in time range "
                f"{tr.start_date.date() if tr.start_date else 'ALL'} to {tr.end_date.date()}"
            )
        
        # Log first and last snapshot timestamps for debugging
        if snapshots:
            # Snapshots are tuples: (timestamp, price_per_share, current_value)
            first_snapshot = snapshots[0][0]
            last_snapshot = snapshots[-1][0]
            logger.info(
                f"Snapshot range: first={first_snapshot}, last={last_snapshot}"
            )
        
        # Only fetch from Alpaca if we have NO snapshots at all
        # Always use position snapshots when available, even if price hasn't varied
        # This preserves the 5-minute snapshot data that users expect
        if not snapshots:
            logger.info(f"No snapshots found for {ticker_upper}, fetching historical data from Alpaca")
            historical_series = _fetch_historical_prices_from_alpaca(
                ticker_upper, 
                tr.start_date, 
                tr.end_date, 
                tr.granularity
            )
            
            if historical_series:
                return AssetPriceHistory(
                    ticker=ticker_upper,
                    name=asset_name,
                    current_price=current_price,
                    granularity=tr.granularity.value,
                    series=historical_series
                )
        
        # If we still have no snapshots after Alpaca fallback, return empty
        if not snapshots:
            return AssetPriceHistory(
                ticker=ticker_upper,
                name=asset_name,
                current_price=current_price,
                granularity=tr.granularity.value,
                series=[]
            )
        
        # Determine granularity (same logic as dashboard)
        granularity = tr.granularity
        
        # For asset charts, we want to preserve 5-minute snapshot granularity
        # Only bucket if we have an extremely large number of snapshots (>10,000)
        # This preserves the 5-minute granularity that users expect to see
        MAX_SNAPSHOTS_BEFORE_BUCKETING = 10000
        
        if len(snapshots) < MAX_SNAPSHOTS_BEFORE_BUCKETING:
            # Return all snapshots - preserve 5-minute granularity
            logger.info(f"Returning all {len(snapshots)} snapshots for {ticker_upper} (preserving 5-minute granularity)")
            
            # Target number of snapshots per day for normalization
            # Use 24 (hourly) as a reasonable default for consistency
            TARGET_POINTS_PER_DAY = 24
            
            # Filter to market hours only if market hours mode
            if trading_hours_mode == "market":
                market_hours_service = MarketHoursService()
                
                # For 1W time range, generate exact 5-minute intervals during market hours
                if time_range == "1W":
                    # First, filter to only trading days and market hours snapshots
                    filtered_snapshots = []
                    excluded_snapshots = []
                    for snap in snapshots:
                        snap_et = market_hours_service._to_et(snap[0])
                        snap_et_date = snap_et.date()
                        
                        # Only include trading days
                        if not market_hours_service.is_trading_day(snap_et_date):
                            excluded_snapshots.append((snap_et_date, snap_et, snap[0]))
                            continue
                        
                        # Only include market hours (9:30 AM - 4:00 PM ET)
                        if market_hours_service.is_market_open(snap[0]):
                            filtered_snapshots.append(snap)
                    
                    if excluded_snapshots:
                        # Log sample of excluded snapshots
                        sample_excluded = excluded_snapshots[:10]
                        logger.info(
                            f"Excluded {len(excluded_snapshots)} non-trading-day or non-market-hours snapshots for {ticker_upper} 1W. "
                            f"Sample: {[(d.strftime('%Y-%m-%d'), et.strftime('%Y-%m-%d %H:%M ET')) for d, et, _ in sample_excluded]}"
                        )
                    
                    logger.info(
                        f"Filtered to {len(filtered_snapshots)} market hours snapshots "
                        f"(from {len(snapshots)} total) for {ticker_upper} 1W market hours"
                    )
                    
                    # Generate exact 5-minute interval snapshots
                    snapshots = _generate_5minute_market_hours_snapshots(filtered_snapshots, market_hours_service)
                    
                    logger.info(
                        f"Generated {len(snapshots)} 5-minute interval snapshots for {ticker_upper} 1W market hours"
                    )
                else:
                    # For other time ranges (1M, 3M, 1Y, ALL), generate hourly intervals during market hours
                    # First, filter to only trading days and market hours snapshots
                    filtered_snapshots = []
                    excluded_snapshots = []
                    for snap in snapshots:
                        snap_et = market_hours_service._to_et(snap[0])
                        snap_et_date = snap_et.date()
                        
                        # Only include trading days
                        if not market_hours_service.is_trading_day(snap_et_date):
                            excluded_snapshots.append((snap_et_date, snap_et, snap[0]))
                            continue
                        
                        # Only include market hours (9:30 AM - 4:00 PM ET)
                        if market_hours_service.is_market_open(snap[0]):
                            filtered_snapshots.append(snap)
                    
                    if excluded_snapshots:
                        sample_excluded = excluded_snapshots[:10]
                        logger.info(
                            f"Excluded {len(excluded_snapshots)} non-trading-day or non-market-hours snapshots for {ticker_upper} {time_range}. "
                            f"Sample: {[(d.strftime('%Y-%m-%d'), et.strftime('%Y-%m-%d %H:%M ET')) for d, et, _ in sample_excluded]}"
                        )
                    
                    logger.info(
                        f"Filtered to {len(filtered_snapshots)} market hours snapshots "
                        f"(from {len(snapshots)} total) for {ticker_upper} {time_range} market hours"
                    )
                    
                    # Generate exact interval snapshots (3-hour for 1M, daily for 3M and 1Y, hourly for other ranges)
                    if time_range == "1M":
                        snapshots = _generate_3hour_market_hours_snapshots(filtered_snapshots, market_hours_service)
                        logger.info(
                            f"Generated {len(snapshots)} 3-hour interval snapshots for {ticker_upper} {time_range} market hours"
                        )
                    elif time_range == "3M" or time_range == "1Y":
                        # For 3M and 1Y, pass ALL snapshots (not filtered) to ensure we have data for backfilling
                        # The daily function will filter to trading days and find market close snapshots
                        # We need all snapshots to properly backfill missing trading days
                        snapshots = _generate_daily_market_hours_snapshots(
                            snapshots, tr.start_date, tr.end_date, market_hours_service
                        )
                        logger.info(
                            f"Generated {len(snapshots)} daily snapshots for {ticker_upper} {time_range} market hours"
                        )
                    else:
                        snapshots = _generate_hourly_market_hours_snapshots(filtered_snapshots, market_hours_service)
                        logger.info(
                            f"Generated {len(snapshots)} hourly interval snapshots for {ticker_upper} {time_range} market hours"
                        )
            elif trading_hours_mode == "extended":
                market_hours_service = MarketHoursService()
                
                # For 1W time range, generate exact 5-minute intervals for all calendar days
                if time_range == "1W":
                    # Generate 5-minute intervals for extended hours (all hours, all days)
                    # This includes weekends/holidays - uses actual prices if available, otherwise previous trading day's closing price
                    snapshots = _generate_5minute_extended_hours_snapshots(
                        snapshots, tr.start_date, tr.end_date, market_hours_service
                    )
                    
                    logger.info(
                        f"Generated {len(snapshots)} 5-minute interval snapshots for {ticker_upper} 1W extended hours"
                    )
                elif time_range == "1M":
                    # For 1M time range, generate exact 3-hour intervals for all calendar days
                    # Generate 3-hour intervals for extended hours (all hours, all days)
                    snapshots = _generate_3hour_extended_hours_snapshots(
                        snapshots, tr.start_date, tr.end_date, market_hours_service
                    )
                    
                    logger.info(
                        f"Generated {len(snapshots)} 3-hour interval snapshots for {ticker_upper} 1M extended hours"
                    )
                elif time_range == "3M":
                    # For 3M time range, generate exact daily snapshots for all calendar days
                    # Generate daily snapshots for extended hours (all days)
                    snapshots = _generate_daily_extended_hours_snapshots(
                        snapshots, tr.start_date, tr.end_date, market_hours_service
                    )
                    
                    logger.info(
                        f"Generated {len(snapshots)} daily snapshots for {ticker_upper} 3M extended hours"
                    )
                elif time_range == "1Y":
                    # For 1Y time range, generate exact daily snapshots for all calendar days
                    # Generate daily snapshots for extended hours (all days)
                    snapshots = _generate_daily_extended_hours_snapshots(
                        snapshots, tr.start_date, tr.end_date, market_hours_service
                    )
                    
                    logger.info(
                        f"Generated {len(snapshots)} daily snapshots for {ticker_upper} 1Y extended hours"
                    )
                else:
                    # For other time ranges (ALL), use existing normalization logic
                    # For extended hours mode, fill in missing calendar days with previous trading day's closing price
                    # This ensures holidays and weekends show on the chart with the actual closing price
                    from datetime import timedelta
                    logger.info(
                        f"Extended hours mode: starting with {len(snapshots)} snapshots, "
                        f"time range: {tr.start_date.date() if tr.start_date else None} to {tr.end_date.date()}"
                    )
                    filled_snapshots = _fill_missing_days_for_extended_hours(
                        snapshots, tr.start_date, tr.end_date, TARGET_POINTS_PER_DAY, market_hours_service
                    )
                    logger.info(
                        f"Extended hours mode: filled missing days - "
                        f"{len(filled_snapshots)} total snapshots (from {len(snapshots)} original)"
                    )
                    snapshots = filled_snapshots
                    
                    # Normalize to consistent points per day for extended hours
                    snapshots = _normalize_snapshots_per_day(snapshots, TARGET_POINTS_PER_DAY, market_hours_service)
                    logger.info(
                        f"Normalized extended hours snapshots to {TARGET_POINTS_PER_DAY} points per day: "
                        f"{len(snapshots)} total snapshots"
                    )
            
            # Convert snapshots (tuples) to PricePoint objects
            # Snapshots are tuples: (timestamp, price_per_share, current_value)
            series = [
                PricePoint(
                    timestamp=snap[0],  # timestamp
                    price=float(snap[1]),  # price_per_share
                    value=float(snap[2]) if snap[2] else None  # current_value
                )
                for snap in snapshots
            ]
        else:
            # Only bucket if we have an extremely large dataset (>10k snapshots)
            # Use hourly bucketing instead of daily to preserve more granularity
            logger.info(f"Bucketing {len(snapshots)} snapshots for {ticker_upper} (using hourly buckets)")
            
            # Target number of snapshots per day for normalization
            TARGET_POINTS_PER_DAY = 24
            
            bucketed = {}
            for snap in snapshots:
                # Snapshots are tuples: (timestamp, price_per_share, current_value)
                # Bucket by hour instead of day to preserve more granularity
                snap_timestamp = snap[0]
                bucket_key = snap_timestamp.replace(minute=0, second=0, microsecond=0)
                # Keep the latest snapshot in each bucket
                if bucket_key not in bucketed or snap_timestamp > bucketed[bucket_key][0]:
                    bucketed[bucket_key] = snap
            
            # Convert to sorted list
            bucketed_list = sorted(bucketed.values(), key=lambda x: x[0])
            
            # Filter to market hours only if market hours mode
            # For extended hours mode, return ALL bucketed snapshots (including weekends, holidays, after-hours)
            if trading_hours_mode == "market":
                market_hours_service = MarketHoursService()
                # Filter to only trading days (not just market hours)
                # This matches the non-bucketed path for consistency
                bucketed_list = [
                    snap for snap in bucketed_list
                    if market_hours_service.is_trading_day(
                        market_hours_service._to_et(snap[0]).date()
                    )
                ]
                logger.info(f"Filtered bucketed data to {len(bucketed_list)} trading day snapshots")
                
                # Normalize to consistent points per day for market hours
                bucketed_list = _normalize_snapshots_per_day(bucketed_list, TARGET_POINTS_PER_DAY, market_hours_service)
                logger.info(
                    f"Normalized bucketed market hours snapshots to {TARGET_POINTS_PER_DAY} points per day: "
                    f"{len(bucketed_list)} total snapshots"
                )
                
                # Post-normalization filtering: exclude current day if market hasn't opened yet
                # and prefer market hours snapshots for each day
                from collections import defaultdict
                current_date_et = market_hours_service._to_et(datetime.utcnow()).date()
                snapshots_by_date_after_norm = defaultdict(list)
                for snap in bucketed_list:
                    snap_et = market_hours_service._to_et(snap[0])
                    snap_et_date = snap_et.date()
                    snapshots_by_date_after_norm[snap_et_date].append(snap)
                
                final_bucketed = []
                for date, day_snapshots in sorted(snapshots_by_date_after_norm.items()):
                    # For the current day, if market hasn't opened yet, exclude it entirely from market hours view
                    if date == current_date_et:
                        # Check if market is currently open
                        if not market_hours_service.is_market_open(datetime.utcnow()):
                            # Market not open yet today - exclude today's data
                            logger.info(f"Excluding current day {date} from bucketed market hours view (market not open yet)")
                            continue
                    
                    # Separate market hours from non-market hours
                    market_hours_snaps = [s for s in day_snapshots if market_hours_service.is_market_open(s[0])]
                    non_market_hours_snaps = [s for s in day_snapshots if not market_hours_service.is_market_open(s[0])]
                    
                    # Prefer market hours snapshots, but use all if no market hours available
                    if market_hours_snaps:
                        # Use only market hours snapshots for this day
                        final_bucketed.extend(market_hours_snaps)
                        if non_market_hours_snaps:
                            logger.debug(
                                f"Bucketed day {date}: Using {len(market_hours_snaps)} market hours snapshots, "
                                f"excluding {len(non_market_hours_snaps)} non-market-hours snapshots"
                            )
                    else:
                        # No market hours snapshots available - use all snapshots for this day
                        final_bucketed.extend(day_snapshots)
                        logger.debug(
                            f"Bucketed day {date}: No market hours snapshots, using {len(day_snapshots)} total snapshots"
                        )
                
                bucketed_list = sorted(final_bucketed, key=lambda x: x[0])
            else:
                # Extended hours mode: return all bucketed snapshots (no filtering)
                logger.info(
                    f"Extended hours mode: returning all {len(bucketed_list)} bucketed snapshots "
                    f"(including non-trading days/hours)"
                )
                
                # For extended hours with large datasets, we still need to fill missing days
                # and normalize to consistent points per day
                market_hours_service = MarketHoursService()
                filled_bucketed = _fill_missing_days_for_extended_hours(
                    bucketed_list, tr.start_date, tr.end_date, TARGET_POINTS_PER_DAY, market_hours_service
                )
                bucketed_list = _normalize_snapshots_per_day(filled_bucketed, TARGET_POINTS_PER_DAY, market_hours_service)
                logger.info(
                    f"Normalized bucketed extended hours snapshots to {TARGET_POINTS_PER_DAY} points per day: "
                    f"{len(bucketed_list)} total snapshots"
                )
            
            # Convert snapshots (tuples) to PricePoint objects
            # Snapshots are tuples: (timestamp, price_per_share, current_value)
            series = [
                PricePoint(
                    timestamp=snap[0],  # timestamp
                    price=float(snap[1]),  # price_per_share
                    value=float(snap[2]) if snap[2] else None  # current_value
                )
                for snap in bucketed_list
            ]
            logger.info(f"After bucketing and normalization: {len(series)} data points")
        
        # Add current price as the latest point if we have it
        if current_price and series:
            # Only add if it's newer than the last snapshot
            last_timestamp = series[-1].timestamp
            # Ensure now is timezone-aware (UTC) to match database timestamps
            now = datetime.utcnow()
            if now.tzinfo is None:
                now = pytz.utc.localize(now)
            # Ensure last_timestamp is timezone-aware for comparison
            if last_timestamp.tzinfo is None:
                last_timestamp = pytz.utc.localize(last_timestamp)
            if (now - last_timestamp).total_seconds() > 60:  # More than 1 minute difference
                series.append(PricePoint(
                    timestamp=now,
                    price=current_price,
                    value=None
                ))
        elif current_price and not series:
            # If no historical data, just return current price
            now = datetime.utcnow()
            if now.tzinfo is None:
                now = pytz.utc.localize(now)
            series = [PricePoint(
                timestamp=now,
                price=current_price,
                value=None
            )]
        
        return AssetPriceHistory(
            ticker=ticker_upper,
            name=asset_name,
            current_price=current_price,
            granularity=granularity.value,
            series=series
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching asset price history: {str(e)}"
        )


@router.get("/{ticker}/parent-nav", response_model=ParentNAVHistory)
async def get_parent_nav_history(
    ticker: str,
    time_range: str = Query("1M", regex="^(1W|1M|3M|1Y|ALL)$", description="Time range: 1W, 1M, 3M, 1Y, or ALL"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get NAV history for the parent company of the given ticker.
    
    Args:
        ticker: Asset ticker (e.g., "STRC") - will look up parent (MSTR)
        time_range: Time range shorthand (1W, 1M, 3M, 1Y, ALL)
        db: Database session
        user: Authenticated user from JWT
    
    Returns:
        ParentNAVHistory with NAV series for parent company
    """
    try:
        from app.core.utils import get_parent_ticker
        from app.models.asset_metrics import AssetMetrics
        from app.services.dashboard.models.time_range import TimeRange
        from app.services.nav_service import fetch_mnav_latest
        
        user_id = int(user.get("user_id"))
        ticker_upper = ticker.upper()
        
        # Get parent ticker
        parent_ticker = get_parent_ticker(ticker_upper)
        if not parent_ticker:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No parent company found for ticker {ticker}"
            )
        
        # Try to fetch from /api/v1/companies/:symbol/latest endpoint first
        from app.services.nav_service import fetch_company_latest
        mnav_data = fetch_company_latest(parent_ticker)
        
        # Extract current_nav from mnav_data if available
        current_nav_from_api = None
        if mnav_data:
            # Try different possible field names for NAV
            current_nav_from_api = (
                mnav_data.get("mNav") or 
                mnav_data.get("mnav") or 
                mnav_data.get("nav") or
                mnav_data.get("current_nav") or
                mnav_data.get("value")
            )
            if current_nav_from_api is not None:
                try:
                    current_nav_from_api = float(current_nav_from_api)
                except (ValueError, TypeError):
                    current_nav_from_api = None
        
        # Convert time range
        tr = TimeRange.from_shorthand(time_range)
        
        # Query NAV metrics for parent company
        query = db.query(AssetMetrics).filter(
            AssetMetrics.ticker == parent_ticker,
            AssetMetrics.metric_type == "nav",
            AssetMetrics.is_parent_level == True
        )
        
        if tr.start_date:
            query = query.filter(AssetMetrics.timestamp >= tr.start_date)
        query = query.filter(AssetMetrics.timestamp <= tr.end_date)
        
        metrics = query.order_by(AssetMetrics.timestamp.asc()).all()
        
        # Build series
        series = [
            MetricPoint(timestamp=m.timestamp, value=float(m.value))
            for m in metrics
        ]
        
        # Get current NAV (prefer from API, fallback to most recent from DB)
        current_nav = current_nav_from_api
        if current_nav is None and metrics:
            current_nav = float(metrics[-1].value)
        
        return ParentNAVHistory(
            parent_ticker=parent_ticker,
            current_nav=current_nav,
            granularity="daily",  # NAV is typically daily
            series=series,
            mnav_data=mnav_data  # Include all data from mnav/latest endpoint
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching parent NAV history: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching parent NAV history: {str(e)}"
        )


@router.get("/{ticker}/holdings", response_model=HoldingsResponse)
async def get_asset_holdings(
    ticker: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Get holdings data for a specific asset including position amount and total dividends.
    
    Args:
        ticker: Stock ticker symbol (e.g., "STRC", "AAPL")
        db: Database session
        user: Authenticated user from JWT
    
    Returns:
        HoldingsResponse with position_amount, shares, and total_dividends
    """
    try:
        from decimal import Decimal
        
        user_id = int(user.get("user_id"))
        ticker_upper = ticker.upper()
        
        # Get position for this ticker and user
        position = db.query(Position).filter(
            Position.user_id == user_id,
            Position.ticker == ticker_upper,
            Position.shares > 0
        ).first()
        
        # Calculate position amount (market_value if available, otherwise shares * current_price)
        position_amount = 0.0
        shares = 0.0
        
        if position:
            shares = float(position.shares)
            
            # If market_value is available, use it
            if position.market_value is not None:
                position_amount = float(position.market_value)
            else:
                # Fallback: calculate from current price
                price_service = PriceService()
                symbols = [ticker_upper]
                prices = price_service.get_prices(db, symbols)
                price = prices.get(ticker_upper)
                
                if price is not None:
                    position_amount = shares * float(price)
                else:
                    # If no price available, set to 0
                    position_amount = 0.0
        
        # Get total dividends paid for this ticker (all time)
        total_dividends_query = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
            Dividend.user_id == user_id,
            Dividend.ticker == ticker_upper,
            Dividend.status == DividendStatus.PAID
        )
        total_dividends_decimal = total_dividends_query.scalar() or Decimal('0.00')
        total_dividends = float(total_dividends_decimal)
        
        # Get next upcoming dividend (for ex-date and pay-date)
        # Include dividends where ex-date has passed but payment date hasn't occurred yet
        next_dividend = None
        if position:
            today = date.today()
            
            # Find dividends that are upcoming based on payment date, even if ex-date has passed
            # This handles the case where ex-date is in the past but payment is still pending
            next_dividend = db.query(Dividend).filter(
                Dividend.user_id == user_id,
                Dividend.ticker == ticker_upper,
                Dividend.status == DividendStatus.UPCOMING,
                or_(
                    # Ex-date hasn't passed yet
                    and_(
                        Dividend.ex_date.isnot(None),
                        Dividend.ex_date >= today
                    ),
                    # OR ex-date has passed but payment date hasn't occurred yet
                    and_(
                        Dividend.ex_date.isnot(None),
                        Dividend.ex_date < today,
                        or_(
                            and_(Dividend.pay_date.isnot(None), Dividend.pay_date >= today),
                            and_(Dividend.pay_date_adjusted.isnot(None), Dividend.pay_date_adjusted >= today)
                        )
                    )
                )
            ).order_by(
                # Order by payment date (adjusted if available) to get the next payment
                func.coalesce(Dividend.pay_date_adjusted, Dividend.pay_date, Dividend.ex_date).asc()
            ).first()
        
        return HoldingsResponse(
            ticker=ticker_upper,
            position_amount=position_amount,
            shares=shares,
            total_dividends=total_dividends,
            next_ex_date=next_dividend.ex_date if next_dividend and next_dividend.ex_date else None,
            next_invest_by_date=next_dividend.invest_by_date if next_dividend and next_dividend.invest_by_date else None,
            next_pay_date=next_dividend.pay_date if next_dividend and next_dividend.pay_date else None,
            next_pay_date_adjusted=next_dividend.pay_date_adjusted if next_dividend and next_dividend.pay_date_adjusted else None
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching holdings for {ticker}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching holdings: {str(e)}"
        )


# Share image endpoints
UPLOAD_DIR = Path(settings.SHARE_IMAGE_UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/share-image")
async def upload_share_image(
    image: UploadFile = File(...),
    ticker: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload a chart image for sharing.
    Returns a shareable URL that will open the app via Universal Links.
    """
    try:
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        file_ext = image.filename.split('.')[-1] if '.' in image.filename else 'png'
        filename = f"{file_id}.{file_ext}"
        file_path = UPLOAD_DIR / filename
        
        # Save the image
        with open(file_path, "wb") as buffer:
            content = await image.read()
            buffer.write(content)
        
        # Return shareable URL
        base_url = settings.SHARE_IMAGE_BASE_URL.rstrip('/')
        share_url = f"{base_url}/api/assets/share/asset/{ticker}?id={file_id}"
        
        return {
            "shareUrl": share_url,
            "fileId": file_id
        }
    except Exception as e:
        logger.error(f"Error uploading share image: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading image: {str(e)}"
        )


@router.get("/share/asset/{ticker}", response_class=HTMLResponse)
async def share_asset_page(ticker: str, id: Optional[str] = Query(None)):
    """
    Share page that displays the chart image and includes Universal Link metadata.
    When clicked in iMessage, this will open the app via deep link.
    """
    # Find the image file
    image_path = None
    image_url = None
    
    if id:
        for file in UPLOAD_DIR.glob(f"{id}.*"):
            if file.exists():
                image_path = file
                base_url = settings.SHARE_IMAGE_BASE_URL.rstrip('/')
                image_url = f"{base_url}/api/assets/share-image/{file.name}"
                break
    
    # HTML page with image and Universal Link metadata
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{ticker} Price Chart</title>
        
        <!-- Open Graph / Facebook / iMessage Rich Preview -->
        <meta property="og:type" content="website">
        <meta property="og:title" content="{ticker} Price Chart">
        <meta property="og:description" content="View {ticker} price chart in STRC Tracker">
        {f'<meta property="og:image" content="{image_url}">' if image_url else ''}
        <meta property="og:url" content="{settings.SHARE_IMAGE_BASE_URL}/api/assets/share/asset/{ticker}">
        
        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{ticker} Price Chart">
        {f'<meta name="twitter:image" content="{image_url}">' if image_url else ''}
        
        <!-- Apple Universal Links - Smart App Banner -->
        <meta name="apple-itunes-app" content="app-id=YOUR_APP_ID">
        
        <!-- Auto-redirect to app if installed -->
        <script>
            // Try to open app via deep link
            window.location = "strctracker://asset/{ticker}";
            
            // Fallback: show page content after 500ms if app didn't open
            setTimeout(function() {{
                document.getElementById('fallback').style.display = 'block';
            }}, 500);
        </script>
        
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f5f5f5;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
            }}
            .container {{
                background: white;
                border-radius: 16px;
                padding: 24px;
                max-width: 600px;
                width: 100%;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                text-align: center;
            }}
            h1 {{
                margin: 0 0 20px 0;
                color: #333;
            }}
            img {{
                max-width: 100%;
                height: auto;
                border-radius: 8px;
                margin: 20px 0;
            }}
            .app-link {{
                display: inline-block;
                margin-top: 20px;
                padding: 12px 24px;
                background: #007AFF;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
            }}
            .app-link:hover {{
                background: #0056CC;
            }}
            #fallback {{
                display: none;
            }}
        </style>
    </head>
    <body>
        <div class="container" id="fallback">
            <h1>{ticker} Price Chart</h1>
            {f'<img src="/api/assets/share-image/{image_path.name}" alt="{ticker} Chart" />' if image_path else '<p>Chart image not found</p>'}
            <a href="strctracker://asset/{ticker}" class="app-link">Open in STRC Tracker App</a>
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
                If the app didn't open automatically, tap the button above.
            </p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@router.get("/share-image/{filename}")
async def get_share_image(filename: str):
    """
    Serve the uploaded share image file.
    """
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found"
        )
    
    return FileResponse(
        path=file_path,
        media_type="image/png" if filename.endswith('.png') else "image/jpeg"
    )

