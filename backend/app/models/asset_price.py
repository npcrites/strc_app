"""
AssetPrice model for caching live market prices
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Index
from app.db.base import Base
from datetime import datetime


class AssetPrice(Base):
    """AssetPrice model for caching current market prices"""
    __tablename__ = "asset_prices"
    
    symbol = Column(String, primary_key=True, index=True)  # e.g., "AAPL", "MSFT"
    price = Column(Numeric(15, 4), nullable=False)  # Current price with 4 decimal precision
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)  # Last update timestamp
    
    # Indexes
    __table_args__ = (
        Index('idx_asset_prices_symbol', 'symbol'),
        Index('idx_asset_prices_updated_at', 'updated_at'),
    )
    
    def __repr__(self):
        return f"<AssetPrice(symbol={self.symbol}, price={self.price}, updated_at={self.updated_at})>"

