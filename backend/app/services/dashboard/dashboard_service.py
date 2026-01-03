"""
Dashboard service orchestrator
"""
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
from sqlalchemy import func

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
from app.services.dashboard.queries.positions import PositionSnapshot
from app.services.dashboard.queries import dividends as dividend_queries
from app.services.dashboard.queries import activity as activity_queries
from app.services.dashboard.calculators.totals import TotalsCalculator
from app.services.dashboard.calculators.performance import PerformanceCalculator
from app.services.dashboard.calculators.allocation import AllocationCalculator
from app.services.price_service import PriceService
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus


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
        
        # For "ALL" time range, use the most recent snapshot timestamp as fixed end date for historical queries
        # But still use live prices for current value (so it updates every 30 seconds)
        is_all_time_range = time_range.start_date is None
        effective_end_date = time_range.end_date
        
        if is_all_time_range:
            # Find the most recent snapshot timestamp to use as fixed end date for historical data
            # This ensures historical queries are consistent
            from app.models.portfolio_snapshot import PortfolioSnapshot
            latest_snapshot = db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.user_id == user_id
            ).order_by(PortfolioSnapshot.timestamp.desc()).first()
            
            if latest_snapshot:
                effective_end_date = latest_snapshot.timestamp
            # If no snapshots exist, fall back to current time
        
        # Query layer: get raw position data
        start_snapshots = position_queries.get_position_snapshots(
            db, user_id, time_range.start_date, effective_end_date
        )
        end_snapshots = position_queries.get_position_snapshots(
            db, user_id, effective_end_date, effective_end_date
        )
        daily_snapshots = position_queries.get_daily_position_snapshots(
            db, user_id, time_range.start_date, effective_end_date, granularity=time_range.granularity
        )
        
        # Query layer: get cash flows (dividends/interest)
        cash_flows = dividend_queries.get_daily_cash_flow_snapshots(
            db, user_id, time_range.start_date, effective_end_date, granularity=time_range.granularity
        )
        
        # Query layer: get activity items (trades, dividends, upcoming dividends)
        activity_items = []
        
        # Get trades (currently returns empty - placeholder for future Transaction model)
        trades = activity_queries.get_trades(
            db, user_id, time_range.start_date, effective_end_date
        )
        activity_items.extend(trades)
        
        # Get paid dividends
        paid_dividends = activity_queries.get_paid_dividends(
            db, user_id, time_range.start_date, effective_end_date
        )
        activity_items.extend(paid_dividends)
        
        # Get upcoming dividends (as of current time)
        upcoming_dividends = activity_queries.get_upcoming_dividends(
            db, user_id, as_of=datetime.utcnow()
        )
        activity_items.extend(upcoming_dividends)
        
        # Sort all activity items chronologically
        activity_items.sort(key=lambda x: x.timestamp)
        
        # Handle edge case: empty portfolio
        if not end_snapshots and not cash_flows:
            return DashboardService._empty_dashboard()
        
        # Always use live prices for current total (updates every 30 seconds)
        # Total portfolio value = (shares * current_price) + dividends paid out
        current_total = DashboardService._calculate_current_total(db, user_id)
        
        # Calculate historical start value from snapshots
        start_val = sum(s.value for s in start_snapshots) if start_snapshots else 0.0
        if not start_snapshots and end_snapshots:
            start_val = sum(s.value for s in end_snapshots)  # Use end as start if no start
        
        # Calculate deltas using current total vs historical start
        abs_delta = current_total - start_val
        pct_delta = 0.0
        if start_val > 0:
            pct_delta = (abs_delta / start_val) * 100
        
        # For historical end value (used in charts), use snapshot data
        end_val = sum(s.value for s in end_snapshots) if end_snapshots else current_total
        
        # Performance metrics with positions + cash flows
        series_data = PerformanceCalculator.calculate_series(
            daily_snapshots,
            cash_flows=cash_flows
        )
        
        total_series = series_data["total_series"]
        position_series = series_data.get("position_series", [])
        cash_series = series_data.get("cash_series", [])
        
        # Add current live total to the series (if not already at end)
        # This ensures all time ranges show the most up-to-date value with live prices
        # Use the same current_total calculated above to ensure consistency
        now = datetime.utcnow()
        if not total_series or (total_series[-1]["timestamp"].replace(tzinfo=None) if total_series[-1]["timestamp"].tzinfo else total_series[-1]["timestamp"]) < now.replace(tzinfo=None):
            total_series.append({
                "timestamp": now,
                "value": round(current_total, 2)
            })
        
        perf_stats = PerformanceCalculator.calculate_stats(total_series)
        perf_abs_delta, perf_pct_delta = PerformanceCalculator.calculate_delta(total_series)
        
        # Allocation (positions only, not including cash)
        # Use current positions with live prices for allocation display
        current_position_snapshots = DashboardService._get_current_position_snapshots(db, user_id)
        allocation_data = AllocationCalculator.calculate(current_position_snapshots)
        
        # Assemble response DTO
        return DashboardSnapshot(
            as_of=datetime.utcnow(),
            granularity=time_range.granularity.value,  # Pass granularity to frontend
            total=TotalMetrics(
                current=round(current_total, 2),  # Use live current total
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
                    ticker=item["ticker"],
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
    def _calculate_current_position_value(db: Session, user_id: int) -> float:
        """
        Calculate current position value using live prices (without dividends).
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Current position value only (not including dividends)
        """
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        if not positions:
            return 0.0
        
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        price_service = PriceService()
        prices = price_service.get_prices(db, symbols)
        
        total_value = Decimal('0.00')
        for position in positions:
            symbol = position.ticker.upper()
            shares = Decimal(str(position.shares))
            
            price = prices.get(symbol)
            if price is None and position.market_value and shares > 0:
                price = float(position.market_value) / float(shares)
            
            if price is None:
                continue
            
            total_value += shares * Decimal(str(price))
        
        return float(total_value)
    
    @staticmethod
    def _get_current_position_snapshots(db: Session, user_id: int) -> List[PositionSnapshot]:
        """
        Get current positions as PositionSnapshot DTOs for allocation calculation.
        Uses live prices from price cache.
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            List of PositionSnapshot DTOs with current values
        """
        from app.services.dashboard.queries.positions import PositionSnapshot as PositionSnapshotDTO
        from datetime import datetime
        
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        if not positions:
            return []
        
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        price_service = PriceService()
        prices = price_service.get_prices(db, symbols)
        
        snapshots = []
        for position in positions:
            symbol = position.ticker.upper()
            shares = Decimal(str(position.shares))
            
            price = prices.get(symbol)
            if price is None and position.market_value and shares > 0:
                price = float(position.market_value) / float(shares)
            
            if price is None:
                continue
            
            value = float(shares * Decimal(str(price)))
            
            snapshots.append(PositionSnapshotDTO(
                position_id=position.id,
                ticker=position.ticker,
                asset_type=position.asset_type,
                quantity=float(shares),
                price=price,
                value=value,
                timestamp=datetime.utcnow()
            ))
        
        return snapshots
    
    @staticmethod
    def _calculate_current_total(db: Session, user_id: int) -> float:
        """
        Calculate current portfolio total using live prices from price cache.
        
        This uses the same logic as /api/portfolio/current to ensure consistency.
        Uses positions table + live prices, not historical snapshots.
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Current total portfolio value (positions + dividends)
        """
        # Get current positions
        positions = db.query(Position).filter(
            Position.user_id == user_id,
            Position.shares > 0
        ).all()
        
        if not positions:
            return 0.0
        
        # Get symbols
        symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
        
        # Get live prices from cache
        price_service = PriceService()
        prices = price_service.get_prices(db, symbols)
        
        # Calculate total investment value
        total_investment_value = Decimal('0.00')
        
        for position in positions:
            symbol = position.ticker.upper()
            shares = Decimal(str(position.shares))
            
            # Get live price from cache
            price = prices.get(symbol)
            if price is None and position.market_value and shares > 0:
                # Fallback to stored market_value
                price = float(position.market_value) / float(shares)
            
            if price is None:
                continue
            
            price_decimal = Decimal(str(price))
            current_value = shares * price_decimal
            total_investment_value += current_value
        
        # Get total dividends paid out (cumulative)
        total_dividends = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
            Dividend.user_id == user_id,
            Dividend.status == DividendStatus.PAID
        ).scalar() or Decimal('0.00')
        
        # Total = investment value + dividends
        total_value = total_investment_value + Decimal(str(total_dividends))
        
        return float(total_value)
    
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
