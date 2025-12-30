"""
Dividend query layer for dashboard - returns cash flow snapshots
"""
from typing import List, Optional
from datetime import datetime
from dataclasses import dataclass
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from app.models.dividend import Dividend


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


def get_daily_cash_flow_snapshots(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[CashFlowSnapshot]:
    """
    Get daily aggregated cash flow snapshots for charting.
    
    Aggregates multiple dividends on the same day into a single snapshot.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of CashFlowSnapshot objects, one per day with aggregated amounts
    """
    query = db.query(
        Dividend.pay_date,
        func.sum(Dividend.amount).label('total_amount')
    ).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.pay_date <= end_date
        )
    )
    
    if start_date:
        query = query.filter(Dividend.pay_date >= start_date)
    
    # Group by date and sum amounts
    daily_aggregates = query.group_by(Dividend.pay_date).order_by(Dividend.pay_date).all()
    
    snapshots = []
    for date, total_amount in daily_aggregates:
        # Convert Date to datetime for consistency
        if isinstance(date, datetime):
            timestamp = date
        else:
            # Convert date to datetime at midnight
            timestamp = datetime.combine(date, datetime.min.time())
        
        snapshots.append(
            CashFlowSnapshot(
                position_id=None,  # Aggregated, no single position
                timestamp=timestamp,
                amount=float(total_amount) if total_amount else 0.0
            )
        )
    
    return snapshots
