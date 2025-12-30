"""
Tests for DividendEngine
"""
import os
import sys
from pathlib import Path
import pytest
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.services.dividend_engine import DividendEngine


class TestDividendEngine:
    """Test cases for DividendEngine"""
    
    def test_calculate_total_return(self):
        """Test total return calculation"""
        result = DividendEngine.calculate_total_return(
            position_id=1,
            initial_cost=Decimal("1000.00"),
            current_value=Decimal("1200.00"),
            dividends_received=Decimal("50.00")
        )
        
        assert result["total_return"] == 250.0
        assert result["dividend_income"] == 50.0
        assert result["capital_gains"] == 200.0
        assert result["return_percentage"] == 25.0
    
    def test_calculate_dividend_yield(self):
        """Test dividend yield calculation"""
        yield_pct = DividendEngine.calculate_dividend_yield(
            annual_dividend=Decimal("2.00"),
            current_price=Decimal("50.00")
        )
        
        assert yield_pct == 4.0
    
    def test_project_annual_dividend(self):
        """Test annual dividend projection"""
        recent_dividends = [
            {"amount": 0.50},
            {"amount": 0.50},
            {"amount": 0.50}
        ]
        
        annual = DividendEngine.project_annual_dividend(
            recent_dividends,
            frequency="quarterly"
        )
        
        assert float(annual) == 2.0
    
    def test_get_upcoming_ex_dates(self):
        """Test getting upcoming ex-dates"""
        positions = [
            {"id": 1, "symbol": "AAPL"},
            {"id": 2, "symbol": "MSFT"}
        ]
        
        upcoming = DividendEngine.get_upcoming_ex_dates(positions, days_ahead=30)
        
        assert isinstance(upcoming, list)
        # In production, this would return actual ex-dates


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
