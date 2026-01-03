"""
Sell Order Service
Handles selling positions with comprehensive error handling, status tracking, and balance verification
"""
from typing import Dict, Optional, Tuple
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
from app.models.position import Position
from app.models.user import User
from app.services.alpaca_trading_service import AlpacaTradingService
from app.services.position_sync_service import PositionSyncService
from app.core.config import settings
import asyncio
import logging

logger = logging.getLogger(__name__)


class SellOrderService:
    """Service for selling positions with comprehensive validation and verification"""
    
    async def sell_position(
        self,
        db: Session,
        user: User,
        symbol: str,
        qty: Optional[float] = None,
        use_paper: bool = True,
        max_wait_seconds: int = 60,
        verify_balance: bool = True,
        verify_position: bool = True
    ) -> Dict[str, any]:
        """
        Sell a position with comprehensive error handling and verification.
        
        Flow:
        1. Pre-flight checks (account status, position exists, trading allowed)
        2. Get initial account balance
        3. Place sell order
        4. Poll order status until filled/rejected/canceled
        5. Verify account balance increased (if verify_balance=True)
        6. Sync positions to verify position removed/updated (if verify_position=True)
        7. Return comprehensive result
        
        Args:
            db: Database session
            user: User object
            symbol: Stock symbol to sell (e.g., "AAPL")
            qty: Number of shares to sell (None = sell all)
            use_paper: Use paper trading API
            max_wait_seconds: Maximum time to wait for order to fill
            verify_balance: Whether to verify account balance increased after sale
            verify_position: Whether to verify position was removed/updated after sale
        
        Returns:
            Dict with:
            - success: bool
            - order_id: str (if order placed)
            - order_status: str
            - filled_qty: float
            - error: str (if failed)
            - account_balance_before: float
            - account_balance_after: float (if verified)
            - position_verified: bool (if verified)
            - warnings: List[str]
        """
        result = {
            "success": False,
            "order_id": None,
            "order_status": None,
            "filled_qty": 0.0,
            "error": None,
            "account_balance_before": None,
            "account_balance_after": None,
            "position_verified": False,
            "warnings": []
        }
        
        try:
            # Initialize trading service
            trading_service = self._get_trading_service(user, use_paper)
            
            # 1. Pre-flight checks
            logger.info(f"🔍 Pre-flight checks for selling {symbol}...")
            
            # Check account status
            account = await trading_service.get_account()
            account_status = account.get('status')
            trading_blocked = account.get('trading_blocked', False)
            
            if account_status != 'ACTIVE':
                result["error"] = f"Account status is {account_status}, cannot place orders"
                logger.error(result["error"])
                return result
            
            if trading_blocked:
                result["error"] = "Trading is blocked on this account"
                logger.error(result["error"])
                return result
            
            # Get initial account balance
            initial_cash = float(account.get('cash', 0))
            result["account_balance_before"] = initial_cash
            logger.info(f"Initial cash balance: ${initial_cash:.2f}")
            
            # Check position exists
            position = db.query(Position).filter(
                Position.user_id == user.id,
                Position.ticker == symbol.upper(),
                Position.shares > 0
            ).first()
            
            if not position:
                result["error"] = f"No position found for {symbol}"
                logger.error(result["error"])
                return result
            
            # Determine quantity to sell
            position_shares = float(position.shares)
            shares_to_sell = qty if qty is not None else position_shares
            
            if shares_to_sell > position_shares:
                result["error"] = f"Cannot sell {shares_to_sell} shares, only {position_shares} available"
                logger.error(result["error"])
                return result
            
            if shares_to_sell <= 0:
                result["error"] = f"Invalid quantity to sell: {shares_to_sell}"
                logger.error(result["error"])
                return result
            
            logger.info(f"📊 Position: {position_shares} shares of {symbol}")
            logger.info(f"📤 Selling: {shares_to_sell} shares")
            
            # 2. Place sell order
            logger.info(f"📤 Placing market sell order for {int(shares_to_sell)} shares of {symbol}...")
            try:
                order = await trading_service.place_market_sell_order(symbol, qty=int(shares_to_sell))
            except Exception as e:
                result["error"] = f"Failed to place order: {str(e)}"
                logger.error(result["error"], exc_info=True)
                return result
            
            order_id = order.get('id')
            result["order_id"] = order_id
            result["order_status"] = order.get('status', 'unknown')
            
            logger.info(f"✅ Order placed: ID={order_id}, Status={result['order_status']}")
            
            # 3. Poll order status
            logger.info(f"⏳ Waiting for order to fill (max {max_wait_seconds}s)...")
            order_filled = await self._poll_order_status(
                trading_service,
                order_id,
                max_wait_seconds,
                check_interval=2
            )
            
            if order_filled:
                result["order_status"] = order_filled.get('status')
                result["filled_qty"] = float(order_filled.get('filled_qty', 0))
                logger.info(f"✅ Order filled: {result['filled_qty']} shares")
            else:
                # Check final status even if timeout
                final_status = await trading_service.get_order(order_id)
                if final_status:
                    result["order_status"] = final_status.get('status', 'unknown')
                    result["filled_qty"] = float(final_status.get('filled_qty', 0))
                    
                    if result["order_status"] in ['canceled', 'expired', 'rejected']:
                        result["error"] = f"Order {result['order_status']}"
                        logger.warning(f"⚠️  Order {result['order_status']}")
                        return result
                    else:
                        result["warnings"].append(f"Order not fully filled after {max_wait_seconds}s")
                        logger.warning(f"⚠️  Order status: {result['order_status']}, Filled: {result['filled_qty']}")
            
            # 4. Verify account balance (if requested)
            if verify_balance and result["filled_qty"] > 0:
                logger.info("💰 Verifying account balance increased...")
                await asyncio.sleep(2)  # Wait a moment for balance to update
                
                account_after = await trading_service.get_account()
                final_cash = float(account_after.get('cash', 0))
                result["account_balance_after"] = final_cash
                
                cash_increase = final_cash - initial_cash
                logger.info(f"Cash balance: ${initial_cash:.2f} → ${final_cash:.2f} (${cash_increase:+.2f})")
                
                if cash_increase <= 0:
                    result["warnings"].append(
                        f"Account balance did not increase after sale. "
                        f"Expected increase, but balance went from ${initial_cash:.2f} to ${final_cash:.2f}"
                    )
                    logger.warning(result["warnings"][-1])
            
            # 5. Verify position updated/removed (if requested)
            if verify_position:
                logger.info("🔄 Syncing positions to verify sale...")
                position_sync_service = PositionSyncService()
                sync_stats = await position_sync_service.sync_user_positions(db, user, use_paper=use_paper)
                
                # Check if position was removed or updated
                position_after = db.query(Position).filter(
                    Position.user_id == user.id,
                    Position.ticker == symbol.upper()
                ).first()
                
                if position_after:
                    remaining_shares = float(position_after.shares)
                    if remaining_shares == 0:
                        logger.info(f"✅ Position verified: {symbol} now has 0 shares")
                        result["position_verified"] = True
                    elif remaining_shares < position_shares:
                        logger.info(f"✅ Position verified: {symbol} reduced from {position_shares} to {remaining_shares} shares")
                        result["position_verified"] = True
                    else:
                        result["warnings"].append(
                            f"Position not updated as expected. "
                            f"Expected reduction from {position_shares} shares, but still has {remaining_shares} shares"
                        )
                        logger.warning(result["warnings"][-1])
                else:
                    logger.info(f"✅ Position verified: {symbol} removed from database")
                    result["position_verified"] = True
            
            # Mark as successful if order filled
            if result["filled_qty"] > 0:
                result["success"] = True
            else:
                result["error"] = "Order did not fill"
            
            return result
            
        except Exception as e:
            result["error"] = f"Unexpected error: {str(e)}"
            logger.error(result["error"], exc_info=True)
            return result
    
    async def _poll_order_status(
        self,
        trading_service: AlpacaTradingService,
        order_id: str,
        max_wait_seconds: int,
        check_interval: int = 2
    ) -> Optional[Dict]:
        """Poll order status until filled, rejected, or timeout"""
        waited = 0
        
        while waited < max_wait_seconds:
            await asyncio.sleep(check_interval)
            waited += check_interval
            
            try:
                order_status = await trading_service.get_order(order_id)
                if order_status:
                    status = order_status.get('status', 'unknown')
                    filled_qty = float(order_status.get('filled_qty', 0))
                    
                    logger.info(f"  Order status: {status}, Filled: {filled_qty} shares")
                    
                    if status == 'filled':
                        return order_status
                    elif status in ['canceled', 'expired', 'rejected']:
                        logger.warning(f"⚠️  Order {status}")
                        return order_status
            except Exception as e:
                logger.warning(f"Error checking order status: {e}")
        
        logger.warning(f"Order status check timed out after {max_wait_seconds}s")
        return None
    
    def _get_trading_service(self, user: User, use_paper: bool) -> AlpacaTradingService:
        """Get trading service with appropriate credentials"""
        if user.alpaca_access_token:
            return AlpacaTradingService(
                access_token=user.alpaca_access_token,
                use_paper=use_paper
            )
        elif settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY:
            return AlpacaTradingService(
                api_key=settings.ALPACA_API_KEY,
                secret_key=settings.ALPACA_SECRET_KEY,
                use_paper=use_paper
            )
        else:
            raise ValueError("No Alpaca credentials available")

