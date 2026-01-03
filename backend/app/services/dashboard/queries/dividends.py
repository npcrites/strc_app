"""
Dividend query layer for dashboard - returns cash flow snapshots
"""
from typing import List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.models.dividend import Dividend
from app.services.dashboard.models.time_range import TimeGranularity


@dataclass
class CashFlowSnapshot:
    """DTO for cash flow events (dividends/interest)"""
    position_id: Optional[int]
    timestamp: datetime
    amount: float  # Positive for dividends received


def get_dividends_in_range(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[Dividend]:
    """
    Get dividends within time range (legacy method for compatibility).
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of Dividend objects
    """
    query = db.query(Dividend).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.pay_date <= end_date
        )
    )
    
    if start_date:
        query = query.filter(Dividend.pay_date >= start_date)
    
    return query.order_by(Dividend.pay_date).all()


def get_cash_flow_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[CashFlowSnapshot]:
    """
    Get cash flow snapshots (dividends/interest) for dashboard.
    
    Returns timestamped cash flows in the requested range.
    Handles empty portfolios or missing data gracefully.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of CashFlowSnapshot objects, ordered by timestamp
    """
    query = db.query(Dividend).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.pay_date <= end_date
        )
    )
    
    if start_date:
        query = query.filter(Dividend.pay_date >= start_date)
    
    dividends = query.order_by(Dividend.pay_date).all()
    
    # Convert to CashFlowSnapshot DTOs
    snapshots = []
    for div in dividends:
        # Use pay_date as timestamp for cash flow
        # Convert Date to datetime for consistency
        if isinstance(div.pay_date, datetime):
            timestamp = div.pay_date
        else:
            # Convert date to datetime at midnight
            timestamp = datetime.combine(div.pay_date, datetime.min.time())
        
        # Amount is positive for dividends received
        amount = float(div.amount) if div.amount else 0.0
        
        snapshots.append(
            CashFlowSnapshot(
                position_id=div.position_id,
                timestamp=timestamp,
                amount=amount
            )
        )
    
    return snapshots


def _get_bucket_key_for_date(date: datetime, granularity: TimeGranularity) -> datetime:
    """
    Round date to bucket boundary based on granularity.
    
    Args:
        date: Original date/datetime
        granularity: Time granularity (DAILY, WEEKLY, MONTHLY)
    
    Returns:
        Rounded datetime at bucket boundary
    """
    if isinstance(date, datetime):
        dt = date
    else:
        dt = datetime.combine(date, datetime.min.time())
    
    if granularity == TimeGranularity.DAILY:
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    elif granularity == TimeGranularity.WEEKLY:
        days_since_monday = dt.weekday()
        week_start = dt - timedelta(days=days_since_monday)
        return week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif granularity == TimeGranularity.MONTHLY:
        return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def get_daily_cash_flow_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
    granularity: Optional[TimeGranularity] = None,
) -> List[CashFlowSnapshot]:
    """
    Get aggregated cash flow snapshots for charting, bucketed by granularity.
    
    Aggregates multiple dividends in the same time bucket into a single snapshot.
    Uses higher granularity for shorter timeframes to show more detail.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        granularity: Time granularity (DAILY, WEEKLY, MONTHLY). If None, auto-detects from range.
    
    Returns:
        List of CashFlowSnapshot objects, one per time bucket with aggregated amounts
    """
    # Auto-detect granularity if not provided
    if granularity is None:
        if start_date is None:
            granularity = TimeGranularity.MONTHLY
        else:
            delta = end_date - start_date
            days = delta.total_seconds() / 86400
            if days <= 90:
                granularity = TimeGranularity.DAILY
            elif days <= 365:
                granularity = TimeGranularity.WEEKLY
            else:
                granularity = TimeGranularity.MONTHLY
    
    query = db.query(Dividend).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.pay_date <= end_date
        )
    )
    
    if start_date:
        query = query.filter(Dividend.pay_date >= start_date)
    
    dividends = query.order_by(Dividend.pay_date).all()
    
    # Group by bucket and aggregate amounts
    bucket_map = {}
    for div in dividends:
        # Convert pay_date to datetime
        if isinstance(div.pay_date, datetime):
            div_date = div.pay_date
        else:
            div_date = datetime.combine(div.pay_date, datetime.min.time())
        
        # Get bucket key
        bucket_key = _get_bucket_key_for_date(div_date, granularity)
        
        # Aggregate amounts per bucket
        if bucket_key not in bucket_map:
            bucket_map[bucket_key] = 0.0
        
        amount = float(div.amount) if div.amount else 0.0
        bucket_map[bucket_key] += amount
    
    # Convert to CashFlowSnapshot list
    snapshots = [
        CashFlowSnapshot(
            position_id=None,  # Aggregated, no single position
            timestamp=bucket_key,
            amount=amount
        )
        for bucket_key, amount in sorted(bucket_map.items())
    ]
    
    return snapshots
