"""
Brokerage model for tracking user's brokerage institutions
"""
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Index
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class Brokerage(Base):
    """Brokerage model representing financial institutions"""
    __tablename__ = "brokerages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g., "Fidelity", "Charles Schwab", "Vanguard"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="brokerages")
    accounts = relationship(
        "Account", 
        back_populates="brokerage", 
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_brokerages_user_id', 'user_id'),
    )

