"""
Position model for tracking stock positions with historical snapshots
"""
from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Index
from sqlalchemy.orm import relationship
from typing import Optional
from app.db.base import Base
from datetime import datetime


class Position(Base):
    """Position model representing user's stock/investment positions"""
    __tablename__ = "positions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True, index=True)
    ticker = Column(String, nullable=False, index=True)  # e.g., "STRC", "SATA", "MSTR-A"
    name = Column(String, nullable=True)  # Full security name
    shares = Column(Numeric(15, 6), nullable=False)  # Number of shares
    cost_basis = Column(Numeric(15, 2), nullable=False)  # Total cost basis
    market_value = Column(Numeric(15, 2), nullable=True)  # Current market value
    asset_type = Column(String, nullable=True)  # e.g., "preferred_stock", "common_stock", "etf", "bond"
    snapshot_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)  # Historical record timestamp
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="positions")
    account = relationship("Account", back_populates="positions")
    dividends = relationship(
        "Dividend", 
        back_populates="position", 
        cascade="all, delete-orphan"
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_positions_user_id', 'user_id'),
        Index('idx_positions_ticker', 'ticker'),
        Index('idx_positions_account_id', 'account_id'),
        Index('idx_positions_snapshot_timestamp', 'snapshot_timestamp'),
    )
    
    @property
    def average_cost_per_share(self) -> float:
        """Calculate average cost per share"""
        if self.shares and float(self.shares) > 0:
            return float(self.cost_basis) / float(self.shares)
        return 0.0
    
    @property
    def current_price_per_share(self) -> Optional[float]:
        """Calculate current price per share"""
        if self.market_value and self.shares and float(self.shares) > 0:
            return float(self.market_value) / float(self.shares)
        return None
    
    @property
    def unrealized_gain_loss(self) -> Optional[float]:
        """Calculate unrealized gain/loss"""
        if self.market_value:
            return float(self.market_value) - float(self.cost_basis)
        return None
    
    @property
    def unrealized_gain_loss_percent(self) -> Optional[float]:
        """Calculate unrealized gain/loss percentage"""
        if self.cost_basis and float(self.cost_basis) > 0 and self.unrealized_gain_loss is not None:
            return (self.unrealized_gain_loss / float(self.cost_basis)) * 100
        return None
