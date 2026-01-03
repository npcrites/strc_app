#!/usr/bin/env python3
"""
Investigate portfolio and position snapshots to understand why only 2 data points are returned
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.position_snapshot import PositionSnapshot
from app.models.user import User
from datetime import datetime
from collections import defaultdict
from app.services.dashboard.queries.positions import get_daily_position_snapshots
from app.services.dashboard.models.time_range import TimeRange

def investigate_snapshots():
    """Investigate snapshot data for the active user"""
    db: Session = SessionLocal()
    
    try:
        # Get active user
        user = db.query(User).filter(User.is_active == True).first()
        if not user:
            print("❌ No active user found")
            return
        
        print(f"👤 User: {user.email} (ID: {user.id})")
        print("=" * 80)
        
        # Get all portfolio snapshots
        portfolio_snapshots = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == user.id
        ).order_by(PortfolioSnapshot.timestamp.asc()).all()
        
        print(f"\n📊 Total Portfolio Snapshots: {len(portfolio_snapshots)}")
        
        if not portfolio_snapshots:
            print("❌ No portfolio snapshots found")
            return
        
        # Analyze date distribution
        print("\n📅 Date Distribution:")
        date_counts = defaultdict(int)
        for snap in portfolio_snapshots:
            month_key = snap.timestamp.strftime("%Y-%m")
            date_counts[month_key] += 1
        
        for month, count in sorted(date_counts.items()):
            print(f"  {month}: {count} snapshots")
        
        # Check which snapshots have position snapshots
        print("\n🔍 Position Snapshot Analysis:")
        snapshots_with_positions = 0
        snapshots_without_positions = 0
        total_position_snapshots = 0
        
        monthly_snapshots_with_positions = defaultdict(int)
        monthly_snapshots_without_positions = defaultdict(int)
        
        for portfolio_snap in portfolio_snapshots:
            position_snapshots = db.query(PositionSnapshot).filter(
                PositionSnapshot.portfolio_snapshot_id == portfolio_snap.id
            ).all()
            
            month_key = portfolio_snap.timestamp.strftime("%Y-%m")
            
            if position_snapshots:
                snapshots_with_positions += 1
                total_position_snapshots += len(position_snapshots)
                monthly_snapshots_with_positions[month_key] += 1
            else:
                snapshots_without_positions += 1
                monthly_snapshots_without_positions[month_key] += 1
        
        print(f"  Portfolio snapshots WITH position snapshots: {snapshots_with_positions}")
        print(f"  Portfolio snapshots WITHOUT position snapshots: {snapshots_without_positions}")
        print(f"  Total position snapshots: {total_position_snapshots}")
        
        print("\n📊 Monthly Breakdown (Portfolio Snapshots with Position Snapshots):")
        for month in sorted(set(list(monthly_snapshots_with_positions.keys()) + list(monthly_snapshots_without_positions.keys()))):
            with_pos = monthly_snapshots_with_positions.get(month, 0)
            without_pos = monthly_snapshots_without_positions.get(month, 0)
            print(f"  {month}: {with_pos} with positions, {without_pos} without positions")
        
        # Simulate the query logic for "ALL" time range
        print("\n🔬 Simulating 'ALL' Time Range Query:")
        
        # Test with "ALL" time range
        time_range = TimeRange.from_shorthand("ALL")
        result = get_daily_position_snapshots(
            db, 
            user.id, 
            time_range.start_date, 
            time_range.end_date,
            time_range.granularity
        )
        
        print(f"  Query returned: {len(result)} data points")
        
        # Group by date to see distribution
        date_groups = defaultdict(int)
        for item in result:
            date_key = item.timestamp.strftime("%Y-%m-%d")
            date_groups[date_key] += 1
        
        print(f"  Unique dates: {len(date_groups)}")
        if len(date_groups) <= 10:
            for date_key in sorted(date_groups.keys()):
                print(f"    {date_key}: {date_groups[date_key]} position snapshots")
        
        print(f"\n📈 Result Summary:")
        print(f"  Total data points returned: {len(result)}")
        
        # Show first and last snapshots
        print("\n📅 First and Last Snapshots:")
        first = portfolio_snapshots[0]
        last = portfolio_snapshots[-1]
        
        first_pos = db.query(PositionSnapshot).filter(
            PositionSnapshot.portfolio_snapshot_id == first.id
        ).count()
        last_pos = db.query(PositionSnapshot).filter(
            PositionSnapshot.portfolio_snapshot_id == last.id
        ).count()
        
        print(f"  First: {first.timestamp} (ID: {first.id}, {first_pos} position snapshots)")
        print(f"  Last: {last.timestamp} (ID: {last.id}, {last_pos} position snapshots)")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    investigate_snapshots()

