"""
AssetMetrics model for storing time-series asset metrics
Supports both parent company metrics (NAV, total assets, market cap) 
and asset-level metrics (volume)
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Index, Boolean
from typing import Optional
from app.db.base import Base
from datetime import datetime, timezone


class AssetMetrics(Base):
    """AssetMetrics model for storing time-series asset metrics"""
    __tablename__ = "asset_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)  # Asset ticker (e.g., "STRC", "MSTR")
    metric_type = Column(String, nullable=False, index=True)  # "nav", "total_assets", "market_cap", "volume"
    value = Column(Numeric(20, 4), nullable=False)  # Metric value
    timestamp = Column(DateTime, nullable=False, index=True)  # When this metric was recorded
    is_parent_level = Column(Boolean, default=False, nullable=False, index=True)  # True for parent company metrics
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Indexes for efficient querying
    __table_args__ = (
        Index('idx_asset_metrics_ticker', 'ticker'),
        Index('idx_asset_metrics_metric_type', 'metric_type'),
        Index('idx_asset_metrics_timestamp', 'timestamp'),
        Index('idx_asset_metrics_is_parent_level', 'is_parent_level'),
        # Composite indexes for common queries
        Index('idx_asset_metrics_ticker_type', 'ticker', 'metric_type'),
        Index('idx_asset_metrics_ticker_timestamp', 'ticker', 'timestamp'),
        Index('idx_asset_metrics_ticker_type_timestamp', 'ticker', 'metric_type', 'timestamp'),
        Index('idx_asset_metrics_parent_type_timestamp', 'is_parent_level', 'metric_type', 'timestamp'),
    )
    
    def __repr__(self):
        level = "parent" if self.is_parent_level else "asset"
        return f"<AssetMetrics(ticker={self.ticker}, type={self.metric_type}, value={self.value}, level={level}, timestamp={self.timestamp})>"

