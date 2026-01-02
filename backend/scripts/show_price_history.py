"""
Script to display fetched prices for STRC, MSTR, and SATA with timestamps
Run from backend directory: python scripts/show_price_history.py
"""
import os
import sys
from pathlib import Path
from datetime import datetime
from decimal import Decimal

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.position import Position
from sqlalchemy import or_


def format_price(price: Decimal | float | None) -> str:
    """Format price as currency"""
    if price is None:
        return "N/A"
    try:
        return f"${float(price):,.2f}"
    except (ValueError, TypeError):
        return "N/A"


def format_timestamp(timestamp: datetime | None) -> str:
    """Format timestamp in readable format"""
    if timestamp is None:
        return "N/A"
    try:
        return timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, TypeError):
        return "N/A"


def show_price_history():
    """Display price history for STRC, MSTR, and SATA"""
    print("=" * 80)
    print("PRICE HISTORY: STRC, MSTR, SATA")
    print("=" * 80)
    
    db = SessionLocal()
    try:
        # Query positions for the specified tickers
        # Note: MSTR might be stored as "MSTR" or "MSTR-A"
        tickers = ["STRC", "SATA", "MSTR", "MSTR-A"]
        
        positions = db.query(Position).filter(
            or_(
                Position.ticker == "STRC",
                Position.ticker == "SATA",
                Position.ticker == "MSTR",
                Position.ticker == "MSTR-A"
            )
        ).order_by(
            Position.ticker,
            Position.snapshot_timestamp.desc()
        ).all()
        
        if not positions:
            print("\n❌ No positions found for STRC, MSTR, or SATA")
            print("   Make sure the database has been populated with position data.")
            return
        
        # Group by ticker
        ticker_data = {}
        for position in positions:
            ticker = position.ticker
            if ticker not in ticker_data:
                ticker_data[ticker] = []
            
            price_per_share = position.current_price_per_share
            timestamp = position.snapshot_timestamp
            
            ticker_data[ticker].append({
                'price': price_per_share,
                'timestamp': timestamp,
                'market_value': float(position.market_value) if position.market_value else None,
                'shares': float(position.shares) if position.shares else None,
            })
        
        # Display results
        print(f"\n📊 Found {len(positions)} position records across {len(ticker_data)} ticker(s)\n")
        
        # Display each ticker
        for ticker in ["STRC", "MSTR", "MSTR-A", "SATA"]:
            if ticker not in ticker_data:
                continue
            
            records = ticker_data[ticker]
            print(f"\n{'=' * 80}")
            print(f"📈 {ticker} - {len(records)} price record(s)")
            print(f"{'=' * 80}")
            print(f"{'Timestamp':<25} {'Price/Share':>15} {'Market Value':>15} {'Shares':>15}")
            print("-" * 80)
            
            for record in records:
                timestamp_str = format_timestamp(record['timestamp'])
                price_str = format_price(record['price'])
                market_value_str = format_price(record['market_value'])
                shares_str = f"{record['shares']:,.4f}" if record['shares'] else "N/A"
                
                print(f"{timestamp_str:<25} {price_str:>15} {market_value_str:>15} {shares_str:>15}")
            
            # Show latest price
            if records:
                latest = records[0]  # Already sorted by timestamp desc
                print("-" * 80)
                print(f"Latest: {format_timestamp(latest['timestamp'])} - {format_price(latest['price'])}")
        
        # Summary
        print(f"\n{'=' * 80}")
        print("SUMMARY")
        print(f"{'=' * 80}")
        for ticker in sorted(ticker_data.keys()):
            records = ticker_data[ticker]
            if records:
                latest = records[0]
                print(f"{ticker:8} | Latest: {format_price(latest['price']):>12} | "
                      f"Timestamp: {format_timestamp(latest['timestamp'])}")
        
        print("\n✅ Price history displayed successfully!")
        
    except Exception as e:
        print(f"\n❌ Error fetching price history: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    try:
        show_price_history()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

