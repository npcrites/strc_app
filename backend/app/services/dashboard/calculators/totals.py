"""
Totals calculator for portfolio value aggregation including cash flows
"""
from typing import List, Tuple, Optional
from datetime import datetime

from app.services.dashboard.queries.positions import PositionSnapshot
from app.services.dashboard.queries.dividends import CashFlowSnapshot


class TotalsCalculator:
    """Pure function calculator—no DB access."""
    
    @staticmethod
    def calculate(
        start_snapshots: List[PositionSnapshot],
        end_snapshots: List[PositionSnapshot],
        cash_flows: Optional[List[CashFlowSnapshot]] = None,
        end_timestamp: Optional[datetime] = None,
    ) -> Tuple[float, float, float, float]:
        """
        Calculate total portfolio values and deltas including cash flows.
        
        Sum end_value = sum(latest positions) + sum(all cash flows up to end timestamp).
        Delta calculation uses combined total.
        
        Args:
            start_snapshots: Position snapshots at range start
            end_snapshots: Position snapshots at range end
            cash_flows: Optional list of cash flow snapshots
            end_timestamp: End timestamp for cash flow filtering
        
        Returns:
            Tuple of (start_value, end_value, absolute_delta, percent_delta)
        """
        # Calculate position values
        start_value = sum(s.value for s in start_snapshots)
        end_position_value = sum(s.value for s in end_snapshots)
        
        # Calculate cumulative cash flows up to end timestamp
        cumulative_cash = 0.0
        if cash_flows and end_timestamp:
            for cash_flow in cash_flows:
                # Only include cash flows up to end timestamp
                if cash_flow.timestamp <= end_timestamp:
                    cumulative_cash += cash_flow.amount
        
        # Total end value = positions + cumulative cash
        end_value = end_position_value + cumulative_cash
        
        # Calculate deltas
        absolute_delta = end_value - start_value
        
        # Handle edge case: zero or negative start value
        if start_value > 0:
            percent_delta = (absolute_delta / start_value) * 100
        else:
            percent_delta = 0.0 if end_value == 0 else 100.0
        
        return start_value, end_value, absolute_delta, percent_delta
