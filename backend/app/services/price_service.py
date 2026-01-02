"""
Price Service for fetching and caching live market prices from Alpaca
"""
import httpx
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.models.asset_price import AssetPrice
from app.models.position import Position
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class PriceService:
    """Service for managing live market prices from Alpaca API"""
    
    def __init__(self):
        self.api_key = settings.ALPACA_API_KEY
        self.secret_key = settings.ALPACA_SECRET_KEY
        # Use data API for market data (different from trading API)
        self.base_url = "https://data.alpaca.markets"
        
        if not self.api_key or not self.secret_key:
            logger.warning("Alpaca API credentials not configured")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authentication headers for Alpaca API"""
        return {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.secret_key,
        }
    
    def get_all_active_symbols(self, db: Session) -> List[str]:
        """
        Get all unique symbols from positions with quantity > 0
        
        Args:
            db: Database session
            
        Returns:
            List of unique uppercase symbols
        """
        try:
            # Query distinct tickers from positions with shares > 0
            positions = db.query(Position.ticker).filter(
                Position.shares > 0
            ).distinct().all()
            
            # Extract and normalize symbols (uppercase, deduplicate)
            symbols = list(set([pos.ticker.upper().strip() for pos in positions if pos.ticker]))
            
            logger.debug(f"Found {len(symbols)} active symbols: {symbols}")
            return symbols
            
        except Exception as e:
            logger.error(f"Error getting active symbols: {str(e)}", exc_info=True)
            return []
    
    def fetch_prices_from_alpaca(self, symbols: List[str]) -> Dict[str, Optional[float]]:
        """
        Fetch latest prices from Alpaca API for given symbols
        
        Args:
            symbols: List of stock symbols to fetch
            
        Returns:
            Dictionary mapping symbol to price (or None if unavailable)
        """
        if not symbols:
            return {}
        
        if not self.api_key or not self.secret_key:
            logger.warning("Alpaca credentials not configured, skipping price fetch")
            return {}
        
        prices = {}
        
        try:
            # Use Alpaca Data API /v2/stocks/snapshots endpoint
            # Format: GET /v2/stocks/snapshots?symbols=AAPL,MSFT,GOOGL
            # Response: {"AAPL": {"latestTrade": {"p": 150.25, ...}, ...}, "MSFT": {...}}
            
            # Batch symbols (Alpaca supports up to 100 symbols per request)
            batch_size = 100
            for i in range(0, len(symbols), batch_size):
                batch = symbols[i:i + batch_size]
                symbols_str = ",".join(batch)
                
                url = f"{self.base_url}/v2/stocks/snapshots"
                params = {"symbols": symbols_str}
                
                with httpx.Client(timeout=10.0) as client:
                    response = client.get(
                        url,
                        headers=self._get_headers(),
                        params=params
                    )
                    
                    # Handle 404 for invalid symbols gracefully
                    if response.status_code == 404:
                        logger.warning(f"Symbols not found in Alpaca: {symbols_str}")
                        for symbol in batch:
                            prices[symbol.upper()] = None
                        continue
                    
                    response.raise_for_status()
                    data = response.json()
                    
                    # Parse response: {"AAPL": {"latestTrade": {"p": 150.25, ...}, ...}}
                    # Response is a dict with symbols as keys
                    for symbol, snapshot_data in data.items():
                        if snapshot_data and isinstance(snapshot_data, dict):
                            # Get price from latestTrade
                            if "latestTrade" in snapshot_data:
                                trade = snapshot_data["latestTrade"]
                                if trade and "p" in trade:
                                    prices[symbol.upper()] = float(trade["p"])
                                else:
                                    prices[symbol.upper()] = None
                            else:
                                # Fallback: try dailyBar close price
                                if "dailyBar" in snapshot_data:
                                    bar = snapshot_data["dailyBar"]
                                    if bar and "c" in bar:
                                        prices[symbol.upper()] = float(bar["c"])
                                    else:
                                        prices[symbol.upper()] = None
                                else:
                                    prices[symbol.upper()] = None
                        else:
                            prices[symbol.upper()] = None
                    
                    # Mark symbols that weren't in response as None
                    for symbol in batch:
                        if symbol.upper() not in prices:
                            prices[symbol.upper()] = None
                
                # Small delay to respect rate limits
                if i + batch_size < len(symbols):
                    import time
                    time.sleep(0.1)
            
            logger.info(f"Fetched prices for {len([p for p in prices.values() if p is not None])}/{len(symbols)} symbols")
            return prices
            
        except httpx.HTTPStatusError as e:
            logger.error(f"Alpaca API HTTP error: {e.response.status_code} - {e.response.text}")
            return {}
        except httpx.RequestError as e:
            logger.error(f"Alpaca API request error: {str(e)}")
            return {}
        except Exception as e:
            logger.error(f"Error fetching prices from Alpaca: {str(e)}", exc_info=True)
            return {}
    
    def update_price_cache(self, db: Session, prices: Dict[str, Optional[float]]) -> int:
        """
        Update price cache in database (upsert pattern)
        
        Args:
            db: Database session
            prices: Dictionary mapping symbol to price
            
        Returns:
            Number of prices updated
        """
        updated_count = 0
        
        try:
            now = datetime.utcnow()
            
            for symbol, price in prices.items():
                if price is None:
                    continue
                
                # Upsert: update if exists, insert if new
                existing = db.query(AssetPrice).filter(AssetPrice.symbol == symbol).first()
                
                if existing:
                    existing.price = price
                    existing.updated_at = now
                else:
                    new_price = AssetPrice(
                        symbol=symbol,
                        price=price,
                        updated_at=now
                    )
                    db.add(new_price)
                
                updated_count += 1
            
            db.commit()
            logger.info(f"Updated {updated_count} prices in cache")
            return updated_count
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating price cache: {str(e)}", exc_info=True)
            return 0
    
    def get_price(self, db: Session, symbol: str) -> Optional[float]:
        """
        Get cached price for a symbol
        
        Args:
            db: Database session
            symbol: Stock symbol (case-insensitive)
            
        Returns:
            Price or None if not found
        """
        try:
            price_obj = db.query(AssetPrice).filter(
                func.upper(AssetPrice.symbol) == symbol.upper()
            ).first()
            
            if price_obj:
                return float(price_obj.price)
            return None
            
        except Exception as e:
            logger.error(f"Error getting price for {symbol}: {str(e)}")
            return None
    
    def get_prices(self, db: Session, symbols: List[str]) -> Dict[str, Optional[float]]:
        """
        Get cached prices for multiple symbols
        
        Args:
            db: Database session
            symbols: List of stock symbols
            
        Returns:
            Dictionary mapping symbol to price (or None if not found)
        """
        prices = {}
        
        try:
            # Query all at once for efficiency
            symbol_upper = [s.upper() for s in symbols]
            price_objs = db.query(AssetPrice).filter(
                func.upper(AssetPrice.symbol).in_(symbol_upper)
            ).all()
            
            # Create lookup dict
            price_dict = {p.symbol.upper(): float(p.price) for p in price_objs}
            
            # Return prices for requested symbols (None if not found)
            for symbol in symbols:
                prices[symbol.upper()] = price_dict.get(symbol.upper())
            
            return prices
            
        except Exception as e:
            logger.error(f"Error getting prices: {str(e)}", exc_info=True)
            return {s: None for s in symbols}
    
    def is_price_fresh(self, db: Session, symbol: str, max_age_seconds: int = 300) -> bool:
        """
        Check if cached price is fresh (not stale)
        
        Args:
            db: Database session
            symbol: Stock symbol
            max_age_seconds: Maximum age in seconds before considered stale
            
        Returns:
            True if price exists and is fresh, False otherwise
        """
        try:
            price_obj = db.query(AssetPrice).filter(
                func.upper(AssetPrice.symbol) == symbol.upper()
            ).first()
            
            if not price_obj:
                return False
            
            age = (datetime.utcnow() - price_obj.updated_at).total_seconds()
            return age < max_age_seconds
            
        except Exception as e:
            logger.error(f"Error checking price freshness: {str(e)}")
            return False
    
    def update_all_prices(self, db: Session) -> Dict[str, int]:
        """
        Full workflow: get active symbols, fetch prices, update cache
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with update statistics
        """
        try:
            # Get all active symbols
            symbols = self.get_all_active_symbols(db)
            
            if not symbols:
                logger.info("No active symbols to update")
                return {"symbols_checked": 0, "prices_fetched": 0, "prices_updated": 0}
            
            # Fetch prices from Alpaca
            prices = self.fetch_prices_from_alpaca(symbols)
            
            # Update cache
            updated_count = self.update_price_cache(db, prices)
            
            return {
                "symbols_checked": len(symbols),
                "prices_fetched": len([p for p in prices.values() if p is not None]),
                "prices_updated": updated_count
            }
            
        except Exception as e:
            logger.error(f"Error in update_all_prices: {str(e)}", exc_info=True)
            return {"symbols_checked": 0, "prices_fetched": 0, "prices_updated": 0}

