"""
Position Sync Service
Syncs positions from Alpaca API to the database
"""
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
from decimal import Decimal
from app.models.position import Position
from app.models.user import User
from app.services.alpaca_trading_service import AlpacaTradingService
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


def condense_company_name(full_name: str) -> str:
    """
    Condense a company name by removing common suffixes and truncating if needed.
    Handles multiple suffixes and preferred stock naming.
    
    Examples:
        "Apple Inc." -> "Apple"
        "Microsoft Corporation" -> "Microsoft"
        "Strategy Inc Variable Rate Series A Perpetual Stretch Preferred Stock" -> "Strategy"
        "Strategy Inc 10.00% Series A Perpetual Stride Preferred Stock" -> "Strategy"
        "Strive, Inc. Variable Rate Series A Perpetual Preferred Stock" -> "Strive"
    
    Args:
        full_name: Full company name from Alpaca
    
    Returns:
        Condensed company name (max 30 chars, truncated at word boundary)
    """
    if not full_name:
        return full_name
    
    condensed = full_name.strip()
    
    # Remove common legal suffixes (in order of specificity - most specific first)
    suffixes = [
        " Variable Rate Series A Perpetual Stretch Preferred Stock",
        " Variable Rate Series A Perpetual Preferred Stock",
        " 10.00% Series A Perpetual Stride Preferred Stock",
        " 8.00% Series A Perpetual Strike Preferred Stock",
        " 10.00% Series A Perpetual Strife Preferred Stock",
        " Series A Perpetual Preferred Stock",
        " Perpetual Preferred Stock",
        " Preferred Stock",
        " Common Stock",
        " Class A Common Stock",
        " Class B Common Stock",
        " Class C Common Stock",
        " Class A",
        " Class B",
        " Class C",
        " Series A",
        " Series B",
        " Series C",
        " Inc.",
        " Inc",
        " Incorporated",
        " Corporation",
        " Corp.",
        " Corp",
        " LLC",
        " L.L.C.",
        " Ltd.",
        " Limited",
        " Company",
        " Co.",
        " Co",
        " Group",
        " Holdings",
    ]
    
    # Remove all suffixes (not just one) - keep removing until no more match
    changed = True
    while changed:
        changed = False
        for suffix in suffixes:
            # Case-insensitive removal
            if condensed.lower().endswith(suffix.lower()):
                condensed = condensed[:-len(suffix)].strip()
                changed = True
                break
    
    # Remove leading "The " if present
    if condensed.startswith("The "):
        condensed = condensed[4:].strip()
    
    # Remove trailing comma if present (e.g., "Strive, Inc." -> "Strive")
    if condensed.endswith(","):
        condensed = condensed[:-1].strip()
    
    # If still too long, truncate at word boundary (max 30 chars)
    if len(condensed) > 30:
        # Try to truncate at a space
        truncated = condensed[:30]
        last_space = truncated.rfind(' ')
        if last_space > 20:  # Only truncate at space if it's not too short
            condensed = truncated[:last_space]
        else:
            condensed = truncated + "..."
    
    return condensed


class PositionSyncService:
    """Service for syncing positions from Alpaca to database"""
    
    async def sync_user_positions(
        self, 
        db: Session, 
        user: User,
        use_paper: bool = True
    ) -> Dict[str, int]:
        """
        Sync positions from Alpaca for a specific user
        
        Args:
            db: Database session
            user: User object with Alpaca credentials
            use_paper: Use paper trading API (default True)
            
        Returns:
            Dictionary with sync statistics
        """
        try:
            # Initialize Alpaca service - prefer OAuth token, fallback to API keys
            alpaca_service = None
            
            if user.alpaca_access_token:
                # Use OAuth token if available
                alpaca_service = AlpacaTradingService(
                    access_token=user.alpaca_access_token,
                    use_paper=use_paper
                )
                logger.info(f"Using OAuth token for user {user.id}")
            elif settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY:
                # Fallback to global API keys
                alpaca_service = AlpacaTradingService(
                    api_key=settings.ALPACA_API_KEY,
                    secret_key=settings.ALPACA_SECRET_KEY,
                    use_paper=use_paper
                )
                logger.info(f"Using API keys for user {user.id}")
            else:
                logger.warning(f"No Alpaca credentials available for user {user.id}")
                return {
                    "user_id": user.id,
                    "positions_fetched": 0,
                    "positions_created": 0,
                    "positions_updated": 0,
                    "positions_removed": 0,
                    "errors": 1
                }
            
            # Fetch positions from Alpaca
            alpaca_positions = await alpaca_service.get_positions()
            
            if not alpaca_positions:
                logger.info(f"No positions found in Alpaca for user {user.id}")
                # Remove all existing positions (user has no positions)
                return await self._remove_all_positions(db, user.id)
            
            # Get existing positions from database
            existing_positions = {
                pos.ticker.upper(): pos 
                for pos in db.query(Position).filter(
                    Position.user_id == user.id
                ).all()
            }
            
            # Track which positions we've seen
            seen_tickers = set()
            
            created_count = 0
            updated_count = 0
            
            # Process each position from Alpaca
            for alpaca_pos in alpaca_positions:
                ticker = alpaca_pos.get("symbol", "").upper()
                if not ticker:
                    continue
                
                seen_tickers.add(ticker)
                
                # Parse Alpaca position data
                qty = float(alpaca_pos.get("qty", 0))
                if qty == 0:
                    # Skip zero-quantity positions
                    continue
                
                cost_basis = float(alpaca_pos.get("cost_basis", 0))
                market_value = float(alpaca_pos.get("market_value", 0))
                asset_class = alpaca_pos.get("asset_class", "us_equity")
                
                # Map asset_class to asset_type
                asset_type_map = {
                    "us_equity": "common_stock",
                    "us_equity_preferred": "preferred_stock",
                    "crypto": "crypto",
                    "etf": "etf",
                    "bond": "bond"
                }
                asset_type = asset_type_map.get(asset_class, "other")
                
                # Try to get asset name from Alpaca asset API
                position_name = None
                try:
                    asset_info = await alpaca_service.get_asset(ticker)
                    if asset_info:
                        # Alpaca asset API returns 'name' field with company name
                        full_name = asset_info.get("name")
                        if full_name:
                            # Condense the name (remove suffixes like "Inc.", "Corporation", etc.)
                            position_name = condense_company_name(full_name)
                            logger.info(f"Fetched asset name for {ticker}: {full_name} -> {position_name}")
                except Exception as e:
                    logger.warning(f"Failed to fetch asset name for {ticker}: {e}")
                
                # Fallback to symbol if we couldn't get the name
                if not position_name:
                    position_name = alpaca_pos.get("symbol", ticker)
                
                # Check if position exists
                if ticker in existing_positions:
                    # Update existing position
                    position = existing_positions[ticker]
                    position.shares = Decimal(str(qty))
                    position.cost_basis = Decimal(str(cost_basis))
                    position.market_value = Decimal(str(market_value)) if market_value else None
                    position.asset_type = asset_type
                    position.name = position_name
                    position.updated_at = datetime.utcnow()
                    position.snapshot_timestamp = datetime.utcnow()  # Track last sync time
                    updated_count += 1
                else:
                    # Create new position
                    position = Position(
                        user_id=user.id,
                        ticker=ticker,
                        name=position_name,
                        shares=Decimal(str(qty)),
                        cost_basis=Decimal(str(cost_basis)),
                        market_value=Decimal(str(market_value)) if market_value else None,
                        asset_type=asset_type,
                        snapshot_timestamp=datetime.utcnow()  # Initial snapshot timestamp
                    )
                    db.add(position)
                    created_count += 1
            
            # Remove positions that no longer exist in Alpaca
            # BUT preserve positions that are in ALLOWED_TICKERS (manually managed positions)
            removed_count = 0
            allowed_tickers_upper = {t.upper() for t in settings.ALLOWED_TICKERS}
            for ticker, position in existing_positions.items():
                if ticker not in seen_tickers:
                    # Don't remove positions that are in ALLOWED_TICKERS (manually managed)
                    if ticker in allowed_tickers_upper:
                        logger.info(f"Preserving manually managed position {ticker} for user {user.id} (not in Alpaca but in ALLOWED_TICKERS)")
                        continue
                    logger.info(f"Removing position {ticker} for user {user.id} (no longer in Alpaca)")
                    db.delete(position)
                    removed_count += 1
            
            db.commit()
            
            logger.info(
                f"Position sync completed for user {user.id}: "
                f"{len(alpaca_positions)} fetched, "
                f"{created_count} created, {updated_count} updated, {removed_count} removed"
            )
            
            return {
                "user_id": user.id,
                "positions_fetched": len(alpaca_positions),
                "positions_created": created_count,
                "positions_updated": updated_count,
                "positions_removed": removed_count,
                "errors": 0
            }
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error syncing positions for user {user.id}: {str(e)}", exc_info=True)
            return {
                "user_id": user.id,
                "positions_fetched": 0,
                "positions_created": 0,
                "positions_updated": 0,
                "positions_removed": 0,
                "errors": 1
            }
    
    async def _remove_all_positions(self, db: Session, user_id: int) -> Dict[str, int]:
        """Remove all positions for a user (when they have none in Alpaca), but preserve ALLOWED_TICKERS"""
        try:
            positions = db.query(Position).filter(Position.user_id == user_id).all()
            allowed_tickers_upper = {t.upper() for t in settings.ALLOWED_TICKERS}
            removed_count = 0
            
            for position in positions:
                # Don't remove positions that are in ALLOWED_TICKERS (manually managed)
                if position.ticker.upper() in allowed_tickers_upper:
                    logger.info(f"Preserving manually managed position {position.ticker} for user {user_id} (in ALLOWED_TICKERS)")
                    continue
                db.delete(position)
                removed_count += 1
            
            db.commit()
            
            logger.info(f"Removed {removed_count} positions for user {user_id} (no positions in Alpaca, but preserved ALLOWED_TICKERS)")
            
            return {
                "user_id": user_id,
                "positions_fetched": 0,
                "positions_created": 0,
                "positions_updated": 0,
                "positions_removed": removed_count,
                "errors": 0
            }
        except Exception as e:
            db.rollback()
            logger.error(f"Error removing positions for user {user_id}: {str(e)}")
            return {
                "user_id": user_id,
                "positions_fetched": 0,
                "positions_created": 0,
                "positions_updated": 0,
                "positions_removed": 0,
                "errors": 1
            }
    
    async def sync_all_users_positions(self, db: Session, use_paper: bool = True) -> Dict[str, int]:
        """
        Sync positions for all active users with Alpaca credentials
        
        Args:
            db: Database session
            use_paper: Use paper trading API (default True)
            
        Returns:
            Dictionary with aggregate statistics
        """
        try:
            # Get all active users with Alpaca credentials
            users = db.query(User).filter(
                User.is_active == True
            ).filter(
                (User.alpaca_access_token.isnot(None)) | 
                (settings.ALPACA_API_KEY != "" and settings.ALPACA_SECRET_KEY != "")
            ).all()
            
            total_stats = {
                "users_processed": 0,
                "users_successful": 0,
                "users_errors": 0,
                "total_positions_fetched": 0,
                "total_positions_created": 0,
                "total_positions_updated": 0,
                "total_positions_removed": 0
            }
            
            for user in users:
                stats = await self.sync_user_positions(db, user, use_paper)
                
                total_stats["users_processed"] += 1
                if stats["errors"] == 0:
                    total_stats["users_successful"] += 1
                else:
                    total_stats["users_errors"] += 1
                
                total_stats["total_positions_fetched"] += stats["positions_fetched"]
                total_stats["total_positions_created"] += stats["positions_created"]
                total_stats["total_positions_updated"] += stats["positions_updated"]
                total_stats["total_positions_removed"] += stats["positions_removed"]
            
            logger.info(
                f"Position sync for all users completed: "
                f"{total_stats['users_successful']}/{total_stats['users_processed']} successful"
            )
            
            return total_stats
            
        except Exception as e:
            logger.error(f"Error in sync_all_users_positions: {str(e)}", exc_info=True)
            return {
                "users_processed": 0,
                "users_successful": 0,
                "users_errors": 0,
                "total_positions_fetched": 0,
                "total_positions_created": 0,
                "total_positions_updated": 0,
                "total_positions_removed": 0
            }

