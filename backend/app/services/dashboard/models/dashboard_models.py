"""
Dashboard response DTOs (Pydantic models)
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class MetricDelta(BaseModel):
    """Change metric with absolute and percentage values"""
    absolute: float = Field(..., description="Change in absolute dollars")
    percent: float = Field(..., description="Change as percentage")


class TotalMetrics(BaseModel):
    """Total portfolio value metrics"""
    current: float = Field(..., description="Current portfolio value")
    start: float = Field(..., description="Value at range start")
    delta: MetricDelta = Field(..., description="Change from start to current")


class TimeSeriesPoint(BaseModel):
    """Single point in a time series"""
    timestamp: datetime = Field(..., description="Timestamp for this data point")
    value: float = Field(..., description="Portfolio value at this timestamp")


class PerformanceMetrics(BaseModel):
    """Performance metrics with time series"""
    series: List[TimeSeriesPoint] = Field(..., description="Total series: positions + cumulative cash")
    position_series: Optional[List[TimeSeriesPoint]] = Field(None, description="Position values only (for standalone graphs)")
    cash_series: Optional[List[TimeSeriesPoint]] = Field(None, description="Cumulative cash flows only (for standalone graphs)")
    delta: MetricDelta = Field(..., description="Overall change in range (from total series)")
    max: float = Field(..., description="Peak value in range")
    min: float = Field(..., description="Trough value in range")


class AllocationItem(BaseModel):
    """Asset allocation item"""
    ticker: str = Field(..., description="Ticker symbol (e.g., 'STRC', 'SATA', 'AAPL')")
    value: float = Field(..., description="Total value of this asset")
    percent: float = Field(..., description="Percentage of total portfolio")


class ActivityItem(BaseModel):
    """Portfolio activity event (trade, dividend, etc.)"""
    timestamp: datetime = Field(..., description="When the activity occurred")
    activity_type: str = Field(..., description="Type: BUY, SELL, DIVIDEND, UPCOMING_DIVIDEND")
    position_id: Optional[int] = Field(None, description="Related position ID if applicable")
    asset_type: Optional[str] = Field(None, description="Asset type (e.g., 'preferred_stock', 'common_stock')")
    quantity: float = Field(0.0, description="Quantity (shares) for trades")
    value: float = Field(0.0, description="Transaction value for trades")
    dividend_amount: float = Field(0.0, description="Dividend amount for dividend activities")
    ex_date: Optional[datetime] = Field(None, description="Ex-dividend date for upcoming dividends")
    ticker: Optional[str] = Field(None, description="Ticker symbol for display")


class DashboardSnapshot(BaseModel):
    """Complete dashboard snapshot response"""
    as_of: datetime = Field(..., description="Snapshot timestamp")
    granularity: str = Field(..., description="Data granularity: 'daily', 'weekly', or 'monthly'")
    total: TotalMetrics = Field(..., description="Total portfolio metrics")
    performance: PerformanceMetrics = Field(..., description="Performance metrics")
    allocation: List[AllocationItem] = Field(..., description="Asset allocation breakdown")
    activity: List[ActivityItem] = Field(..., description="Portfolio activity feed (trades, dividends) sorted chronologically")
    
    model_config = {
        "json_schema_extra": {
            "example": {
                "as_of": "2025-01-15T12:00:00Z",
                "total": {
                    "current": 50000.0,
                    "start": 45000.0,
                    "delta": {"absolute": 5000.0, "percent": 11.11}
                },
                "performance": {
                    "series": [
                        {"timestamp": "2024-12-15T00:00:00Z", "value": 45000.0},
                        {"timestamp": "2025-01-15T00:00:00Z", "value": 50000.0}
                    ],
                    "position_series": [
                        {"timestamp": "2024-12-15T00:00:00Z", "value": 45000.0},
                        {"timestamp": "2025-01-15T00:00:00Z", "value": 48000.0}
                    ],
                    "cash_series": [
                        {"timestamp": "2024-12-20T00:00:00Z", "value": 500.0},
                        {"timestamp": "2025-01-15T00:00:00Z", "value": 2000.0}
                    ],
                    "delta": {"absolute": 5000.0, "percent": 11.11},
                    "max": 51000.0,
                    "min": 44000.0
                },
                "allocation": [
                    {"asset_type": "preferred_stock", "value": 30000.0, "percent": 60.0},
                    {"asset_type": "common_stock", "value": 20000.0, "percent": 40.0}
                ],
                "activity": [
                    {
                        "timestamp": "2025-01-10T00:00:00Z",
                        "activity_type": "DIVIDEND",
                        "position_id": 1,
                        "asset_type": "preferred_stock",
                        "dividend_amount": 250.0,
                        "ticker": "STRC"
                    }
                ]
            }
        }
    }

