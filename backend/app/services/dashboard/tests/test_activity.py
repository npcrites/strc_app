"""
Unit tests for activity query layer
"""
import pytest
from datetime import datetime, date, timedelta
from unittest.mock import Mock, patch
from decimal import Decimal

from app.services.dashboard.queries.activity import (
    ActivityItem,
    ActivityType,
    get_trades,
    get_paid_dividends,
    get_upcoming_dividends,
)
from app.models.dividend import Dividend, DividendStatus
from app.models.position import Position


class TestActivityQueries:
    """Test activity query functions"""
    
    @pytest.fixture
    def mock_db(self):
        """Mock database session"""
        return Mock()
    
    def test_get_trades_empty(self, mock_db):
        """Test get_trades returns empty list (placeholder)"""
        result = get_trades(mock_db, 1, datetime.now() - timedelta(days=30), datetime.now())
        assert result == []
    
    def test_get_paid_dividends_empty(self, mock_db):
        """Test get_paid_dividends with empty portfolio"""
        # Mock empty query result
        mock_query = Mock()
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = []
        mock_db.query.return_value = mock_query
        
        result = get_paid_dividends(
            mock_db, 1, datetime.now() - timedelta(days=30), datetime.now()
        )
        
        assert result == []
    
    def test_get_paid_dividends_with_data(self, mock_db):
        """Test get_paid_dividends maps dividends to ActivityItem"""
        # Create mock dividend
        mock_dividend = Mock(spec=Dividend)
        mock_dividend.position_id = 1
        mock_dividend.ticker = "STRC"
        mock_dividend.amount = Decimal("250.0000")
        mock_dividend.pay_date = date(2025, 1, 15)
        mock_dividend.ex_date = date(2025, 1, 1)
        mock_dividend.shares_at_ex_date = Decimal("100.000000")
        
        # Mock position for asset_type lookup
        mock_position = Mock(spec=Position)
        mock_position.asset_type = "preferred_stock"
        
        # Setup query chain
        mock_query = Mock()
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = [mock_dividend]
        mock_db.query.return_value = mock_query
        
        # Mock position query
        mock_pos_query = Mock()
        mock_pos_query.filter.return_value = mock_pos_query
        mock_pos_query.first.return_value = mock_position
        
        # Make db.query return different results based on argument
        def query_side_effect(model):
            if model == Dividend:
                return mock_query
            elif model == Position:
                return mock_pos_query
            return mock_query
        
        mock_db.query.side_effect = query_side_effect
        
        result = get_paid_dividends(
            mock_db, 1, datetime(2025, 1, 1), datetime(2025, 1, 31)
        )
        
        assert len(result) == 1
        assert result[0].activity_type == ActivityType.DIVIDEND
        assert result[0].position_id == 1
        assert result[0].ticker == "STRC"
        assert result[0].dividend_amount == 250.0
        assert result[0].asset_type == "preferred_stock"
        assert result[0].quantity == 100.0
    
    def test_get_upcoming_dividends(self, mock_db):
        """Test get_upcoming_dividends returns upcoming dividends"""
        # Create mock upcoming dividend
        mock_dividend = Mock(spec=Dividend)
        mock_dividend.position_id = 1
        mock_dividend.ticker = "STRC"
        mock_dividend.amount = Decimal("250.0000")
        mock_dividend.pay_date = date(2025, 2, 15)
        mock_dividend.ex_date = date(2025, 2, 1)
        mock_dividend.status = DividendStatus.UPCOMING
        mock_dividend.shares_at_ex_date = Decimal("100.000000")
        
        # Mock position
        mock_position = Mock(spec=Position)
        mock_position.asset_type = "preferred_stock"
        
        # Setup query chain
        mock_query = Mock()
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = [mock_dividend]
        mock_db.query.return_value = mock_query
        
        # Mock position query
        mock_pos_query = Mock()
        mock_pos_query.filter.return_value = mock_pos_query
        mock_pos_query.first.return_value = mock_position
        
        def query_side_effect(model):
            if model == Dividend:
                return mock_query
            elif model == Position:
                return mock_pos_query
            return mock_query
        
        mock_db.query.side_effect = query_side_effect
        
        as_of = datetime(2025, 1, 15)
        result = get_upcoming_dividends(mock_db, 1, as_of)
        
        assert len(result) == 1
        assert result[0].activity_type == ActivityType.UPCOMING_DIVIDEND
        assert result[0].ticker == "STRC"
        assert result[0].ex_date is not None
    
    def test_get_paid_dividends_handles_missing_position(self, mock_db):
        """Test get_paid_dividends handles missing position gracefully"""
        mock_dividend = Mock(spec=Dividend)
        mock_dividend.position_id = None
        mock_dividend.ticker = "STRC"
        mock_dividend.amount = Decimal("250.0000")
        mock_dividend.pay_date = date(2025, 1, 15)
        mock_dividend.ex_date = None
        mock_dividend.shares_at_ex_date = None
        
        mock_query = Mock()
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = [mock_dividend]
        mock_db.query.return_value = mock_query
        
        result = get_paid_dividends(
            mock_db, 1, datetime(2025, 1, 1), datetime(2025, 1, 31)
        )
        
        assert len(result) == 1
        assert result[0].position_id is None
        assert result[0].asset_type is None
        assert result[0].quantity == 0.0
    
    def test_get_paid_dividends_sorted_chronologically(self, mock_db):
        """Test that paid dividends are returned in chronological order"""
        # Create multiple dividends with different dates
        div1 = Mock(spec=Dividend)
        div1.position_id = 1
        div1.ticker = "STRC"
        div1.amount = Decimal("250.0000")
        div1.pay_date = date(2025, 1, 20)
        div1.ex_date = date(2025, 1, 5)
        div1.shares_at_ex_date = Decimal("100.000000")
        
        div2 = Mock(spec=Dividend)
        div2.position_id = 1
        div2.ticker = "STRC"
        div2.amount = Decimal("250.0000")
        div2.pay_date = date(2025, 1, 10)
        div2.ex_date = date(2025, 1, 1)
        div2.shares_at_ex_date = Decimal("100.000000")
        
        mock_query = Mock()
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        # Return in sorted order (div2 comes before div1 chronologically)
        mock_query.all.return_value = [div2, div1]  # Sorted by pay_date
        mock_db.query.return_value = mock_query
        
        # Mock position query
        mock_pos_query = Mock()
        mock_pos_query.filter.return_value = mock_pos_query
        mock_pos_query.first.return_value = None
        
        def query_side_effect(model):
            if model == Position:
                return mock_pos_query
            return mock_query
        
        mock_db.query.side_effect = query_side_effect
        
        result = get_paid_dividends(
            mock_db, 1, datetime(2025, 1, 1), datetime(2025, 1, 31)
        )
        
        # Should be sorted by pay_date (order_by in query)
        assert len(result) == 2
        # Verify chronological order (div2 with pay_date 2025-01-10 comes before div1 with 2025-01-20)
        assert result[0].timestamp.date() == date(2025, 1, 10)
        assert result[1].timestamp.date() == date(2025, 1, 20)
        assert result[0].timestamp < result[1].timestamp

