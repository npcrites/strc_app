"""
AssetMetadata model for storing asset-level static properties
"""
from sqlalchemy import Column, Integer, String, Numeric, DateTime, Boolean, Index, UniqueConstraint, Text
from typing import Optional
from app.db.base import Base
from datetime import datetime
from decimal import Decimal


class DividendCalculationType:
    """Dividend calculation type constants"""
    FIXED_DOLLAR_PER_SHARE = "fixed_dollar_per_share"  # Fixed $ amount per share (yield varies with price)
    FIXED_PERCENTAGE_RATE = "fixed_percentage_rate"     # Fixed % rate (dollar amount varies with price)


class AssetMetadata(Base):
    """AssetMetadata model for storing asset-level static properties (not user-specific)"""
    __tablename__ = "asset_metadata"
    
    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)  # e.g., "STRC", "SATA", "MSTR-A"
    
    # Dividend calculation method
    dividend_calculation_type = Column(String, nullable=True)  # "fixed_dollar_per_share" or "fixed_percentage_rate"
    
    # For fixed_dollar_per_share assets (STRK, STRF, STRD): dollar amount per share per period
    fixed_dividend_per_share = Column(Numeric(10, 4), nullable=True)  # e.g., 0.25 for $0.25 per share
    
    # For fixed_percentage_rate assets (STRC, SATA): percentage rate
    dividend_rate_percentage = Column(Numeric(5, 2), nullable=True)  # e.g., 11.00 for 11% annual rate
    
    # Dividend characteristics
    is_cumulative = Column(Boolean, nullable=True)  # True if missed payments must be paid back
    dividend_frequency = Column(String, nullable=True)  # "monthly", "quarterly", "semi-annually", "annually"
    
    # Calculated/expected yield (can be computed from above fields + current price)
    target_dividend_yield = Column(Numeric(5, 2), nullable=True)  # Target dividend yield percentage
    
    # Special features
    special_features = Column(Text, nullable=True)  # e.g., "convertible to MSTR shares"
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Indexes and constraints
    __table_args__ = (
        Index('idx_asset_metadata_ticker', 'ticker'),
        UniqueConstraint('ticker', name='uq_asset_metadata_ticker'),
    )
    
    def calculate_yield_from_price(self, current_price: float) -> Optional[float]:
        """Calculate dividend yield based on current price"""
        if not current_price or current_price <= 0:
            return None
            
        if self.dividend_calculation_type == DividendCalculationType.FIXED_DOLLAR_PER_SHARE:
            if not self.fixed_dividend_per_share or not self.dividend_frequency:
                return None
            # Calculate annual dividend
            multipliers = {'monthly': 12, 'quarterly': 4, 'semi-annually': 2, 'annually': 1}
            annual_dividend = float(self.fixed_dividend_per_share) * multipliers.get(self.dividend_frequency, 4)
            return (annual_dividend / current_price) * 100
            
        elif self.dividend_calculation_type == DividendCalculationType.FIXED_PERCENTAGE_RATE:
            # For fixed percentage rate, the rate IS the yield
            return float(self.dividend_rate_percentage) if self.dividend_rate_percentage else None
            
        return None
    
    def __repr__(self):
        if self.dividend_calculation_type == DividendCalculationType.FIXED_DOLLAR_PER_SHARE:
            return f"<AssetMetadata(ticker={self.ticker}, fixed_dividend=${self.fixed_dividend_per_share}, freq={self.dividend_frequency})>"
        elif self.dividend_calculation_type == DividendCalculationType.FIXED_PERCENTAGE_RATE:
            return f"<AssetMetadata(ticker={self.ticker}, rate={self.dividend_rate_percentage}%, freq={self.dividend_frequency})>"
        return f"<AssetMetadata(ticker={self.ticker})>"

