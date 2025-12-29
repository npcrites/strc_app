"""
Dividend engine for calculating total return and ex-dividend dates
"""
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from decimal import Decimal


class DividendEngine:
    """Engine for dividend calculations and ex-date tracking"""
    
    @staticmethod
    def calculate_total_return(
        position_id: int,
        initial_cost: Decimal,
        current_value: Decimal,
        dividends_received: Decimal
    ) -> Dict:
        """
        Calculate total return including dividends and capital gains
        
        Returns:
            Dict with total_return, dividend_income, capital_gains, return_percentage
        """
        capital_gains = current_value - initial_cost
        total_return = capital_gains + dividends_received
        
        if initial_cost > 0:
            return_percentage = (total_return / initial_cost) * 100
        else:
            return_percentage = Decimal(0)
        
        return {
            "total_return": float(total_return),
            "dividend_income": float(dividends_received),
            "capital_gains": float(capital_gains),
            "return_percentage": float(return_percentage)
        }
    
    @staticmethod
    def get_upcoming_ex_dates(
        positions: List[Dict],
        days_ahead: int = 30
    ) -> List[Dict]:
        """
        Get upcoming ex-dividend dates for positions
        
        Args:
            positions: List of position dicts with symbol and dividend info
            days_ahead: Number of days to look ahead
        
        Returns:
            List of upcoming ex-dates with position info
        """
        upcoming = []
        end_date = datetime.now() + timedelta(days=days_ahead)
        
        # TODO: Implement actual ex-date calculation based on dividend history
        # This would typically query dividend calendars or historical data
        
        for position in positions:
            symbol = position.get("symbol")
            # Mock upcoming ex-date
            # In production, this would query dividend calendars
            upcoming.append({
                "symbol": symbol,
                "ex_date": (datetime.now() + timedelta(days=7)).isoformat(),
                "amount": 0.50,
                "position_id": position.get("id")
            })
        
        return sorted(upcoming, key=lambda x: x["ex_date"])
    
    @staticmethod
    def calculate_dividend_yield(
        annual_dividend: Decimal,
        current_price: Decimal
    ) -> float:
        """Calculate dividend yield percentage"""
        if current_price > 0:
            return float((annual_dividend / current_price) * 100)
        return 0.0
    
    @staticmethod
    def project_annual_dividend(
        recent_dividends: List[Dict],
        frequency: str = "quarterly"
    ) -> Decimal:
        """
        Project annual dividend based on recent payments
        
        Args:
            recent_dividends: List of recent dividend payments
            frequency: Expected frequency (quarterly, monthly, annually)
        """
        if not recent_dividends:
            return Decimal(0)
        
        # Get most recent dividend amount
        latest_amount = Decimal(recent_dividends[0].get("amount", 0))
        
        # Multiply by frequency
        frequency_multipliers = {
            "monthly": 12,
            "quarterly": 4,
            "semi-annually": 2,
            "annually": 1
        }
        
        multiplier = frequency_multipliers.get(frequency.lower(), 4)
        return latest_amount * multiplier


