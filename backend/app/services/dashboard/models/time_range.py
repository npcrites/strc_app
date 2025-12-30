"""
TimeRange value object for dashboard time period selection
"""
from enum import Enum
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional


class TimeGranularity(str, Enum):
    """Time granularity for data aggregation"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


@dataclass
class TimeRange:
    """Value object representing a time range for dashboard queries"""
    start_date: Optional[datetime]
    end_date: datetime
    granularity: TimeGranularity
    
    def __post_init__(self):
        """Validate time range"""
        if self.start_date and self.start_date > self.end_date:
            raise ValueError("start_date must be <= end_date")
        if self.end_date > datetime.now():
            raise ValueError("Cannot project future dashboards")
    
    @staticmethod
    def from_shorthand(shorthand: str) -> "TimeRange":
        """
        Convert shorthand string to TimeRange.
        
        Args:
            shorthand: One of "1M", "3M", "1Y", "ALL"
        
        Returns:
            TimeRange object
        
        Raises:
            ValueError: If shorthand is not recognized
        """
        now = datetime.now()
        
        mapping = {
            "1M": (now - timedelta(days=30), now, TimeGranularity.DAILY),
            "3M": (now - timedelta(days=90), now, TimeGranularity.DAILY),
            "1Y": (now - timedelta(days=365), now, TimeGranularity.WEEKLY),
            "ALL": (None, now, TimeGranularity.MONTHLY),  # Require start_date from DB
        }
        
        if shorthand not in mapping:
            raise ValueError(f"Unknown shorthand: {shorthand}. Must be one of: 1M, 3M, 1Y, ALL")
        
        start, end, granularity = mapping[shorthand]
        return TimeRange(start, end, granularity)

