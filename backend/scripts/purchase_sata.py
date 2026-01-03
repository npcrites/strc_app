"""
Script to purchase SATA stock through Alpaca and update the database
"""
import sys
import os
import asyncio
from datetime import datetime, timedelta

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.db.session import SessionLocal
from app.models.user import User
from app.services.alpaca_trading_service import AlpacaTradingService
from app.services.position_sync_service import PositionSyncService
from app.services.snapshot_service import SnapshotService
from app.core.config import settings
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def purchase_sata(notional_amount: float = 100.0):
    """
    Purchase SATA stock through Alpaca and sync to database
    
    Args:
        notional_amount: Dollar amount to invest (default: $100)
    """
    db = SessionLocal()
    
    try:
        # Get active user
        user = db.query(User).filter(User.is_active == True).first()
        if not user:
            logger.error("No active user found")
            return
        
        logger.info(f"Found user: {user.email} (ID: {user.id})")
        
        # Check if we have API keys or OAuth token
        use_oauth = bool(user.alpaca_access_token)
        use_api_keys = bool(settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY)
        
        if not use_oauth and not use_api_keys:
            logger.error("No Alpaca credentials found. Need either OAuth token or API keys in config.")
            return
        
        # Initialize trading service
        if use_oauth:
            logger.info("Using OAuth token for Alpaca")
            trading_service = AlpacaTradingService(
                access_token=user.alpaca_access_token,
                use_paper=True
            )
        else:
            logger.info("Using API keys for Alpaca")
            trading_service = AlpacaTradingService(
                api_key=settings.ALPACA_API_KEY,
                secret_key=settings.ALPACA_SECRET_KEY,
                use_paper=True
            )
        
        # Check account status
        account = await trading_service.get_account()
        logger.info(f"Account status: {account.get('status')}")
        logger.info(f"Cash available: ${float(account.get('cash', 0)):.2f}")
        logger.info(f"Buying power: ${float(account.get('buying_power', 0)):.2f}")
        
        if account.get('trading_blocked', False):
            logger.error("Trading is blocked on this account")
            return
        
        # Check if SATA is fractionable
        logger.info("Checking SATA asset info...")
        import httpx
        url = f"{trading_service.base_url}/v2/assets/SATA"
        async with httpx.AsyncClient() as client:
            asset_response = await client.get(url, headers=trading_service._get_headers())
            if asset_response.status_code == 200:
                asset = asset_response.json()
                is_fractionable = asset.get('fractionable', False)
                logger.info(f"SATA is fractionable: {is_fractionable}")
            else:
                logger.warning(f"Could not fetch SATA asset info, assuming not fractionable")
                is_fractionable = False
        
        # Get current price to calculate quantity
        logger.info("Getting current SATA price...")
        from app.services.price_service import PriceService
        price_service = PriceService()
        prices = price_service.get_prices(db, ["SATA"])
        current_price = prices.get("SATA")
        
        if current_price:
            logger.info(f"Current SATA price: ${current_price:.2f}")
        else:
            # Try to get from Alpaca bars endpoint
            try:
                import httpx
                url = f"{trading_service.base_url}/v2/stocks/SATA/bars/latest"
                async with httpx.AsyncClient() as client:
                    bars_response = await client.get(url, headers=trading_service._get_headers())
                    if bars_response.status_code == 200:
                        bars_data = bars_response.json()
                        if 'bar' in bars_data:
                            current_price = float(bars_data['bar'].get('c', 0))  # 'c' is close price
                            logger.info(f"Current SATA price from bars: ${current_price:.2f}")
                    else:
                        logger.warning(f"Could not get price from bars: {bars_response.status_code}")
            except Exception as e:
                logger.warning(f"Error getting price from bars: {e}")
            
            if not current_price:
                logger.error("Cannot determine current price. Cannot place order.")
                return
        
        # Place buy order for SATA
        if is_fractionable:
            logger.info(f"Placing market buy order for SATA: ${notional_amount:.2f} (fractional)")
            order = await trading_service.place_market_buy_order("SATA", notional=notional_amount)
        else:
            # Calculate whole shares we can buy
            if current_price and current_price > 0:
                qty = int(notional_amount / current_price)
                if qty < 1:
                    logger.error(f"Not enough to buy even 1 share (need ${current_price:.2f}, have ${notional_amount:.2f})")
                    return
                actual_cost = qty * current_price
                logger.info(f"Placing market buy order for SATA: {qty} shares @ ~${current_price:.2f} = ~${actual_cost:.2f}")
                order = await trading_service.place_market_buy_order("SATA", qty=qty)
            else:
                logger.error("Cannot determine quantity without current price")
                return
        
        logger.info(f"Order placed successfully!")
        logger.info(f"Order ID: {order.get('id')}")
        logger.info(f"Status: {order.get('status')}")
        logger.info(f"Symbol: {order.get('symbol')}")
        if order.get('notional'):
            logger.info(f"Notional: ${float(order.get('notional', 0)):.2f}")
        if order.get('qty'):
            logger.info(f"Quantity: {order.get('qty')}")
        logger.info(f"Filled quantity: {order.get('filled_qty', '0')}")
        
        # Wait and check order status until filled
        order_id = order.get('id')
        max_wait_time = 30  # Wait up to 30 seconds
        wait_interval = 2  # Check every 2 seconds
        waited = 0
        
        logger.info(f"Waiting for order to fill (checking every {wait_interval}s, max {max_wait_time}s)...")
        while waited < max_wait_time:
            await asyncio.sleep(wait_interval)
            waited += wait_interval
            
            # Check order status
            order_status = await trading_service.get_order(order_id)
            if order_status:
                status = order_status.get('status', 'unknown')
                filled_qty = float(order_status.get('filled_qty', 0))
                logger.info(f"  Order status: {status}, Filled: {filled_qty} shares")
                
                if status == 'filled':
                    logger.info(f"✅ Order filled! {filled_qty} shares")
                    break
                elif status in ['canceled', 'expired', 'rejected']:
                    logger.warning(f"⚠️  Order {status}, cannot proceed")
                    return
            else:
                logger.warning("Could not retrieve order status")
        
        if waited >= max_wait_time:
            logger.warning(f"Order not filled after {max_wait_time} seconds, proceeding with sync anyway")
        
        # Check order status
        # Note: In a real scenario, you'd poll the order status until filled
        # For now, we'll proceed with syncing positions
        
        # Sync positions from Alpaca to update database
        logger.info("Syncing positions from Alpaca...")
        position_sync_service = PositionSyncService()
        sync_stats = await position_sync_service.sync_user_positions(db, user, use_paper=True)
        
        logger.info(f"Position sync completed:")
        logger.info(f"  Positions fetched: {sync_stats.get('positions_fetched', 0)}")
        logger.info(f"  Positions created: {sync_stats.get('positions_created', 0)}")
        logger.info(f"  Positions updated: {sync_stats.get('positions_updated', 0)}")
        logger.info(f"  Positions removed: {sync_stats.get('positions_removed', 0)}")
        
        # Create a snapshot to capture this purchase
        logger.info("Creating portfolio snapshot...")
        snapshot_service = SnapshotService()
        portfolio_snapshot = snapshot_service.create_portfolio_snapshot(db, user.id)
        
        if portfolio_snapshot:
            logger.info(f"Snapshot created successfully!")
            logger.info(f"  Snapshot ID: {portfolio_snapshot.id}")
            logger.info(f"  Timestamp: {portfolio_snapshot.timestamp}")
            logger.info(f"  Total value: ${float(portfolio_snapshot.total_value):,.2f}")
            logger.info(f"  Investment value: ${float(portfolio_snapshot.investment_value):,.2f}")
        else:
            logger.warning("Snapshot creation returned None")
        
        logger.info("✅ SATA purchase completed and database updated!")
        
    except Exception as e:
        logger.error(f"Error purchasing SATA: {str(e)}", exc_info=True)
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Purchase SATA stock through Alpaca")
    parser.add_argument(
        "--amount",
        type=float,
        default=100.0,
        help="Dollar amount to invest (default: 100.0)"
    )
    
    args = parser.parse_args()
    
    asyncio.run(purchase_sata(args.amount))

