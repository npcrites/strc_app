"""
Test script for price updates - shows before/after comparison
"""
import sys
import os
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.asset_price import AssetPrice
from app.models.position import Position
from app.services.price_service import PriceService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def show_prices(db: Session, label: str = "Current Prices"):
    """Display current prices in cache"""
    prices = db.query(AssetPrice).order_by(AssetPrice.symbol).all()
    
    print(f"\n{label}:")
    print("-" * 60)
    if not prices:
        print("  No prices in cache")
        return {}
    
    price_dict = {}
    for price in prices:
        age = (datetime.utcnow() - price.updated_at).total_seconds()
        age_str = f"{int(age)}s" if age < 60 else f"{int(age/60)}m"
        print(f"  {price.symbol:<10} ${float(price.price):>10.2f}  (updated {age_str} ago)")
        price_dict[price.symbol] = float(price.price)
    
    print(f"\n  Total: {len(prices)} symbols")
    return price_dict


def get_active_symbols(db: Session) -> list:
    """Get symbols from positions"""
    positions = db.query(Position.ticker).filter(
        Position.shares > 0
    ).distinct().all()
    return sorted([p.ticker.upper() for p in positions if p.ticker])


def main():
    """Test price updates"""
    print("=" * 60)
    print("  PRICE UPDATE TEST")
    print("=" * 60)
    
    db = SessionLocal()
    try:
        # Check for active symbols
        active_symbols = get_active_symbols(db)
        print(f"\nActive symbols from positions: {active_symbols}")
        
        if not active_symbols:
            print("\n⚠️  No active positions found!")
            print("   Create some positions with shares > 0 to test price updates.")
            return
        
        # Show current prices
        before_prices = show_prices(db, "BEFORE Update")
        
        # Trigger update
        print("\n" + "=" * 60)
        print("  Triggering price update from Alpaca API...")
        print("=" * 60)
        
        price_service = PriceService()
        stats = price_service.update_all_prices(db)
        
        print(f"\nUpdate Results:")
        print(f"  Symbols checked: {stats['symbols_checked']}")
        print(f"  Prices fetched: {stats['prices_fetched']}")
        print(f"  Prices updated: {stats['prices_updated']}")
        
        # Wait a moment for database to commit
        time.sleep(0.5)
        
        # Show updated prices
        after_prices = show_prices(db, "AFTER Update")
        
        # Show changes
        if before_prices and after_prices:
            print("\n" + "=" * 60)
            print("  PRICE CHANGES")
            print("=" * 60)
            
            all_symbols = set(before_prices.keys()) | set(after_prices.keys())
            changes_shown = False
            
            for symbol in sorted(all_symbols):
                before = before_prices.get(symbol)
                after = after_prices.get(symbol)
                
                if before is None:
                    print(f"  {symbol:<10} NEW: ${after:.2f}")
                    changes_shown = True
                elif after is None:
                    print(f"  {symbol:<10} REMOVED (was ${before:.2f})")
                    changes_shown = True
                elif before != after:
                    change = after - before
                    change_pct = (change / before * 100) if before > 0 else 0
                    arrow = "↑" if change > 0 else "↓" if change < 0 else "→"
                    print(f"  {symbol:<10} {arrow} ${before:.2f} → ${after:.2f} "
                          f"({change:+.2f}, {change_pct:+.2f}%)")
                    changes_shown = True
            
            if not changes_shown:
                print("  No price changes detected (prices may be the same)")
        
        print("\n" + "=" * 60)
        print("  Test Complete!")
        print("=" * 60)
        print("\nTo monitor prices in real-time, run:")
        print("  python scripts/monitor_price_updates.py")
        print()
        
    except Exception as e:
        logger.error(f"Error during test: {str(e)}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()

