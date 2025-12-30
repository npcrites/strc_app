"""
Activity query layer for dashboard - portfolio events (trades, dividends)
"""
from typing import List, Optional
from datetime import datetime, date
from dataclasses import dataclass
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.dividend import Dividend, DividendStatus
from app.models.position import Position


class ActivityType(str, Enum):
    """Activity type enumeration"""
    BUY = "BUY"
    SELL = "SELL"
    DIVIDEND = "DIVIDEND"
    UPCOMING_DIVIDEND = "UPCOMING_DIVIDEND"


@dataclass
class ActivityItem:
    """DTO for portfolio activity events"""
    timestamp: datetime
    activity_type: ActivityType
    position_id: Optional[int]
    asset_type: Optional[str]
    quantity: float = 0.0
    value: float = 0.0
    dividend_amount: float = 0.0
    ex_date: Optional[datetime] = None
    ticker: Optional[str] = None  # For display purposes


def get_trades(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[ActivityItem]:
    """
    Return all trades (BUY/SELL) for the user in the given date range.
    
    Note: Currently, trades are inferred from position changes or would come from
    Plaid investment transactions. For MVP, this returns empty list.
    Future: When Transaction model exists, map DB rows to ActivityItem.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of ActivityItem objects for trades, sorted chronologically
    """
    # TODO: Implement when Transaction model exists
    # For now, return empty list - trades will be added when transaction tracking is implemented
    # This could also pull from Plaid investment_transactions if needed
    return []


def get_paid_dividends(
    db: Session,
    user_id: int,
    start_date: Optional[datetime],
    end_date: datetime,
) -> List[ActivityItem]:
    """
    Return all dividends actually paid in the given range.
    
    Maps Dividend model rows to ActivityItem DTOs.
    Handles empty results gracefully.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        start_date: Start of time range (None for ALL)
        end_date: End of time range
    
    Returns:
        List of ActivityItem objects for paid dividends, sorted chronologically
    """
    query = db.query(Dividend).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.status == DividendStatus.PAID,
            Dividend.pay_date <= end_date
        )
    )
    
    if start_date:
        # Convert datetime to date for comparison with pay_date (Date field)
        start_date_only = start_date.date() if isinstance(start_date, datetime) else start_date
        query = query.filter(Dividend.pay_date >= start_date_only)
    
    dividends = query.order_by(Dividend.pay_date).all()
    
    activity_items = []
    for div in dividends:
        # Convert pay_date (Date) to datetime for timestamp
        if isinstance(div.pay_date, date) and not isinstance(div.pay_date, datetime):
            timestamp = datetime.combine(div.pay_date, datetime.min.time())
        else:
            timestamp = div.pay_date
        
        # Get asset_type from position if available
        asset_type = None
        if div.position_id:
            position = db.query(Position).filter(Position.id == div.position_id).first()
            if position:
                asset_type = position.asset_type
        
        # Get ticker from dividend
        ticker = div.ticker
        
        activity_items.append(
            ActivityItem(
                timestamp=timestamp,
                activity_type=ActivityType.DIVIDEND,
                position_id=div.position_id,
                asset_type=asset_type,
                quantity=float(div.shares_at_ex_date) if div.shares_at_ex_date else 0.0,
                value=0.0,  # Dividends don't have a "value" in the trade sense
                dividend_amount=float(div.amount) if div.amount else 0.0,
                ex_date=datetime.combine(div.ex_date, datetime.min.time()) if div.ex_date else None,
                ticker=ticker,
            )
        )
    
    return activity_items


def get_upcoming_dividends(
    db: Session,
    user_id: int,
    as_of: datetime,
) -> List[ActivityItem]:
    """
    Return dividends with ex_date > as_of (upcoming dividends).
    
    Maps Dividend model rows with status=UPCOMING to ActivityItem DTOs.
    Handles empty results gracefully.
    
    Args:
        db: SQLAlchemy session
        user_id: User identifier
        as_of: Current timestamp to compare against ex_date
    
    Returns:
        List of ActivityItem objects for upcoming dividends, sorted chronologically
    """
    # Convert as_of to date for comparison with ex_date (Date field)
    as_of_date = as_of.date() if isinstance(as_of, datetime) else as_of
    
    query = db.query(Dividend).filter(
        and_(
            Dividend.user_id == user_id,
            Dividend.status == DividendStatus.UPCOMING,
            Dividend.ex_date.isnot(None),
            Dividend.ex_date > as_of_date
        )
    )
    
    dividends = query.order_by(Dividend.ex_date).all()
    
    activity_items = []
    for div in dividends:
        # Use ex_date as timestamp for upcoming dividends
        if div.ex_date:
            if isinstance(div.ex_date, date) and not isinstance(div.ex_date, datetime):
                timestamp = datetime.combine(div.ex_date, datetime.min.time())
            else:
                timestamp = div.ex_date
        else:
            # Fallback to pay_date if ex_date is missing
            if isinstance(div.pay_date, date) and not isinstance(div.pay_date, datetime):
                timestamp = datetime.combine(div.pay_date, datetime.min.time())
            else:
                timestamp = div.pay_date
        
        # Get asset_type from position if available
        asset_type = None
        if div.position_id:
            position = db.query(Position).filter(Position.id == div.position_id).first()
            if position:
                asset_type = position.asset_type
        
        # Get ticker from dividend
        ticker = div.ticker
        
        activity_items.append(
            ActivityItem(
                timestamp=timestamp,
                activity_type=ActivityType.UPCOMING_DIVIDEND,
                position_id=div.position_id,
                asset_type=asset_type,
                quantity=float(div.shares_at_ex_date) if div.shares_at_ex_date else 0.0,
                value=0.0,  # Upcoming dividends don't have a "value" yet
                dividend_amount=float(div.amount) if div.amount else 0.0,
                ex_date=datetime.combine(div.ex_date, datetime.min.time()) if div.ex_date else None,
                ticker=ticker,
            )
        )
    
    return activity_items
