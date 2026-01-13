#!/usr/bin/env python3
"""
Script to update portfolio positions with the 5 assets: STRC, STRD, STRK, STRF, SATA
Usage: python -m scripts.update_portfolio_positions
"""
import sys
import os
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal
from app.models.user import User
from app.models.position import Position
from app.services.alpaca_trading_service import AlpacaTradingService
from app.services.position_sync_service import condense_company_name
from typing import Optional
import logging
import asyncio

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Asset definitions (name will be fetched from Alpaca if available)
ASSETS = [
    {
        "ticker": "STRC",
        "shares": Decimal("30.000000"),
        "cost_basis": Decimal("3000.00"),
        "market_value": Decimal("3150.00"),
        "asset_type": "preferred_stock"
    },
    {
        "ticker": "STRD",
        "shares": Decimal("25.000000"),
        "cost_basis": Decimal("2500.00"),
        "market_value": Decimal("2625.00"),
        "asset_type": "preferred_stock"
    },
    {
        "ticker": "STRK",
        "shares": Decimal("20.000000"),
        "cost_basis": Decimal("2000.00"),
        "market_value": Decimal("2100.00"),
        "asset_type": "preferred_stock"
    },
    {
        "ticker": "STRF",
        "shares": Decimal("15.000000"),
        "cost_basis": Decimal("1500.00"),
        "market_value": Decimal("1575.00"),
        "asset_type": "preferred_stock"
    },
    {
        "ticker": "SATA",
        "shares": Decimal("15.000000"),
        "cost_basis": Decimal("1500.00"),
        "market_value": Decimal("1575.00"),
        "asset_type": "preferred_stock"
    },
]


async def fetch_asset_name_from_alpaca(ticker: str, user: User) -> Optional[str]:
    """
    Fetch asset name from Alpaca API if credentials are available.
    
    Args:
        ticker: Stock ticker symbol
        user: User object (may have Alpaca credentials)
    
    Returns:
        Asset name from Alpaca, or None if not available
    """
    try:
        # Try to use user's OAuth token first
        if user.alpaca_access_token:
            alpaca_service = AlpacaTradingService(
                access_token=user.alpaca_access_token,
                use_paper=True
            )
        else:
            # Fallback to API keys from settings
            from app.core.config import settings
            if not settings.ALPACA_API_KEY or not settings.ALPACA_SECRET_KEY:
                return None
            alpaca_service = AlpacaTradingService(
                api_key=settings.ALPACA_API_KEY,
                secret_key=settings.ALPACA_SECRET_KEY,
                use_paper=True
            )
        
        asset_info = await alpaca_service.get_asset(ticker)
        if asset_info and asset_info.get("name"):
            full_name = asset_info.get("name")
            # Condense the name using the same logic as position sync
            condensed_name = condense_company_name(full_name)
            return condensed_name
    except Exception as e:
        logger.debug(f"Could not fetch asset name from Alpaca for {ticker}: {e}")
    
    return None


def update_portfolio_positions(user_email: str = "demo@example.com"):
    """
    Update portfolio positions for a user with the 5 assets.
    Names will be fetched from Alpaca if available, otherwise preserved from existing positions.
    
    Args:
        user_email: Email of the user to update (default: demo@example.com)
    """
    db = SessionLocal()
    
    try:
        # Find the user
        user = db.query(User).filter(User.email == user_email).first()
        
        if not user:
            logger.error(f"User with email {user_email} not found")
            logger.info("Creating demo user...")
            user = User(
                email=user_email,
                full_name="Demo User",
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info(f"✅ Created user: {user.email} (ID: {user.id})")
        else:
            logger.info(f"Found user: {user.email} (ID: {user.id})")
        
        # Update or create positions for each asset
        # Note: account_id is nullable, so we don't need to create accounts
        positions_updated = []
        positions_created = []
        
        # Fetch asset names from Alpaca (if available) - do this first
        async def fetch_all_names():
            name_map = {}
            for asset in ASSETS:
                ticker = asset["ticker"]
                asset_name = await fetch_asset_name_from_alpaca(ticker, user)
                if asset_name:
                    name_map[ticker] = asset_name
                    logger.info(f"Fetched name for {ticker} from Alpaca: {asset_name}")
            return name_map
        
        # Fetch all names from Alpaca
        asset_names = asyncio.run(fetch_all_names())
        
        # Now update/create positions with the fetched names
        for asset in ASSETS:
            ticker = asset["ticker"]
            asset_name = asset_names.get(ticker)  # Get name from Alpaca if available
            
            # Check if position already exists
            existing_position = db.query(Position).filter(
                Position.user_id == user.id,
                Position.ticker == ticker
            ).first()
            
            if existing_position:
                # Update existing position
                # Only update name if we got one from Alpaca, otherwise preserve existing
                if asset_name:
                    existing_position.name = asset_name
                    logger.info(f"Updated name for {ticker} from Alpaca: {asset_name}")
                # If no name from Alpaca, keep existing name (don't overwrite)
                
                existing_position.shares = asset["shares"]
                existing_position.cost_basis = asset["cost_basis"]
                existing_position.market_value = asset["market_value"]
                existing_position.asset_type = asset["asset_type"]
                existing_position.snapshot_timestamp = datetime.now(timezone.utc)
                existing_position.updated_at = datetime.now(timezone.utc)
                positions_updated.append(ticker)
                logger.info(f"✅ Updated position: {ticker} - {asset['shares']} shares")
            else:
                # Create new position
                # Use Alpaca name if available, otherwise use ticker as fallback
                position_name = asset_name if asset_name else ticker
                
                new_position = Position(
                    user_id=user.id,
                    ticker=ticker,
                    name=position_name,
                    shares=asset["shares"],
                    cost_basis=asset["cost_basis"],
                    market_value=asset["market_value"],
                    asset_type=asset["asset_type"],
                    snapshot_timestamp=datetime.now(timezone.utc)
                )
                db.add(new_position)
                positions_created.append(ticker)
                logger.info(f"✅ Created position: {ticker} - {asset['shares']} shares (name: {position_name})")
        
        db.commit()
        
        # Remove any positions that are not in our asset list
        all_tickers = {asset["ticker"] for asset in ASSETS}
        positions_to_remove = db.query(Position).filter(
            Position.user_id == user.id,
            ~Position.ticker.in_(all_tickers)
        ).all()
        
        if positions_to_remove:
            for pos in positions_to_remove:
                logger.info(f"⚠️  Removing position: {pos.ticker} (not in asset list)")
                db.delete(pos)
            db.commit()
        
        # Print summary
        logger.info("\n" + "="*60)
        logger.info("✅ PORTFOLIO POSITIONS UPDATED!")
        logger.info("="*60)
        logger.info(f"User: {user.email} (ID: {user.id})")
        logger.info(f"Positions created: {len(positions_created)}")
        logger.info(f"Positions updated: {len(positions_updated)}")
        if positions_created:
            logger.info(f"  Created: {', '.join(positions_created)}")
        if positions_updated:
            logger.info(f"  Updated: {', '.join(positions_updated)}")
        logger.info(f"Total positions: {len(ASSETS)}")
        logger.info("="*60)
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating portfolio positions: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Update portfolio positions with 5 assets")
    parser.add_argument(
        "--email",
        type=str,
        default="demo@example.com",
        help="Email of the user to update (default: demo@example.com)"
    )
    args = parser.parse_args()
    
    update_portfolio_positions(user_email=args.email)

