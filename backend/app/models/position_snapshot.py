"""
PositionSnapshot model for historical position-level tracking
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Index, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class PositionSnapshot(Base):
    """PositionSnapshot model for storing historical position details"""
    __tablename__ = "position_snapshots"
    
    id = Column(Integer, primary_key=True, index=True)
    portfolio_snapshot_id = Column(
        Integer, 
        ForeignKey("portfolio_snapshots.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    ticker = Column(String, nullable=False, index=True)  # Symbol
    shares = Column(Numeric(15, 6), nullable=False)  # Number of shares
    cost_basis = Column(Numeric(15, 2), nullable=False)  # Total cost basis
    current_value = Column(Numeric(15, 2), nullable=False)  # Current market value
    price_per_share = Column(Numeric(15, 4), nullable=False)  # Price at snapshot time
    
    # Relationships
    portfolio_snapshot = relationship("PortfolioSnapshot", back_populates="position_snapshots")
    
    # Indexes
    __table_args__ = (
        Index('idx_position_snapshots_portfolio_id', 'portfolio_snapshot_id'),
        Index('idx_position_snapshots_ticker', 'ticker'),
    )
    
    def __repr__(self):
        return f"<PositionSnapshot(ticker={self.ticker}, shares={self.shares}, value={self.current_value})>"

