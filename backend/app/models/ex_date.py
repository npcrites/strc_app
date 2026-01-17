"""
ExDate model for tracking ex-dividend dates
"""
from sqlalchemy import Column, Integer, String, DateTime, Date, Index, UniqueConstraint
from typing import Optional
from app.db.base import Base
from datetime import datetime, date


class ExDate(Base):
    """ExDate model representing ex-dividend dates for securities (asset-specific, not user-specific)"""
    __tablename__ = "ex_dates"
    
    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)  # e.g., "STRC", "SATA", "MSTR-A"
    ex_date = Column(Date, nullable=False, index=True)  # Raw ex-dividend date
    invest_by_date = Column(Date, nullable=True, index=True)  # Last business day on or before ex_date
    dividend_amount = Column(String, nullable=True)  # Expected dividend amount per share
    pay_date = Column(Date, nullable=True)  # Raw payment date
    source = Column(String, nullable=True)  # e.g., "fmp_api", "manual", "api", "calendar"
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Indexes and constraints
    __table_args__ = (
        Index('idx_ex_dates_ticker', 'ticker'),
        Index('idx_ex_dates_ex_date', 'ex_date'),
        # Prevent duplicate ex-dates for same ticker
        UniqueConstraint('ticker', 'ex_date', name='uq_ex_dates_ticker_date'),
    )
    
    def is_upcoming(self, reference_date: Optional[date] = None) -> bool:
        """Check if ex-date is upcoming"""
        if reference_date is None:
            reference_date = date.today()
        return self.ex_date >= reference_date
    
    def is_past(self, reference_date: Optional[date] = None) -> bool:
        """Check if ex-date has passed"""
        if reference_date is None:
            reference_date = date.today()
        return self.ex_date < reference_date

