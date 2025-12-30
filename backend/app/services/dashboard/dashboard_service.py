"""
Dashboard service orchestrator
"""
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List

from app.services.dashboard.models.time_range import TimeRange
from app.services.dashboard.models.dashboard_models import (
    DashboardSnapshot,
    TotalMetrics,
    PerformanceMetrics,
    MetricDelta,
    AllocationItem,
    TimeSeriesPoint,
    ActivityItem,
)
from app.services.dashboard.queries import positions as position_queries
from app.services.dashboard.queries import dividends as dividend_queries
from app.services.dashboard.queries import activity as activity_queries
from app.services.dashboard.calculators.totals import TotalsCalculator
from app.services.dashboard.calculators.performance import PerformanceCalculator
from app.services.dashboard.calculators.allocation import AllocationCalculator


class DashboardService:
    """Orchestrator: validates, queries, calculates, assembles."""
    
    @staticmethod
    def build_dashboard(
        db: Session,
        user_id: int,
        time_range: TimeRange,
    ) -> DashboardSnapshot:
        """
        Main public API for building dashboard snapshot.
        
        Orchestration flow:
        1. Queries positions → start, end, daily snapshots
        2. Queries dividends/interest → daily snapshots
        3. Queries activity → trades, paid dividends, upcoming dividends
        4. Calls TotalsCalculator with positions + cash flows
        5. Calls PerformanceCalculator with positions + cash flows
        6. Calls AllocationCalculator with positions only
        7. Assembles updated DashboardSnapshot DTO with activity feed
        
        Args:
            db: SQLAlchemy session
            user_id: User identifier
            time_range: TimeRange object (from shorthand or custom)
        
        Returns:
            DashboardSnapshot ready for JSON serialization
        
        Raises:
            ValueError: If user_id is invalid
        """
        # Validation
        if not user_id:
            raise ValueError("user_id required")
        
        # Query layer: get raw position data
        start_snapshots = position_queries.get_position_snapshots(
            db, user_id, time_range.start_date, time_range.end_date
        )
        end_snapshots = position_queries.get_position_snapshots(
            db, user_id, time_range.end_date, time_range.end_date
        )
        daily_snapshots = position_queries.get_daily_position_snapshots(
            db, user_id, time_range.start_date, time_range.end_date
        )
        
        # Query layer: get cash flows (dividends/interest)
        cash_flows = dividend_queries.get_daily_cash_flow_snapshots(
            db, user_id, time_range.start_date, time_range.end_date
        )
        
        # Query layer: get activity items (trades, dividends, upcoming dividends)
        activity_items = []
        
        # Get trades (currently returns empty - placeholder for future Transaction model)
        trades = activity_queries.get_trades(
            db, user_id, time_range.start_date, time_range.end_date
        )
        activity_items.extend(trades)
        
        # Get paid dividends
        paid_dividends = activity_queries.get_paid_dividends(
            db, user_id, time_range.start_date, time_range.end_date
        )
        activity_items.extend(paid_dividends)
        
        # Get upcoming dividends (as of current time)
        upcoming_dividends = activity_queries.get_upcoming_dividends(
            db, user_id, as_of=datetime.now()
        )
        activity_items.extend(upcoming_dividends)
        
        # Sort all activity items chronologically
        activity_items.sort(key=lambda x: x.timestamp)
        
        # Handle edge case: empty portfolio
        if not end_snapshots and not cash_flows:
            return DashboardService._empty_dashboard()
        
        # Calculators: pure math
        # TotalsCalculator with positions + cash flows
        start_val, end_val, abs_delta, pct_delta = TotalsCalculator.calculate(
            start_snapshots if start_snapshots else end_snapshots,
            end_snapshots,
            cash_flows=cash_flows,
            end_timestamp=time_range.end_date
        )
        
        # Performance metrics with positions + cash flows
        series_data = PerformanceCalculator.calculate_series(
            daily_snapshots,
            cash_flows=cash_flows
        )
        
        total_series = series_data["total_series"]
        position_series = series_data.get("position_series", [])
        cash_series = series_data.get("cash_series", [])
        
        perf_stats = PerformanceCalculator.calculate_stats(total_series)
        perf_abs_delta, perf_pct_delta = PerformanceCalculator.calculate_delta(total_series)
        
        # Allocation (positions only, not including cash)
        allocation_data = AllocationCalculator.calculate(end_snapshots)
        
        # Assemble response DTO
        return DashboardSnapshot(
            as_of=datetime.now(),
            total=TotalMetrics(
                current=round(end_val, 2),
                start=round(start_val, 2),
                delta=MetricDelta(
                    absolute=round(abs_delta, 2),
                    percent=round(pct_delta, 2)
                ),
            ),
            performance=PerformanceMetrics(
                series=[
                    TimeSeriesPoint(
                        timestamp=point["timestamp"],
                        value=point["value"]
                    )
                    for point in total_series
                ],
                position_series=[
                    TimeSeriesPoint(
                        timestamp=point["timestamp"],
                        value=point["value"]
                    )
                    for point in position_series
                ] if position_series else None,
                cash_series=[
                    TimeSeriesPoint(
                        timestamp=point["timestamp"],
                        value=point["value"]
                    )
                    for point in cash_series
                ] if cash_series else None,
                delta=MetricDelta(
                    absolute=round(perf_abs_delta, 2),
                    percent=round(perf_pct_delta, 2)
                ),
                max=round(perf_stats["max"], 2),
                min=round(perf_stats["min"], 2),
            ),
            allocation=[
                AllocationItem(
                    asset_type=item["asset_type"],
                    value=item["value"],
                    percent=item["percent"],
                )
                for item in allocation_data
            ],
            activity=[
                ActivityItem(
                    timestamp=item.timestamp,
                    activity_type=item.activity_type.value,
                    position_id=item.position_id,
                    asset_type=item.asset_type,
                    quantity=item.quantity,
                    value=item.value,
                    dividend_amount=item.dividend_amount,
                    ex_date=item.ex_date,
                    ticker=item.ticker,
                )
                for item in activity_items
            ],
        )
    
    @staticmethod
    def _empty_dashboard() -> DashboardSnapshot:
        """Return empty dashboard for users with no positions"""
        now = datetime.now()
        return DashboardSnapshot(
            as_of=now,
            total=TotalMetrics(
                current=0.0,
                start=0.0,
                delta=MetricDelta(absolute=0.0, percent=0.0),
            ),
            performance=PerformanceMetrics(
                series=[],
                position_series=None,
                cash_series=None,
                delta=MetricDelta(absolute=0.0, percent=0.0),
                max=0.0,
                min=0.0,
            ),
            allocation=[],
            activity=[],
        )
