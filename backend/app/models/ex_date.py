"""
ExDate model for tracking ex-dividend dates
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Date, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from typing import Optional
from app.db.base import Base
from datetime import datetime, date


class ExDate(Base):
    """ExDate model representing ex-dividend dates for securities"""
    __tablename__ = "ex_dates"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ticker = Column(String, nullable=False, index=True)  # e.g., "STRC", "SATA", "MSTR-A"
    ex_date = Column(Date, nullable=False, index=True)  # Ex-dividend date
    dividend_amount = Column(String, nullable=True)  # Expected dividend amount per share
    pay_date = Column(Date, nullable=True)  # Expected payment date
    source = Column(String, nullable=True)  # e.g., "plaid", "manual", "api", "calendar"
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="ex_dates")
    
    # Indexes and constraints
    __table_args__ = (
        Index('idx_ex_dates_user_id', 'user_id'),
        Index('idx_ex_dates_ticker', 'ticker'),
        Index('idx_ex_dates_ex_date', 'ex_date'),
        # Prevent duplicate ex-dates for same user/ticker
        UniqueConstraint('user_id', 'ticker', 'ex_date', name='uq_ex_dates_user_ticker_date'),
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

