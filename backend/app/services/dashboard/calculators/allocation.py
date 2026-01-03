"""
Allocation calculator for asset grouping and composition
"""
from typing import List, Dict
from collections import defaultdict

from app.services.dashboard.queries.positions import PositionSnapshot


class AllocationCalculator:
    """Group positions by ticker and calculate percentages."""
    
    @staticmethod
    def calculate(snapshots: List[PositionSnapshot]) -> List[Dict[str, float]]:
        """
        Group positions by ticker, sum values and compute percentages.
        
        Args:
            snapshots: List of position snapshots
        
        Returns:
            List of allocation items sorted by value descending
        """
        # Group by ticker
        by_ticker = defaultdict(float)
        total = 0.0
        
        for snapshot in snapshots:
            ticker = snapshot.ticker or "UNKNOWN"
            by_ticker[ticker] += snapshot.value
            total += snapshot.value
        
        # Convert to list of dicts with percentages
        result = []
        for ticker, value in sorted(by_ticker.items(), key=lambda x: x[1], reverse=True):
            percent = (value / total * 100) if total > 0 else 0.0
            result.append({
                "ticker": ticker,
                "value": round(value, 2),
                "percent": round(percent, 2),
            })
        
        return result

