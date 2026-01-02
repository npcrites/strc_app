"""
PortfolioSnapshot model for historical portfolio value tracking
"""
from sqlalchemy import Column, Integer, Numeric, DateTime, Index, UniqueConstraint, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class PortfolioSnapshot(Base):
    """PortfolioSnapshot model for storing historical portfolio values"""
    __tablename__ = "portfolio_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    total_value = Column(Numeric(15, 2), nullable=False)  # Total portfolio value
    cash_balance = Column(Numeric(15, 2), nullable=True, default=0)  # Cash balance
    investment_value = Column(Numeric(15, 2), nullable=False)  # Investment value (total - cash)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)  # Snapshot timestamp
    
    # Relationships
    user = relationship("User", back_populates="portfolio_snapshots")
    position_snapshots = relationship(
        "PositionSnapshot",
        back_populates="portfolio_snapshot",
        cascade="all, delete-orphan"
    )
    
    # Indexes and constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'timestamp', name='uq_portfolio_snapshot_user_timestamp'),
        Index('idx_portfolio_snapshots_user_timestamp', 'user_id', 'timestamp'),  # Critical for chart queries
        Index('idx_portfolio_snapshots_timestamp', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<PortfolioSnapshot(user_id={self.user_id}, total_value={self.total_value}, timestamp={self.timestamp})>"

