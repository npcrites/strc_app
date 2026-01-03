"""
Script to investigate portfolio value change from $193 to $211
"""
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.models.position import Position
from app.models.user import User
from app.models.asset_price import AssetPrice
from app.models.dividend import Dividend, DividendStatus
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.services.price_service import PriceService
from sqlalchemy import func
from decimal import Decimal

db = SessionLocal()
try:
    user = db.query(User).filter(User.is_active == True).first()
    if not user:
        print("No active user found")
        exit(1)
    
    print("=" * 70)
    print("INVESTIGATING PORTFOLIO VALUE CHANGE: $193 → $211")
    print("=" * 70)
    
    # Get current positions
    positions = db.query(Position).filter(
        Position.user_id == user.id,
        Position.shares > 0
    ).all()
    
    # Get symbols and prices
    symbols = list(set([p.ticker.upper() for p in positions if p.ticker]))
    price_service = PriceService()
    prices = price_service.get_prices(db, symbols)
    
    print("\n📊 CURRENT POSITIONS & PRICES:")
    print("-" * 70)
    
    total_position_value = Decimal('0.00')
    position_details = []
    for position in positions:
        symbol = position.ticker.upper()
        shares = Decimal(str(position.shares))
        
        # Get live price
        price = prices.get(symbol)
        if price is None and position.market_value and shares > 0:
            price = float(position.market_value) / float(shares)
        
        if price is None:
            print(f"  {symbol:6}  {float(shares):8.2f} shares  Price: N/A  Value: N/A")
            continue
        
        price_decimal = Decimal(str(price))
        current_value = shares * price_decimal
        total_position_value += current_value
        
        # Check when price was last updated
        asset_price = db.query(AssetPrice).filter(AssetPrice.symbol == symbol).first()
        last_update = asset_price.updated_at if asset_price else None
        
        position_details.append({
            'symbol': symbol,
            'shares': float(shares),
            'price': float(price),
            'value': float(current_value),
            'last_update': last_update
        })
        
        print(f"  {symbol:6}  {float(shares):8.2f} shares  @ ${float(price):8.2f}  = ${float(current_value):10.2f}")
        if last_update:
            age_seconds = (datetime.utcnow() - last_update).total_seconds()
            print(f"         Price last updated: {last_update.strftime('%Y-%m-%d %H:%M:%S')} ({age_seconds:.0f}s ago)")
    
    print("-" * 70)
    print(f"  Total Position Value: ${float(total_position_value):10.2f}")
    
    # Get total dividends paid
    total_dividends = db.query(func.coalesce(func.sum(Dividend.amount), 0)).filter(
        Dividend.user_id == user.id,
        Dividend.status == DividendStatus.PAID
    ).scalar() or Decimal('0.00')
    
    print(f"\n💰 DIVIDENDS PAID:")
    print("-" * 70)
    print(f"  Total Dividends Received: ${float(total_dividends):10.2f}")
    
    # Calculate total
    total_value = total_position_value + Decimal(str(total_dividends))
    
    print(f"\n{'=' * 70}")
    print(f"  CURRENT TOTAL PORTFOLIO VALUE: ${float(total_value):10.2f}")
    print(f"{'=' * 70}")
    
    # Check recent snapshots
    print(f"\n📈 RECENT PORTFOLIO SNAPSHOTS (last 5):")
    print("-" * 70)
    recent_snapshots = db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == user.id
    ).order_by(PortfolioSnapshot.timestamp.desc()).limit(5).all()
    
    for snap in recent_snapshots:
        print(f"  {snap.timestamp.strftime('%Y-%m-%d %H:%M:%S')}: ${float(snap.total_value):,.2f}")
    
    # Check if test user data might have affected this
    test_user = db.query(User).filter(User.email == "test_graph_user@example.com").first()
    if test_user:
        test_snapshots = db.query(PortfolioSnapshot).filter(
            PortfolioSnapshot.user_id == test_user.id
        ).count()
        print(f"\n⚠️  Note: Test user exists with {test_snapshots} snapshots (should not affect your portfolio)")
    
    # Calculate what $193 would have been
    print(f"\n🔍 ANALYSIS:")
    print("-" * 70)
    print(f"  Current value: ${float(total_value):.2f}")
    print(f"  Previous value: $193.00")
    print(f"  Change: ${float(total_value) - 193.00:+.2f}")
    
    # If we have 2 positions (SATA and STRC), check price changes
    if len(position_details) == 2:
        # Previous total was likely: 1 * 99.56 + 1 * 93.69 = 193.25
        # Current total is: current_value
        # Change = current_value - 193.25
        
        print(f"\n  Price Analysis:")
        for pos in position_details:
            # Estimate previous price based on $193 total
            if pos['symbol'] == 'STRC':
                estimated_prev_price = 99.56
            elif pos['symbol'] == 'SATA':
                estimated_prev_price = 93.69
            else:
                estimated_prev_price = None
            
            if estimated_prev_price:
                price_change = pos['price'] - estimated_prev_price
                value_change = price_change * pos['shares']
                print(f"    {pos['symbol']}: ${estimated_prev_price:.2f} → ${pos['price']:.2f} (${price_change:+.2f})")
                print(f"         Value change: ${value_change:+.2f}")
    
    # Check for new positions added recently
    print(f"\n🔍 RECENT POSITION CHANGES:")
    print("-" * 70)
    recent_positions = db.query(Position).filter(
        Position.user_id == user.id
    ).order_by(Position.updated_at.desc()).limit(5).all()
    
    for pos in recent_positions:
        age_seconds = (datetime.utcnow() - pos.updated_at).total_seconds()
        print(f"  {pos.ticker}: {float(pos.shares)} shares, Updated {age_seconds:.0f}s ago")
    
    # Check for new dividends
    print(f"\n🔍 RECENT DIVIDENDS:")
    print("-" * 70)
    recent_dividends = db.query(Dividend).filter(
        Dividend.user_id == user.id
    ).order_by(Dividend.created_at.desc()).limit(5).all()
    
    if recent_dividends:
        for div in recent_dividends:
            age_seconds = (datetime.utcnow() - div.created_at).total_seconds()
            print(f"  {div.ticker}: ${float(div.amount):.2f} on {div.pay_date}, Created {age_seconds:.0f}s ago")
    else:
        print("  No dividends found")
    
finally:
    db.close()

