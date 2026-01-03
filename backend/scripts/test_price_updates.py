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

# Suppress SQLAlchemy logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)
logging.basicConfig(level=logging.WARNING)  # Only show warnings and errors
logger = logging.getLogger(__name__)


def show_prices(db: Session, label: str = "Current Prices", compact: bool = False):
    """Display current prices in cache"""
    prices = db.query(AssetPrice).order_by(AssetPrice.symbol).all()
    
    if compact:
        # Compact 1-line summary
        if not prices:
            print(f"{label}: No prices in cache")
            return {}
        
        price_list = [f"{p.symbol} ${float(p.price):.2f}" for p in prices[:10]]
        price_str = ", ".join(price_list)
        if len(prices) > 10:
            price_str += f" ... ({len(prices)} total)"
        print(f"{label}: {price_str}")
        return {p.symbol: float(p.price) for p in prices}
    
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
    """Test price updates - concise output"""
    print("=" * 70)
    print("  PRICE UPDATE TEST")
    print("=" * 70)
    
    db = SessionLocal()
    try:
        # Check for active symbols
        active_symbols = get_active_symbols(db)
        
        if not active_symbols:
            print("\n⚠️  No active positions found!")
            print("   Create some positions with shares > 0 to test price updates.")
            return
        
        print(f"\n📊 Active symbols: {', '.join(active_symbols)}")
        
        # Show current prices (compact)
        before_prices = show_prices(db, "Before", compact=True)
        
        # Trigger update
        print("\n🔄 Fetching latest prices from Alpaca...")
        
        price_service = PriceService()
        stats = price_service.update_all_prices(db)
        
        print(f"✅ Update complete: {stats['symbols_checked']} checked, "
              f"{stats['prices_fetched']} fetched, {stats['prices_updated']} updated")
        
        # Wait a moment for database to commit
        time.sleep(0.5)
        
        # Show updated prices (compact)
        after_prices = show_prices(db, "After ", compact=True)
        
        # Show summary of changes (only if there were changes)
        if before_prices and after_prices:
            changed_symbols = []
            for symbol in sorted(set(before_prices.keys()) | set(after_prices.keys())):
                before = before_prices.get(symbol)
                after = after_prices.get(symbol)
                
                if before is None and after is not None:
                    changed_symbols.append(f"{symbol}: NEW ${after:.2f}")
                elif before is not None and after is None:
                    changed_symbols.append(f"{symbol}: REMOVED")
                elif before is not None and after is not None and before != after:
                    change = after - before
                    change_pct = (change / before * 100) if before > 0 else 0
                    arrow = "↑" if change > 0 else "↓"
                    changed_symbols.append(f"{symbol}: {arrow} ${before:.2f}→${after:.2f} ({change_pct:+.2f}%)")
            
            if changed_symbols:
                print(f"\n📈 Changes: {', '.join(changed_symbols)}")
            else:
                print("\n✅ No price changes (prices up to date)")
        
        print("\n" + "=" * 70)
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        logger.error(f"Error during test: {str(e)}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()

