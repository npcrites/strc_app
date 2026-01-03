"""
Position query layer for dashboard
Uses PositionSnapshot table for historical data (not Position table)
"""
from typing import List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from app.models.position_snapshot import PositionSnapshot as PositionSnapshotModel
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.services.dashboard.models.time_range import TimeGranularity


@dataclass
class PositionSnapshot:
    """DTO for raw position data"""
    position_id: int
    ticker: Optional[str]  # ticker symbol
    asset_type: Optional[str]
    quantity: float  # shares
    price: Optional[float]  # price per share
    value: float  # total market value
    timestamp: datetime


def get_position_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[PositionSnapshot]:
    """
    Get position snapshots at start and end of range from PositionSnapshot table.
    
    Returns the last snapshot on/before start_date and on/before end_date.
    This ensures reproducible historical calculations.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of PositionSnapshot objects
    """
    snapshots = []
    
    # Get baseline snapshot (at or before start_date)
    if start_date and start_date != end_date:
        # Find the earliest portfolio snapshot in range
        earliest_portfolio_snapshot = db.query(PortfolioSnapshot).filter(
            and_(
                PortfolioSnapshot.user_id == user_id,
                PortfolioSnapshot.timestamp >= start_date,
                PortfolioSnapshot.timestamp <= end_date
            )
        ).order_by(PortfolioSnapshot.timestamp.asc()).first()
        
        if earliest_portfolio_snapshot:
            # Get all position snapshots for this portfolio snapshot
            position_snapshots = db.query(PositionSnapshotModel).filter(
                PositionSnapshotModel.portfolio_snapshot_id == earliest_portfolio_snapshot.id
            ).all()
            
            for pos_snap in position_snapshots:
                snapshots.append(_position_snapshot_to_dto(pos_snap, earliest_portfolio_snapshot.timestamp))
    elif start_date is None:
        # For "ALL" time range, get the very first snapshot ever
        first_portfolio_snapshot = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user_id
        ).order_by(PortfolioSnapshot.timestamp.asc()).first()
        
        if first_portfolio_snapshot:
            position_snapshots = db.query(PositionSnapshotModel).filter(
                PositionSnapshotModel.portfolio_snapshot_id == first_portfolio_snapshot.id
            ).all()
            
            for pos_snap in position_snapshots:
                snapshots.append(_position_snapshot_to_dto(pos_snap, first_portfolio_snapshot.timestamp))
    
    # Get end-of-range snapshot (most recent before end_date)
    latest_portfolio_snapshot = db.query(PortfolioSnapshot).filter(
        and_(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.timestamp <= end_date
        )
    ).order_by(PortfolioSnapshot.timestamp.desc()).first()
    
    if latest_portfolio_snapshot:
        # Only add if different from baseline (or if no baseline was set)
        if not snapshots or snapshots[0].timestamp != latest_portfolio_snapshot.timestamp:
            position_snapshots = db.query(PositionSnapshotModel).filter(
                PositionSnapshotModel.portfolio_snapshot_id == latest_portfolio_snapshot.id
            ).all()
            
            for pos_snap in position_snapshots:
                snapshots.append(_position_snapshot_to_dto(pos_snap, latest_portfolio_snapshot.timestamp))
    
    return snapshots


def _get_bucket_key(timestamp: datetime, granularity: TimeGranularity) -> datetime:
    """
    Round timestamp to bucket boundary based on granularity.
    
    Args:
        timestamp: Original timestamp
        granularity: Time granularity (DAILY, WEEKLY, MONTHLY)
    
    Returns:
        Rounded timestamp at bucket boundary
    """
    if granularity == TimeGranularity.DAILY:
        # Round to midnight (start of day)
        return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)
    elif granularity == TimeGranularity.WEEKLY:
        # Round to start of week (Monday at midnight)
        days_since_monday = timestamp.weekday()
        week_start = timestamp - timedelta(days=days_since_monday)
        return week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    elif granularity == TimeGranularity.MONTHLY:
        # Round to start of month
        return timestamp.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        # Default to daily
        return timestamp.replace(hour=0, minute=0, second=0, microsecond=0)


def _determine_granularity_from_range(
    start_date: Optional[datetime],
    end_date: datetime
) -> TimeGranularity:
    """
    Determine appropriate granularity based on date range.
    
    Uses more granular data for shorter timeframes:
    - < 1 day: Return all snapshots (no bucketing) - handled separately
    - 1-7 days: Daily buckets
    - 7-90 days: Daily buckets  
    - 90-365 days: Weekly buckets
    - > 365 days: Monthly buckets
    
    Args:
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        TimeGranularity enum value
    """
    if start_date is None:
        # ALL time range - use monthly
        return TimeGranularity.MONTHLY
    
    delta = end_date - start_date
    days = delta.total_seconds() / 86400
    
    if days <= 1:
        # Very short range (< 1 day) - use daily (will return all snapshots from same day)
        return TimeGranularity.DAILY
    elif days <= 90:
        # Short to medium range - use daily
        return TimeGranularity.DAILY
    elif days <= 365:
        # Medium to long range - use weekly
        return TimeGranularity.WEEKLY
    else:
        # Very long range - use monthly
        return TimeGranularity.MONTHLY


def get_daily_position_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
    granularity: Optional[TimeGranularity] = None,
) -> List[PositionSnapshot]:
    """
    Get position snapshots for charting, bucketed by granularity.
    
    Returns the most recent snapshot for each time bucket (day/week/month).
    Uses higher granularity for shorter timeframes to show more detail.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
        granularity: Time granularity (DAILY, WEEKLY, MONTHLY). If None, auto-detects from range.
    
    Returns:
        List of PositionSnapshot objects, one per time bucket
    """
    # Auto-detect granularity if not provided
    if granularity is None:
        granularity = _determine_granularity_from_range(start_date, end_date)
    
    # Query portfolio snapshots in range
    query = db.query(PortfolioSnapshot).filter(
        and_(
            PortfolioSnapshot.user_id == user_id,
            PortfolioSnapshot.timestamp <= end_date
        )
    )
    
    if start_date:
        query = query.filter(PortfolioSnapshot.timestamp >= start_date)
    
    # Get all portfolio snapshots ordered by timestamp (descending to get most recent per bucket)
    portfolio_snapshots = query.order_by(desc(PortfolioSnapshot.timestamp)).all()
    
    if not portfolio_snapshots:
        return []
    
    # Check if all snapshots are from the same month (for monthly granularity)
    # If so, downgrade to daily granularity to provide more data points
    if granularity == TimeGranularity.MONTHLY:
        first_month = portfolio_snapshots[-1].timestamp.replace(day=1, hour=0, minute=0, second=0, microsecond=0)  # Oldest
        last_month = portfolio_snapshots[0].timestamp.replace(day=1, hour=0, minute=0, second=0, microsecond=0)  # Newest
        
        if first_month == last_month:
            # All snapshots from same month - use daily granularity instead
            granularity = TimeGranularity.DAILY
    
    # For very short ranges with daily granularity, check if we should return all snapshots
    # If all snapshots are from the same day and we have < 30 snapshots, return all
    if granularity == TimeGranularity.DAILY and portfolio_snapshots:
        # Check if all snapshots are from the same day
        first_date = portfolio_snapshots[-1].timestamp.date()  # Oldest (last in desc order)
        last_date = portfolio_snapshots[0].timestamp.date()   # Newest (first in desc order)
        
        if first_date == last_date and len(portfolio_snapshots) <= 30:
            # All snapshots from same day and not too many - return all for better granularity
            result = []
            for portfolio_snap in reversed(portfolio_snapshots):  # Chronological order
                position_snapshots = db.query(PositionSnapshotModel).filter(
                    PositionSnapshotModel.portfolio_snapshot_id == portfolio_snap.id
                ).all()
                
                for pos_snap in position_snapshots:
                    result.append(_position_snapshot_to_dto(pos_snap, portfolio_snap.timestamp))
            
            return result
    
    # Group by bucket, keep most recent snapshot per bucket
    seen_buckets = {}
    result = []
    
    for portfolio_snap in portfolio_snapshots:
        # Round timestamp to bucket boundary
        bucket_key = _get_bucket_key(portfolio_snap.timestamp, granularity)
        
        # Only process first occurrence of each bucket (most recent snapshot in bucket)
        if bucket_key not in seen_buckets:
            seen_buckets[bucket_key] = True
            # Get all position snapshots for this portfolio snapshot
            position_snapshots = db.query(PositionSnapshotModel).filter(
                PositionSnapshotModel.portfolio_snapshot_id == portfolio_snap.id
            ).all()
            
            for pos_snap in position_snapshots:
                result.append(_position_snapshot_to_dto(pos_snap, portfolio_snap.timestamp))
    
    # Return in chronological order
    return sorted(result, key=lambda x: x.timestamp)


def _position_snapshot_to_dto(pos_snap: PositionSnapshotModel, timestamp: datetime) -> PositionSnapshot:
    """Convert PositionSnapshot model to DTO"""
    shares = float(pos_snap.shares) if pos_snap.shares else 0.0
    price = float(pos_snap.price_per_share) if pos_snap.price_per_share else None
    value = float(pos_snap.current_value) if pos_snap.current_value else 0.0
    
    return PositionSnapshot(
        position_id=pos_snap.id,
        ticker=pos_snap.ticker,  # Include ticker from model
        asset_type=None,  # PositionSnapshot table doesn't store asset_type
        quantity=shares,
        price=price,
        value=value,
        timestamp=timestamp,  # Use portfolio snapshot timestamp
    )

