"""
Market Hours Service for determining market hours and trading days
"""
from typing import List, Optional
from datetime import datetime, date, timedelta, time
import pytz
import logging

logger = logging.getLogger(__name__)


class MarketHoursService:
    """Service for determining market hours and trading days"""
    
    # Market hours in ET (Eastern Time)
    MARKET_OPEN_HOUR = 9
    MARKET_OPEN_MINUTE = 30
    MARKET_CLOSE_HOUR = 16
    MARKET_CLOSE_MINUTE = 0
    
    # NYSE timezone
    ET_TIMEZONE = pytz.timezone('America/New_York')
    
    # Market holidays (NYSE holidays for 2024-2026)
    # Note: This is a simplified list. For production, consider using pandas_market_calendars
    MARKET_HOLIDAYS = {
        # 2024
        date(2024, 1, 1),   # New Year's Day
        date(2024, 1, 15),  # Martin Luther King Jr. Day
        date(2024, 2, 19),  # Presidents' Day
        date(2024, 3, 29),  # Good Friday
        date(2024, 5, 27),  # Memorial Day
        date(2024, 6, 19),  # Juneteenth
        date(2024, 7, 4),   # Independence Day
        date(2024, 9, 2),   # Labor Day
        date(2024, 11, 28), # Thanksgiving
        date(2024, 12, 25), # Christmas
        
        # 2025
        date(2025, 1, 1),   # New Year's Day
        date(2025, 1, 20),  # Martin Luther King Jr. Day
        date(2025, 2, 17),  # Presidents' Day
        date(2025, 4, 18),  # Good Friday
        date(2025, 5, 26),  # Memorial Day
        date(2025, 6, 19),  # Juneteenth
        date(2025, 7, 4),   # Independence Day
        date(2025, 9, 1),   # Labor Day
        date(2025, 11, 27), # Thanksgiving
        date(2025, 12, 25), # Christmas
        
        # 2026
        date(2026, 1, 1),   # New Year's Day
        date(2026, 1, 19),  # Martin Luther King Jr. Day
        date(2026, 2, 16),  # Presidents' Day
        date(2026, 4, 3),   # Good Friday
        date(2026, 5, 25),  # Memorial Day
        date(2026, 6, 19),  # Juneteenth
        date(2026, 7, 3),   # Independence Day (observed)
        date(2026, 9, 7),   # Labor Day
        date(2026, 11, 26), # Thanksgiving
        date(2026, 12, 25), # Christmas
    }
    
    def _to_et(self, dt: datetime) -> datetime:
        """Convert datetime to Eastern Time"""
        if dt.tzinfo is None:
            # Assume UTC if no timezone info
            dt = pytz.utc.localize(dt)
        return dt.astimezone(self.ET_TIMEZONE)
    
    def is_trading_day(self, check_date: date) -> bool:
        """
        Check if a date is a trading day (weekday and not holiday)
        
        Args:
            check_date: Date to check
            
        Returns:
            True if trading day, False otherwise
        """
        # Check if weekend
        if check_date.weekday() >= 5:  # Saturday = 5, Sunday = 6
            return False
        
        # Check if market holiday
        if check_date in self.MARKET_HOLIDAYS:
            return False
        
        return True
    
    def is_market_open(self, timestamp: datetime) -> bool:
        """
        Check if market is open at given timestamp (in UTC)
        Converts to ET and checks if within market hours and trading day
        
        Args:
            timestamp: Datetime in UTC (or with timezone info)
            
        Returns:
            True if market is open, False otherwise
        """
        # Convert to ET
        et_time = self._to_et(timestamp)
        et_date = et_time.date()
        
        # Check if trading day
        if not self.is_trading_day(et_date):
            return False
        
        # Check if within market hours (9:30 AM - 4:00 PM ET)
        hour = et_time.hour
        minute = et_time.minute
        
        # Before market open
        if hour < self.MARKET_OPEN_HOUR or (hour == self.MARKET_OPEN_HOUR and minute < self.MARKET_OPEN_MINUTE):
            return False
        
        # After market close
        if hour > self.MARKET_CLOSE_HOUR or (hour == self.MARKET_CLOSE_HOUR and minute >= self.MARKET_CLOSE_MINUTE):
            return False
        
        return True
    
    def get_trading_days_in_range(
        self, 
        start_date: date, 
        end_date: date
    ) -> List[date]:
        """
        Get list of trading days between start and end dates (inclusive)
        
        Args:
            start_date: Start date
            end_date: End date
            
        Returns:
            List of trading days
        """
        trading_days = []
        current = start_date
        
        while current <= end_date:
            if self.is_trading_day(current):
                trading_days.append(current)
            current += timedelta(days=1)
        
        return trading_days
    
    def get_n_trading_days_back(
        self, 
        n: int, 
        end_date: Optional[datetime] = None
    ) -> datetime:
        """
        Get datetime that is N trading days back from end_date (inclusive)
        
        Used for calculating 1W = 5 trading days, etc.
        This finds the date that is N trading days ago, including the end_date
        if it's a trading day. If end_date is not a trading day, starts from
        the most recent trading day.
        
        Args:
            n: Number of trading days to go back (e.g., 5 for 1W)
            end_date: End date (defaults to now)
            
        Returns:
            Datetime that is N trading days back at market open (9:30 AM ET)
        """
        if end_date is None:
            end_date = datetime.utcnow()
        
        # Convert to ET for date calculations
        et_end = self._to_et(end_date)
        current_date = et_end.date()
        
        # If current date is not a trading day, find the most recent trading day
        # This ensures we always start from a valid trading day
        days_to_last_trading_day = 0
        while not self.is_trading_day(current_date - timedelta(days=days_to_last_trading_day)):
            days_to_last_trading_day += 1
            if days_to_last_trading_day > 10:  # Safety check
                logger.warning("Could not find a recent trading day")
                break
        
        # Start from the most recent trading day
        start_date = current_date - timedelta(days=days_to_last_trading_day)
        
        trading_days_found = 0
        days_back = 0
        oldest_trading_day = None
        
        # Go back day by day until we find N trading days
        # We want to find the oldest trading day that gives us N trading days total
        while trading_days_found < n:
            check_date = start_date - timedelta(days=days_back)
            
            if self.is_trading_day(check_date):
                trading_days_found += 1
                # Keep track of the oldest trading day we find (the one furthest back)
                oldest_trading_day = check_date
            
            days_back += 1
            
            # Safety check to avoid infinite loop
            if days_back > 1000:
                logger.warning(f"Could not find {n} trading days, stopping at {trading_days_found}")
                break
        
        # Use the oldest trading day we found, or fallback to days_back calculation
        if oldest_trading_day is None:
            # Fallback: go back enough days to ensure we have N trading days
            # This is a conservative estimate (assume ~5/7 days are trading days)
            estimated_days = int(n * 1.4)  # Add 40% buffer for weekends
            result_date = start_date - timedelta(days=estimated_days)
        else:
            result_date = oldest_trading_day
        
        # Return the date at market open (9:30 AM ET)
        result_datetime = self.ET_TIMEZONE.localize(
            datetime.combine(result_date, time(self.MARKET_OPEN_HOUR, self.MARKET_OPEN_MINUTE))
        )
        
        # Convert back to UTC
        return result_datetime.astimezone(pytz.utc).replace(tzinfo=None)
    
    def adjust_time_range_for_trading_days(
        self,
        start_date: Optional[datetime],
        end_date: datetime,
        time_range_shorthand: Optional[str] = None
    ) -> tuple[Optional[datetime], datetime]:
        """
        Adjust time range to use trading days instead of calendar days
        
        If end_date is not a trading day, uses the most recent trading day as end_date.
        Then calculates start_date as N trading days back from that end_date.
        
        Args:
            start_date: Original start date (None for ALL)
            end_date: End date (may be adjusted to most recent trading day)
            time_range_shorthand: Time range shorthand (1W, 1M, 3M, 1Y) for calculation
            
        Returns:
            Tuple of (adjusted_start_date, adjusted_end_date)
        """
        if start_date is None:
            # For "ALL", keep as None
            return None, end_date
        
        # If end_date is not a trading day, find the most recent trading day
        et_end = self._to_et(end_date)
        end_date_obj = et_end.date()
        
        if not self.is_trading_day(end_date_obj):
            # Find most recent trading day
            days_back = 0
            while days_back < 10:
                check_date = end_date_obj - timedelta(days=days_back)
                if self.is_trading_day(check_date):
                    # Use this trading day at market close (4:00 PM ET)
                    adjusted_end_datetime = self.ET_TIMEZONE.localize(
                        datetime.combine(check_date, time(self.MARKET_CLOSE_HOUR, self.MARKET_CLOSE_MINUTE))
                    )
                    end_date = adjusted_end_datetime.astimezone(pytz.utc).replace(tzinfo=None)
                    logger.info(f"Adjusted end_date from {end_date_obj} to most recent trading day: {check_date}")
                    break
                days_back += 1
        
        # For specific time ranges, calculate based on trading days
        if time_range_shorthand == "1W":
            # 1 week = 5 trading days
            adjusted_start = self.get_n_trading_days_back(5, end_date)
        elif time_range_shorthand == "1M":
            # 1 month = ~20 trading days
            adjusted_start = self.get_n_trading_days_back(20, end_date)
        elif time_range_shorthand == "3M":
            # 3 months = ~60 trading days
            adjusted_start = self.get_n_trading_days_back(60, end_date)
        elif time_range_shorthand == "1Y":
            # 1 year = ~252 trading days
            adjusted_start = self.get_n_trading_days_back(252, end_date)
        else:
            # For other cases, use original start_date
            adjusted_start = start_date
        
        return adjusted_start, end_date
    
    def filter_market_hours_only(
        self, 
        timestamps: List[datetime]
    ) -> List[datetime]:
        """
        Filter timestamps to only include those during market hours
        
        Args:
            timestamps: List of datetimes (in UTC)
            
        Returns:
            Filtered list of datetimes during market hours
        """
        return [ts for ts in timestamps if self.is_market_open(ts)]

