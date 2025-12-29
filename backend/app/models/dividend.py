"""
Dividend model for tracking dividend payments and upcoming dividends
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Date, Index
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime, date


class DividendStatus:
    """Dividend payment status constants"""
    UPCOMING = "upcoming"
    PAID = "paid"


class Dividend(Base):
    """Dividend model representing dividend payments"""
    __tablename__ = "dividends"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    position_id = Column(Integer, ForeignKey("positions.id", ondelete="CASCADE"), nullable=True, index=True)
    ticker = Column(String, nullable=False, index=True)  # e.g., "STRC", "SATA"
    amount = Column(Numeric(15, 4), nullable=False)  # Total dividend amount received
    pay_date = Column(Date, nullable=False)  # Date dividend was/will be paid
    status = Column(String, nullable=False, default=DividendStatus.UPCOMING)  # "upcoming" or "paid"
    dividend_per_share = Column(Numeric(10, 4), nullable=True)  # Dividend per share amount
    shares_at_ex_date = Column(Numeric(15, 6), nullable=True)  # Number of shares held on ex-date
    ex_date = Column(Date, nullable=True)  # Ex-dividend date
    source = Column(String, nullable=True)  # e.g., "plaid", "manual", "api"
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="dividends")
    position = relationship("Position", back_populates="dividends")
    
    # Indexes
    __table_args__ = (
        Index('idx_dividends_user_id', 'user_id'),
        Index('idx_dividends_ticker', 'ticker'),
        Index('idx_dividends_pay_date', 'pay_date'),
        Index('idx_dividends_status', 'status'),
    )
    
    def is_upcoming(self) -> bool:
        """Check if dividend is upcoming"""
        return self.status == DividendStatus.UPCOMING
    
    def is_paid(self) -> bool:
        """Check if dividend has been paid"""
        return self.status == DividendStatus.PAID
