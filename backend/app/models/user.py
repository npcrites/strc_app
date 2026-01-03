"""
User model for authentication and user management
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Index, Text
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class User(Base):
    """User model representing application users"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)  # Made nullable for OAuth-only auth
    
    # Alpaca OAuth tokens (store encrypted in production)
    alpaca_access_token = Column(Text, nullable=True)
    alpaca_refresh_token = Column(Text, nullable=True)
    alpaca_token_expires_at = Column(DateTime, nullable=True)
    alpaca_account_id = Column(String, nullable=True, unique=True, index=True)  # Alpaca's account ID
    
    # Store account info from Alpaca to avoid repeated API calls
    alpaca_account_number = Column(String, nullable=True)  # Account number
    alpaca_account_status = Column(String, nullable=True)  # Account status (e.g., "ACTIVE")
    alpaca_currency = Column(String, nullable=True, default="USD")  # Account currency
    alpaca_trading_blocked = Column(Boolean, default=False, nullable=False)
    alpaca_portfolio_created_at = Column(DateTime, nullable=True)  # When account was created
    
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    positions = relationship(
        "Position", 
        back_populates="user", 
        cascade="all, delete-orphan"
    )
    dividends = relationship(
        "Dividend", 
        back_populates="user", 
        cascade="all, delete-orphan"
    )
    ex_dates = relationship(
        "ExDate", 
        back_populates="user", 
        cascade="all, delete-orphan"
    )
    portfolio_snapshots = relationship(
        "PortfolioSnapshot",
        back_populates="user",
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_users_user_id', 'id'),
    )
