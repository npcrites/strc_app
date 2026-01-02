"""
Real-time price update monitor
Shows live price updates as they happen in the database
"""
import sys
import os
import time
from datetime import datetime, timedelta
from typing import Dict, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.session import SessionLocal
from app.models.asset_price import AssetPrice
from app.models.position import Position
from app.services.price_service import PriceService
import logging

logging.basicConfig(level=logging.WARNING)  # Suppress most logs


class PriceMonitor:
    """Monitor price updates in real-time"""
    
    def __init__(self, db: Session):
        self.db = db
        self.price_service = PriceService()
        self.last_check = datetime.utcnow()
        self.previous_prices: Dict[str, float] = {}
    
    def get_all_prices(self) -> Dict[str, Dict]:
        """Get all prices from cache with metadata"""
        prices = self.db.query(AssetPrice).all()
        result = {}
        for price in prices:
            age_seconds = (datetime.utcnow() - price.updated_at).total_seconds()
            result[price.symbol] = {
                "price": float(price.price),
                "updated_at": price.updated_at,
                "age_seconds": age_seconds,
                "is_fresh": age_seconds < 60  # Fresh if < 1 minute old
            }
        return result
    
    def get_active_symbols(self) -> list:
        """Get symbols that users actually hold"""
        positions = self.db.query(Position.ticker).filter(
            Position.shares > 0
        ).distinct().all()
        return sorted([p.ticker.upper() for p in positions if p.ticker])
    
    def format_price_change(self, symbol: str, old_price: Optional[float], new_price: float) -> str:
        """Format price change indicator"""
        if old_price is None:
            return "  NEW"
        
        change = new_price - old_price
        change_pct = (change / old_price * 100) if old_price > 0 else 0
        
        if change > 0:
            return f"  ↑ +${change:.2f} (+{change_pct:.2f}%)"
        elif change < 0:
            return f"  ↓ ${change:.2f} ({change_pct:.2f}%)"
        else:
            return "  → $0.00 (0.00%)"
    
    def format_age(self, age_seconds: float) -> str:
        """Format age as human-readable string"""
        if age_seconds < 60:
            return f"{int(age_seconds)}s ago"
        elif age_seconds < 3600:
            return f"{int(age_seconds / 60)}m ago"
        else:
            return f"{int(age_seconds / 3600)}h ago"
    
    def display_prices(self, prices: Dict[str, Dict], active_symbols: list):
        """Display prices in a formatted table"""
        # Clear screen (works on most terminals)
        os.system('clear' if os.name != 'nt' else 'cls')
        
        print("=" * 80)
        print(f"  REAL-TIME PRICE MONITOR - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
        print()
        
        # Show update status
        time_since_last = (datetime.utcnow() - self.last_check).total_seconds()
        print(f"Last check: {self.format_age(time_since_last)}")
        print(f"Active symbols: {len(active_symbols)}")
        print(f"Cached prices: {len(prices)}")
        print()
        
        if not prices:
            print("  No prices in cache yet. Waiting for price update job...")
            print()
            print("  Make sure:")
            print("    - Server is running with portfolio scheduler enabled")
            print("    - Users have positions with shares > 0")
            print("    - Alpaca API credentials are configured")
            return
        
        # Filter to show active symbols first, then others
        active_prices = {s: prices[s] for s in active_symbols if s in prices}
        other_prices = {s: prices[s] for s in prices if s not in active_symbols}
        
        # Display active symbols
        if active_prices:
            print("  ACTIVE POSITIONS (Symbols you hold):")
            print("-" * 80)
            print(f"  {'Symbol':<10} {'Price':>12} {'Change':>20} {'Updated':>15} {'Status':>10}")
            print("-" * 80)
            
            for symbol in sorted(active_prices.keys()):
                data = active_prices[symbol]
                old_price = self.previous_prices.get(symbol)
                change_str = self.format_price_change(symbol, old_price, data["price"])
                age_str = self.format_age(data["age_seconds"])
                status = "✓ Fresh" if data["is_fresh"] else "⚠ Stale"
                
                print(f"  {symbol:<10} ${data['price']:>11.2f} {change_str:>20} {age_str:>15} {status:>10}")
            
            print()
        
        # Display other cached symbols (if any)
        if other_prices:
            print(f"  OTHER CACHED SYMBOLS ({len(other_prices)}):")
            print("-" * 80)
            for symbol in sorted(other_prices.keys())[:10]:  # Show first 10
                data = other_prices[symbol]
                age_str = self.format_age(data["age_seconds"])
                status = "✓" if data["is_fresh"] else "⚠"
                print(f"  {symbol:<10} ${data['price']:>11.2f} {age_str:>15} {status}")
            
            if len(other_prices) > 10:
                print(f"  ... and {len(other_prices) - 10} more")
            print()
        
        # Summary stats
        fresh_count = sum(1 for p in prices.values() if p["is_fresh"])
        stale_count = len(prices) - fresh_count
        
        print("-" * 80)
        print(f"  Summary: {fresh_count} fresh, {stale_count} stale prices")
        print("=" * 80)
        print()
        print("  Press Ctrl+C to stop monitoring")
        print()
    
    def run(self, refresh_interval: float = 2.0):
        """Run the monitor loop"""
        print("Starting price monitor...")
        print("This will show price updates as they happen in the database.")
        print("Make sure the server is running with the portfolio scheduler enabled.")
        print()
        
        try:
            while True:
                # Get current prices
                prices = self.get_all_prices()
                active_symbols = self.get_active_symbols()
                
                # Display
                self.display_prices(prices, active_symbols)
                
                # Update previous prices for change detection
                self.previous_prices = {s: d["price"] for s, d in prices.items()}
                self.last_check = datetime.utcnow()
                
                # Wait before next refresh
                time.sleep(refresh_interval)
                
        except KeyboardInterrupt:
            print("\n\nMonitor stopped by user.")
            print("=" * 80)


def trigger_manual_update(db: Session):
    """Manually trigger a price update for testing"""
    print("\nTriggering manual price update...")
    price_service = PriceService()
    stats = price_service.update_all_prices(db)
    print(f"Update complete: {stats['symbols_checked']} symbols, "
          f"{stats['prices_fetched']} fetched, {stats['prices_updated']} updated")
    print()


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Monitor real-time price updates")
    parser.add_argument(
        "--refresh",
        type=float,
        default=2.0,
        help="Refresh interval in seconds (default: 2.0)"
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Trigger a manual price update before monitoring"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Show prices once and exit (don't monitor)"
    )
    
    args = parser.parse_args()
    
    db = SessionLocal()
    try:
        if args.update:
            trigger_manual_update(db)
        
        monitor = PriceMonitor(db)
        
        if args.once:
            # Show once and exit
            prices = monitor.get_all_prices()
            active_symbols = monitor.get_active_symbols()
            monitor.display_prices(prices, active_symbols)
        else:
            # Continuous monitoring
            monitor.run(refresh_interval=args.refresh)
            
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()

