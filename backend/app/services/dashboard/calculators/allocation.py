"""
Allocation calculator for asset grouping and composition
"""
from typing import List, Dict
from collections import defaultdict

from app.services.dashboard.queries.positions import PositionSnapshot


class AllocationCalculator:
    """Group positions by asset type and calculate percentages."""
    
    @staticmethod
    def calculate(snapshots: List[PositionSnapshot]) -> List[Dict[str, float]]:
        """
        Group positions by asset_type, sum values and compute percentages.
        
        Args:
            snapshots: List of position snapshots
        
        Returns:
            List of allocation items sorted by value descending
        """
        # Group by asset type
        by_type = defaultdict(float)
        total = 0.0
        
        for snapshot in snapshots:
            asset_type = snapshot.asset_type or "OTHER"
            by_type[asset_type] += snapshot.value
            total += snapshot.value
        
        # Convert to list of dicts with percentages
        result = []
        for asset_type, value in sorted(by_type.items(), key=lambda x: x[1], reverse=True):
            percent = (value / total * 100) if total > 0 else 0.0
            result.append({
                "asset_type": asset_type,
                "value": round(value, 2),
                "percent": round(percent, 2),
            })
        
        return result

