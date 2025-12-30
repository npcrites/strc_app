"""
Unit tests for calculator layer (pure functions, no DB)
"""
import pytest
from datetime import datetime
from decimal import Decimal

from app.services.dashboard.queries.positions import PositionSnapshot
from app.services.dashboard.queries.dividends import CashFlowSnapshot
from app.services.dashboard.calculators.totals import TotalsCalculator
from app.services.dashboard.calculators.performance import PerformanceCalculator
from app.services.dashboard.calculators.allocation import AllocationCalculator


class TestTotalsCalculator:
    """Test TotalsCalculator"""
    
    def test_calculate_basic(self):
        """Test basic total calculation"""
        start_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
            PositionSnapshot(2, "CASH", 1.0, 5000.0, 5000.0, datetime.now()),
        ]
        
        end_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 120.0, 1200.0, datetime.now()),
            PositionSnapshot(2, "CASH", 1.0, 5000.0, 5000.0, datetime.now()),
        ]
        
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots, end_snapshots
        )
        
        assert start == 6000.0
        assert end == 6200.0
        assert abs_delta == 200.0
        assert abs(pct_delta - 3.33) < 0.1  # Allow small floating point differences
    
    def test_calculate_empty_portfolio(self):
        """Test calculation with empty portfolio"""
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate([], [])
        
        assert start == 0.0
        assert end == 0.0
        assert abs_delta == 0.0
        assert pct_delta == 0.0
    
    def test_calculate_zero_start_value(self):
        """Test calculation when start value is zero"""
        start_snapshots = []
        end_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
        ]
        
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots, end_snapshots
        )
        
        assert start == 0.0
        assert end == 1000.0
        assert abs_delta == 1000.0
        assert pct_delta == 100.0  # 100% gain from zero
    
    def test_calculate_negative_returns(self):
        """Test calculation with negative returns"""
        start_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
        ]
        end_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 80.0, 800.0, datetime.now()),
        ]
        
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots, end_snapshots
        )
        
        assert start == 1000.0
        assert end == 800.0
        assert abs_delta == -200.0
        assert abs(pct_delta - (-20.0)) < 0.1
    
    def test_calculate_with_cash_flows(self):
        """Test calculation including cash flows"""
        start_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
        ]
        end_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 110.0, 1100.0, datetime.now()),
        ]
        cash_flows = [
            CashFlowSnapshot(1, datetime.now(), 50.0),
            CashFlowSnapshot(1, datetime.now(), 25.0),
        ]
        
        end_timestamp = datetime.now()
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots, end_snapshots, cash_flows=cash_flows, end_timestamp=end_timestamp
        )
        
        assert start == 1000.0
        assert end == 1175.0  # 1100 (positions) + 75 (cash)
        assert abs_delta == 175.0
        assert abs(pct_delta - 17.5) < 0.1
    
    def test_calculate_with_cash_flows_only(self):
        """Test calculation with cash flows but no position change"""
        start_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
        ]
        end_snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime.now()),
        ]
        cash_flows = [
            CashFlowSnapshot(1, datetime.now(), 100.0),
        ]
        
        end_timestamp = datetime.now()
        start, end, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots, end_snapshots, cash_flows=cash_flows, end_timestamp=end_timestamp
        )
        
        assert start == 1000.0
        assert end == 1100.0  # 1000 (positions) + 100 (cash)
        assert abs_delta == 100.0
        assert abs(pct_delta - 10.0) < 0.1


class TestPerformanceCalculator:
    """Test PerformanceCalculator"""
    
    def test_calculate_series(self):
        """Test time series calculation"""
        snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime(2025, 1, 1)),
            PositionSnapshot(2, "STOCK", 5.0, 50.0, 250.0, datetime(2025, 1, 1)),
            PositionSnapshot(1, "STOCK", 10.0, 110.0, 1100.0, datetime(2025, 1, 2)),
        ]
        
        result = PerformanceCalculator.calculate_series(snapshots)
        
        assert "total_series" in result
        assert "position_series" in result
        assert "cash_series" in result
        
        position_series = result["position_series"]
        assert len(position_series) == 2
        assert position_series[0]["value"] == 1250.0  # 1000 + 250
        assert position_series[1]["value"] == 1100.0
    
    def test_calculate_stats(self):
        """Test performance stats calculation"""
        series = [
            {"timestamp": datetime(2025, 1, 1), "value": 1000.0},
            {"timestamp": datetime(2025, 1, 2), "value": 1200.0},
            {"timestamp": datetime(2025, 1, 3), "value": 800.0},
        ]
        
        stats = PerformanceCalculator.calculate_stats(series)
        
        assert stats["max"] == 1200.0
        assert stats["min"] == 800.0
    
    def test_calculate_delta(self):
        """Test delta calculation from series"""
        series = [
            {"timestamp": datetime(2025, 1, 1), "value": 1000.0},
            {"timestamp": datetime(2025, 1, 2), "value": 1200.0},
        ]
        
        abs_delta, pct_delta = PerformanceCalculator.calculate_delta(series)
        
        assert abs_delta == 200.0
        assert abs(pct_delta - 20.0) < 0.1
    
    def test_calculate_series_with_cash_flows(self):
        """Test time series calculation with cash flows"""
        snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime(2025, 1, 1)),
            PositionSnapshot(1, "STOCK", 10.0, 110.0, 1100.0, datetime(2025, 1, 2)),
        ]
        cash_flows = [
            CashFlowSnapshot(1, datetime(2025, 1, 1, 12), 50.0),
            CashFlowSnapshot(1, datetime(2025, 1, 2, 12), 25.0),
        ]
        
        result = PerformanceCalculator.calculate_series(snapshots, cash_flows=cash_flows)
        
        assert "total_series" in result
        assert "position_series" in result
        assert "cash_series" in result
        
        # Check position series
        assert len(result["position_series"]) == 2
        assert result["position_series"][0]["value"] == 1000.0
        
        # Check cash series (cumulative)
        assert len(result["cash_series"]) == 2
        assert result["cash_series"][0]["value"] == 50.0
        assert result["cash_series"][1]["value"] == 75.0  # 50 + 25
        
        # Check total series (merged)
        assert len(result["total_series"]) >= 2
    
    def test_calculate_series_merges_timestamps(self):
        """Test that series merging handles different timestamps correctly"""
        snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime(2025, 1, 1)),
            PositionSnapshot(1, "STOCK", 10.0, 110.0, 1100.0, datetime(2025, 1, 3)),
        ]
        cash_flows = [
            CashFlowSnapshot(1, datetime(2025, 1, 2), 50.0),
        ]
        
        result = PerformanceCalculator.calculate_series(snapshots, cash_flows=cash_flows)
        
        # Total series should include all timestamps
        timestamps = [p["timestamp"] for p in result["total_series"]]
        assert datetime(2025, 1, 1) in timestamps
        assert datetime(2025, 1, 2) in timestamps
        assert datetime(2025, 1, 3) in timestamps
    
    def test_calculate_series_forward_fills_missing_days(self):
        """Test that missing days are filled with last known value"""
        snapshots = [
            PositionSnapshot(1, "STOCK", 10.0, 100.0, 1000.0, datetime(2025, 1, 1)),
            PositionSnapshot(1, "STOCK", 10.0, 110.0, 1100.0, datetime(2025, 1, 3)),
        ]
        cash_flows = [
            CashFlowSnapshot(1, datetime(2025, 1, 2), 50.0),
        ]
        
        result = PerformanceCalculator.calculate_series(snapshots, cash_flows=cash_flows)
        
        # On day 2, position value should be forward-filled from day 1
        total_series = result["total_series"]
        day2_point = next((p for p in total_series if p["timestamp"] == datetime(2025, 1, 2)), None)
        assert day2_point is not None
        # Should be 1000 (position from day 1) + 50 (cash on day 2)
        assert day2_point["value"] == 1050.0


class TestAllocationCalculator:
    """Test AllocationCalculator"""
    
    def test_calculate_allocation(self):
        """Test allocation calculation"""
        snapshots = [
            PositionSnapshot(1, "preferred_stock", 100.0, 100.0, 10000.0, datetime.now()),
            PositionSnapshot(2, "preferred_stock", 50.0, 100.0, 5000.0, datetime.now()),
            PositionSnapshot(3, "common_stock", 10.0, 50.0, 500.0, datetime.now()),
        ]
        
        allocation = AllocationCalculator.calculate(snapshots)
        
        assert len(allocation) == 2
        assert allocation[0]["asset_type"] == "preferred_stock"
        assert allocation[0]["value"] == 15000.0
        assert abs(allocation[0]["percent"] - 96.77) < 0.1
        
        assert allocation[1]["asset_type"] == "common_stock"
        assert allocation[1]["value"] == 500.0
    
    def test_calculate_empty_allocation(self):
        """Test allocation with empty portfolio"""
        allocation = AllocationCalculator.calculate([])
        
        assert allocation == []
    
    def test_calculate_allocation_with_other(self):
        """Test allocation with None asset_type"""
        snapshots = [
            PositionSnapshot(1, None, 10.0, 100.0, 1000.0, datetime.now()),
        ]
        
        allocation = AllocationCalculator.calculate(snapshots)
        
        assert len(allocation) == 1
        assert allocation[0]["asset_type"] == "OTHER"
        assert allocation[0]["value"] == 1000.0
        assert allocation[0]["percent"] == 100.0

