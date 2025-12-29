"""
Account model for Plaid-linked accounts
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Numeric, Index
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class Account(Base):
    """Account model representing user's financial accounts"""
    __tablename__ = "accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    brokerage_id = Column(Integer, ForeignKey("brokerages.id", ondelete="CASCADE"), nullable=True, index=True)
    plaid_account_id = Column(String, unique=True, nullable=True)  # Plaid account identifier
    name = Column(String, nullable=False)  # Account name
    type = Column(String, nullable=True)  # e.g., "investment", "depository", "credit"
    subtype = Column(String, nullable=True)  # e.g., "ira", "401k", "brokerage", "checking"
    balance = Column(Numeric(15, 2), nullable=True)  # Current account balance
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="accounts")
    brokerage = relationship("Brokerage", back_populates="accounts")
    positions = relationship(
        "Position", 
        back_populates="account", 
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_accounts_user_id', 'user_id'),
        Index('idx_accounts_brokerage_id', 'brokerage_id'),
    )
