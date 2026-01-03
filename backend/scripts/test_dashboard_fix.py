#!/usr/bin/env python3
"""
Test the dashboard fix to verify we're getting more data points
"""
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent.parent / ".env")

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.session import SessionLocal
from app.models.user import User
from app.services.dashboard.dashboard_service import DashboardService
from app.services.dashboard.models.time_range import TimeRange

def test_dashboard():
    """Test dashboard with ALL time range"""
    db = SessionLocal()
    
    try:
        # Get active user
        user = db.query(User).filter(User.is_active == True).first()
        if not user:
            print("❌ No active user found")
            return
        
        print(f"👤 Testing dashboard for user: {user.email} (ID: {user.id})")
        print("=" * 80)
        
        # Test "ALL" time range
        time_range = TimeRange.from_shorthand("ALL")
        print(f"\n📊 Testing 'ALL' time range:")
        print(f"   Start: {time_range.start_date}")
        print(f"   End: {time_range.end_date}")
        print(f"   Granularity: {time_range.granularity.value}")
        
        # Build dashboard
        dashboard = DashboardService.build_dashboard(db, user.id, time_range)
        
        # Check performance series
        if dashboard.performance and dashboard.performance.series:
            series_count = len(dashboard.performance.series)
            print(f"\n✅ Dashboard built successfully!")
            print(f"   Performance series data points: {series_count}")
            
            if series_count > 2:
                print(f"   🎉 SUCCESS! We now have {series_count} data points (was 2 before)")
            else:
                print(f"   ⚠️  Still only {series_count} data points")
            
            # Show first few timestamps
            if series_count > 0:
                print(f"\n   First few timestamps:")
                for i, point in enumerate(dashboard.performance.series[:5]):
                    print(f"     {i+1}. {point.timestamp} - ${point.value:.2f}")
                if series_count > 5:
                    print(f"     ... and {series_count - 5} more")
        else:
            print("❌ No performance series data")
        
        # Check totals
        if dashboard.total:
            print(f"\n💰 Portfolio Totals:")
            print(f"   Current: ${dashboard.total.current:.2f}")
            print(f"   Start: ${dashboard.total.start:.2f}")
            print(f"   Delta: ${dashboard.total.delta.absolute:.2f} ({dashboard.total.delta.percent:.2f}%)")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_dashboard()

