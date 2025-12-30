"""
Integration tests for DashboardService (mocked queries)
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from app.services.dashboard.dashboard_service import DashboardService
from app.services.dashboard.models.time_range import TimeRange, TimeGranularity
from app.services.dashboard.queries.positions import PositionSnapshot
from app.services.dashboard.queries.dividends import CashFlowSnapshot
from app.services.dashboard.queries.activity import ActivityItem, ActivityType


class TestDashboardService:
    """Test DashboardService with mocked queries"""
    
    @pytest.fixture
    def mock_db(self):
        """Mock database session"""
        return Mock()
    
    @pytest.fixture
    def time_range(self):
        """Sample time range"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)
        return TimeRange(start_date, end_date, TimeGranularity.DAILY)
    
    @patch('app.services.dashboard.dashboard_service.activity_queries')
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_basic(self, mock_pos_queries, mock_div_queries, mock_activity_queries, mock_db, time_range):
        """Test basic dashboard building"""
        # Mock query responses
        start_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.start_date),
        ]
        end_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 110.0, 11000.0, time_range.end_date),
        ]
        daily_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.start_date),
            PositionSnapshot(1, "preferred_stock", 100.0, 110.0, 11000.0, time_range.end_date),
        ]
        cash_flows = []  # No cash flows for basic test
        
        mock_pos_queries.get_position_snapshots.side_effect = [start_snapshots, end_snapshots]
        mock_pos_queries.get_daily_position_snapshots.return_value = daily_snapshots
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = cash_flows
        
        # Build dashboard
        snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        # Assertions
        assert snapshot.total.current == 11000.0
        assert snapshot.total.start == 10000.0
        assert snapshot.total.delta.absolute == 1000.0
        assert abs(snapshot.total.delta.percent - 10.0) < 0.1
        
        assert len(snapshot.allocation) == 1
        assert snapshot.allocation[0].asset_type == "preferred_stock"
        assert snapshot.allocation[0].value == 11000.0
    
    @patch('app.services.dashboard.dashboard_service.activity_queries')
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_with_cash_flows(self, mock_pos_queries, mock_div_queries, mock_activity_queries, mock_db, time_range):
        """Test dashboard building with cash flows"""
        start_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.start_date),
        ]
        end_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 110.0, 11000.0, time_range.end_date),
        ]
        daily_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.start_date),
            PositionSnapshot(1, "preferred_stock", 100.0, 110.0, 11000.0, time_range.end_date),
        ]
        cash_flows = [
            CashFlowSnapshot(1, time_range.start_date + timedelta(days=15), 250.0),
        ]
        
        mock_pos_queries.get_position_snapshots.side_effect = [start_snapshots, end_snapshots]
        mock_pos_queries.get_daily_position_snapshots.return_value = daily_snapshots
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = cash_flows
        mock_activity_queries.get_trades.return_value = []
        mock_activity_queries.get_paid_dividends.return_value = []
        mock_activity_queries.get_upcoming_dividends.return_value = []
        
        # Build dashboard
        snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        # Assertions - total should include cash flows
        assert snapshot.total.current == 11250.0  # 11000 (positions) + 250 (cash)
        assert snapshot.total.start == 10000.0
        assert snapshot.total.delta.absolute == 1250.0
        assert abs(snapshot.total.delta.percent - 12.5) < 0.1
        
        # Check that separate series are included
        assert snapshot.performance.position_series is not None
        assert snapshot.performance.cash_series is not None
        assert len(snapshot.performance.cash_series) > 0
    
    @patch('app.services.dashboard.dashboard_service.activity_queries')
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_empty_portfolio(self, mock_pos_queries, mock_div_queries, mock_activity_queries, mock_db, time_range):
        """Test dashboard with empty portfolio"""
        mock_pos_queries.get_position_snapshots.return_value = []
        mock_pos_queries.get_daily_position_snapshots.return_value = []
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = []
        mock_activity_queries.get_trades.return_value = []
        mock_activity_queries.get_paid_dividends.return_value = []
        mock_activity_queries.get_upcoming_dividends.return_value = []
        
        snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        assert snapshot.total.current == 0.0
        assert snapshot.total.start == 0.0
        assert len(snapshot.allocation) == 0
        assert len(snapshot.performance.series) == 0
    
    def test_build_dashboard_invalid_user_id(self, mock_db, time_range):
        """Test dashboard with invalid user_id"""
        with pytest.raises(ValueError, match="user_id required"):
            DashboardService.build_dashboard(mock_db, None, time_range)
    
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_multiple_asset_types(self, mock_pos_queries, mock_div_queries, mock_db, time_range):
        """Test dashboard with multiple asset types"""
        end_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.end_date),
            PositionSnapshot(2, "common_stock", 50.0, 50.0, 2500.0, time_range.end_date),
        ]
        
        mock_pos_queries.get_position_snapshots.side_effect = [[], end_snapshots]
        mock_pos_queries.get_daily_position_snapshots.return_value = []
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = []
        
        # Mock activity queries
        with patch('app.services.dashboard.dashboard_service.activity_queries') as mock_activity:
            mock_activity.get_trades.return_value = []
            mock_activity.get_paid_dividends.return_value = []
            mock_activity.get_upcoming_dividends.return_value = []
            
            snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        assert len(snapshot.allocation) == 2
        assert snapshot.allocation[0].asset_type == "preferred_stock"
        assert snapshot.allocation[1].asset_type == "common_stock"
    
    @patch('app.services.dashboard.dashboard_service.activity_queries')
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_with_activity(self, mock_pos_queries, mock_div_queries, mock_activity_queries, mock_db, time_range):
        """Test dashboard includes activity items"""
        end_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.end_date),
        ]
        
        mock_pos_queries.get_position_snapshots.side_effect = [[], end_snapshots]
        mock_pos_queries.get_daily_position_snapshots.return_value = []
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = []
        
        # Mock activity items
        activity_items = [
            ActivityItem(
                timestamp=time_range.start_date + timedelta(days=10),
                activity_type=ActivityType.DIVIDEND,
                position_id=1,
                asset_type="preferred_stock",
                dividend_amount=250.0,
                ticker="STRC"
            ),
            ActivityItem(
                timestamp=time_range.end_date + timedelta(days=5),
                activity_type=ActivityType.UPCOMING_DIVIDEND,
                position_id=1,
                asset_type="preferred_stock",
                dividend_amount=250.0,
                ticker="STRC"
            ),
        ]
        
        mock_activity_queries.get_trades.return_value = []
        mock_activity_queries.get_paid_dividends.return_value = [activity_items[0]]
        mock_activity_queries.get_upcoming_dividends.return_value = [activity_items[1]]
        
        snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        assert len(snapshot.activity) == 2
        assert snapshot.activity[0].activity_type == "DIVIDEND"
        assert snapshot.activity[1].activity_type == "UPCOMING_DIVIDEND"
        # Verify chronological sorting
        assert snapshot.activity[0].timestamp < snapshot.activity[1].timestamp
    
    @patch('app.services.dashboard.dashboard_service.activity_queries')
    @patch('app.services.dashboard.dashboard_service.dividend_queries')
    @patch('app.services.dashboard.dashboard_service.position_queries')
    def test_build_dashboard_activity_empty(self, mock_pos_queries, mock_div_queries, mock_activity_queries, mock_db, time_range):
        """Test dashboard with no activity"""
        end_snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, time_range.end_date),
        ]
        
        mock_pos_queries.get_position_snapshots.side_effect = [[], end_snapshots]
        mock_pos_queries.get_daily_position_snapshots.return_value = []
        mock_div_queries.get_daily_cash_flow_snapshots.return_value = []
        mock_activity_queries.get_trades.return_value = []
        mock_activity_queries.get_paid_dividends.return_value = []
        mock_activity_queries.get_upcoming_dividends.return_value = []
        
        snapshot = DashboardService.build_dashboard(mock_db, 1, time_range)
        
        assert len(snapshot.activity) == 0

