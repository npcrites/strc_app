"""
Position query layer for dashboard
"""
from typing import List, Optional
from datetime import datetime
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, func

from app.models.position import Position


@dataclass
class PositionSnapshot:
    """DTO for raw position data"""
    position_id: int
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
    Get position snapshots at start and end of range.
    
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
    # Base query for user's positions
    base_query = db.query(Position).filter(
        and_(
            Position.user_id == user_id,
            Position.snapshot_timestamp <= end_date
        )
    )
    
    snapshots = []
    
    # Get baseline snapshot (at or before start_date)
    if start_date and start_date != end_date:
        # Get the earliest timestamp in range
        earliest_timestamp_subquery = db.query(
            func.min(Position.snapshot_timestamp)
        ).filter(
            and_(
                Position.user_id == user_id,
                Position.snapshot_timestamp >= start_date,
                Position.snapshot_timestamp <= end_date
            )
        ).scalar()
        
        if earliest_timestamp_subquery:
            baseline_positions = db.query(Position).filter(
                and_(
                    Position.user_id == user_id,
                    Position.snapshot_timestamp == earliest_timestamp_subquery
                )
            ).all()
            
            for pos in baseline_positions:
                snapshots.append(_position_to_snapshot(pos))
    
    # Get end-of-range snapshot (most recent before end_date)
    # When start_date == end_date, just get the most recent positions
    end_positions = base_query.order_by(desc(Position.snapshot_timestamp)).all()
    
    if end_positions:
        # Group by date (not exact timestamp) to get all positions from the most recent day
        # This handles cases where positions have slightly different timestamps
        latest_date = end_positions[0].snapshot_timestamp.date()
        latest_timestamp = end_positions[0].snapshot_timestamp
        
        # Only add if different from baseline (or if no baseline was set)
        if not snapshots or snapshots[0].timestamp.date() != latest_date:
            for pos in end_positions:
                # Include all positions from the most recent date
                if pos.snapshot_timestamp.date() == latest_date:
                    snapshots.append(_position_to_snapshot(pos))
    
    return snapshots


def get_daily_position_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[PositionSnapshot]:
    """
    Get one snapshot per day for charting.
    
    Returns the most recent snapshot for each day in the range.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of PositionSnapshot objects, one per day
    """
    query = db.query(Position).filter(
        and_(
            Position.user_id == user_id,
            Position.snapshot_timestamp <= end_date
        )
    )
    
    if start_date:
        query = query.filter(Position.snapshot_timestamp >= start_date)
    
    # Get all positions ordered by timestamp
    all_positions = query.order_by(desc(Position.snapshot_timestamp)).all()
    
    # Group by date, keep most recent snapshot per day
    seen_dates = {}
    result = []
    
    for pos in all_positions:
        date_key = pos.snapshot_timestamp.date()
        if date_key not in seen_dates:
            seen_dates[date_key] = True
            result.append(_position_to_snapshot(pos))
    
    # Return in chronological order
    return sorted(result, key=lambda x: x.timestamp)


def _position_to_snapshot(position: Position) -> PositionSnapshot:
    """Convert Position model to PositionSnapshot DTO"""
    market_value = float(position.market_value) if position.market_value else 0.0
    shares = float(position.shares) if position.shares else 0.0
    
    # Calculate price per share
    price = None
    if shares > 0:
        price = market_value / shares
    
    return PositionSnapshot(
        position_id=position.id,
        asset_type=position.asset_type or "OTHER",
        quantity=shares,
        price=price,
        value=market_value,
        timestamp=position.snapshot_timestamp,
    )

