"""
User model for authentication and user management
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Index
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class User(Base):
    """User model representing application users"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
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
