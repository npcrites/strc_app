"""
Performance calculator for time series and returns
"""
from typing import List, Dict, Optional
from datetime import datetime
from collections import defaultdict

from app.services.dashboard.queries.positions import PositionSnapshot
from app.services.dashboard.queries.dividends import CashFlowSnapshot


class PerformanceCalculator:
    """Calculate time series and performance metrics with positions and cash flows."""
    
    @staticmethod
    def calculate_series(
        daily_snapshots: List[PositionSnapshot],
        cash_flows: Optional[List[CashFlowSnapshot]] = None,
    ) -> Dict[str, List[Dict]]:
        """
        Aggregate daily snapshots into time series with optional cash flows.
        
        Groups positions by timestamp and sums their values.
        Optionally includes cumulative cash flows.
        
        Args:
            daily_snapshots: List of position snapshots
            cash_flows: Optional list of cash flow snapshots
        
        Returns:
            Dictionary with:
            - 'total_series': Combined positions + cumulative cash
            - 'position_series': Position values only
            - 'cash_series': Cumulative cash flows only
        """
        # Group positions by timestamp
        position_by_timestamp = defaultdict(float)
        
        for snapshot in daily_snapshots:
            position_by_timestamp[snapshot.timestamp] += snapshot.value
        
        # Build position series
        position_series = [
            {
                "timestamp": timestamp,
                "value": round(total_value, 2),
            }
            for timestamp, total_value in sorted(position_by_timestamp.items())
        ]
        
        # Build cash flow series (cumulative)
        cash_series = []
        if cash_flows:
            # Sort cash flows by timestamp
            sorted_cash_flows = sorted(cash_flows, key=lambda x: x.timestamp)
            
            cumulative_cash = 0.0
            cash_by_timestamp = {}
            
            for cash_flow in sorted_cash_flows:
                cumulative_cash += cash_flow.amount
                cash_by_timestamp[cash_flow.timestamp] = cumulative_cash
            
            cash_series = [
                {
                    "timestamp": timestamp,
                    "value": round(cumulative_value, 2),
                }
                for timestamp, cumulative_value in sorted(cash_by_timestamp.items())
            ]
        
        # Combine into total series
        # Merge position and cash timestamps, filling gaps with last known value
        total_series = PerformanceCalculator._merge_series(
            position_series, cash_series
        )
        
        return {
            "total_series": total_series,
            "position_series": position_series,
            "cash_series": cash_series,
        }
    
    @staticmethod
    def _merge_series(
        position_series: List[Dict],
        cash_series: List[Dict],
    ) -> List[Dict]:
        """
        Merge position and cash series, filling gaps with last known value.
        
        Ensures deterministic outputs by handling missing days.
        
        Args:
            position_series: Position value series
            cash_series: Cumulative cash flow series
        
        Returns:
            Combined series with total = positions + cash
        """
        if not position_series and not cash_series:
            return []
        
        # Get all unique timestamps
        all_timestamps = set()
        for point in position_series:
            all_timestamps.add(point["timestamp"])
        for point in cash_series:
            all_timestamps.add(point["timestamp"])
        
        sorted_timestamps = sorted(all_timestamps)
        
        # Build lookup maps
        position_map = {p["timestamp"]: p["value"] for p in position_series}
        cash_map = {c["timestamp"]: c["value"] for c in cash_series}
        
        # Build merged series with forward-fill for missing days
        merged = []
        last_position = 0.0
        last_cash = 0.0
        
        for timestamp in sorted_timestamps:
            # Forward-fill: use last known value if missing
            if timestamp in position_map:
                last_position = position_map[timestamp]
            if timestamp in cash_map:
                last_cash = cash_map[timestamp]
            
            total_value = last_position + last_cash
            merged.append({
                "timestamp": timestamp,
                "value": round(total_value, 2),
            })
        
        return merged
    
    @staticmethod
    def calculate_stats(series: List[Dict]) -> Dict[str, float]:
        """
        Extract performance statistics from time series.
        
        Args:
            series: List of time series points
        
        Returns:
            Dictionary with max, min values
        """
        if not series:
            return {"max": 0.0, "min": 0.0}
        
        values = [point["value"] for point in series]
        
        return {
            "max": max(values),
            "min": min(values),
        }
    
    @staticmethod
    def calculate_delta(series: List[Dict]) -> tuple:
        """
        Calculate absolute and percent delta from series.
        
        Args:
            series: List of time series points (sorted by timestamp)
        
        Returns:
            Tuple of (absolute_delta, percent_delta)
        """
        if not series or len(series) < 2:
            return 0.0, 0.0
        
        start_value = series[0]["value"]
        end_value = series[-1]["value"]
        
        absolute_delta = end_value - start_value
        
        if start_value > 0:
            percent_delta = (absolute_delta / start_value) * 100
        else:
            percent_delta = 0.0 if end_value == 0 else 100.0
        
        return absolute_delta, percent_delta
