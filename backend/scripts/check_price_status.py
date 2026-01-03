"""
Check the status of asset_prices table updates
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.asset_price import AssetPrice
from app.models.position import Position
from app.services.price_service import PriceService
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_price_status():
    """Check the status of price updates"""
    print("=" * 80)
    print("  ASSET PRICES STATUS CHECK")
    print("=" * 80)
    print()
    
    db = SessionLocal()
    try:
        # Check configuration
        print("📋 Configuration:")
        print(f"   PRICE_UPDATE_ENABLED: {settings.PRICE_UPDATE_ENABLED}")
        print(f"   PRICE_UPDATE_INTERVAL_SECONDS: {settings.PRICE_UPDATE_INTERVAL_SECONDS}")
        print(f"   ALPACA_API_KEY configured: {'Yes' if settings.ALPACA_API_KEY else 'No'}")
        print(f"   ALPACA_SECRET_KEY configured: {'Yes' if settings.ALPACA_SECRET_KEY else 'No'}")
        print()
        
        # Check total prices in cache
        total_prices = db.query(AssetPrice).count()
        print(f"📊 Database Status:")
        print(f"   Total prices in cache: {total_prices}")
        
        if total_prices == 0:
            print("   ⚠️  No prices found in asset_prices table")
        else:
            # Get most recent update
            most_recent = db.query(func.max(AssetPrice.updated_at)).scalar()
            if most_recent:
                age = (datetime.utcnow() - most_recent).total_seconds()
                age_str = f"{int(age)}s" if age < 60 else f"{int(age/60)}m" if age < 3600 else f"{int(age/3600)}h"
                print(f"   Most recent update: {most_recent.strftime('%Y-%m-%d %H:%M:%S UTC')} ({age_str} ago)")
                
                # Check if fresh (updated in last 5 minutes)
                is_fresh = age < 300
                if is_fresh:
                    print(f"   ✅ Prices are fresh (updated < 5 minutes ago)")
                else:
                    print(f"   ⚠️  Prices are stale (last update > 5 minutes ago)")
        
        print()
        
        # Check active positions
        active_positions = db.query(Position).filter(Position.shares > 0).all()
        active_symbols = list(set([p.ticker.upper() for p in active_positions if p.ticker]))
        
        print(f"📈 Active Positions:")
        print(f"   Total positions with shares > 0: {len(active_positions)}")
        print(f"   Unique symbols: {len(active_symbols)}")
        
        if active_symbols:
            print(f"   Symbols: {', '.join(sorted(active_symbols))}")
        else:
            print("   ⚠️  No active positions found")
        
        print()
        
        # Check which symbols have cached prices
        if active_symbols:
            cached_prices = db.query(AssetPrice).filter(
                func.upper(AssetPrice.symbol).in_([s.upper() for s in active_symbols])
            ).all()
            
            cached_symbols = set([p.symbol.upper() for p in cached_prices])
            missing_symbols = [s for s in active_symbols if s not in cached_symbols]
            
            print(f"💾 Price Cache Coverage:")
            print(f"   Cached: {len(cached_symbols)}/{len(active_symbols)} symbols")
            
            if cached_prices:
                print(f"   Cached symbols: {', '.join(sorted(cached_symbols))}")
                
                # Show price details
                print()
                print(f"   Price Details:")
                for price in sorted(cached_prices, key=lambda x: x.symbol):
                    age = (datetime.utcnow() - price.updated_at).total_seconds()
                    age_str = f"{int(age)}s" if age < 60 else f"{int(age/60)}m"
                    is_fresh = age < 300
                    status = "✓" if is_fresh else "⚠"
                    print(f"     {status} {price.symbol:<10} ${float(price.price):>10.2f}  (updated {age_str} ago)")
            
            if missing_symbols:
                print()
                print(f"   ⚠️  Missing prices for: {', '.join(sorted(missing_symbols))}")
        
        print()
        print("=" * 80)
        
        # Summary and recommendations
        print()
        print("🔍 Summary:")
        
        if not settings.PRICE_UPDATE_ENABLED:
            print("   ❌ Price updates are DISABLED in configuration")
            print("      Set PRICE_UPDATE_ENABLED=true in .env to enable")
        elif not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
            print("   ❌ Alpaca API credentials are NOT configured")
            print("      Set ALPACA_API_KEY and ALPACA_SECRET_KEY in .env")
        elif total_prices == 0:
            print("   ⚠️  No prices in cache - scheduler may not be running")
            print("      Make sure the FastAPI server is running")
            print("      Check server logs for scheduler messages")
        elif active_symbols and missing_symbols:
            print(f"   ⚠️  Missing prices for {len(missing_symbols)} active symbols")
            print("      Prices may not have been fetched yet")
        elif total_prices > 0:
            most_recent = db.query(func.max(AssetPrice.updated_at)).scalar()
            if most_recent:
                age = (datetime.utcnow() - most_recent).total_seconds()
                if age > 300:
                    print(f"   ⚠️  Prices are stale (last update {int(age/60)} minutes ago)")
                    print("      Scheduler may not be running or may have errors")
                else:
                    print("   ✅ Price updates appear to be working correctly")
        
        print()
        print("💡 To manually trigger a price update, run:")
        print("   python scripts/test_price_updates.py")
        print()
        print("💡 To monitor prices in real-time, run:")
        print("   python scripts/monitor_price_updates.py --once")
        print()
        
    except Exception as e:
        logger.error(f"Error checking price status: {str(e)}", exc_info=True)
        print(f"\n❌ Error: {str(e)}")
    finally:
        db.close()


if __name__ == "__main__":
    check_price_status()

