"""
Alpaca Trading API Service
Makes API calls to Alpaca Trading API using OAuth tokens or API keys
Reference: https://docs.alpaca.markets/docs/using-oauth2-and-trading-api
"""
import httpx
from typing import Optional, Dict, List
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)


class AlpacaTradingService:
    """Service for trading operations using Alpaca Trading API with OAuth tokens or API keys"""
    
    # Trading API base URLs
    BASE_URL_PAPER = "https://paper-api.alpaca.markets"
    BASE_URL_LIVE = "https://api.alpaca.markets"
    
    def __init__(
        self, 
        access_token: Optional[str] = None, 
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        use_paper: bool = True
    ):
        """
        Initialize trading service with OAuth token OR API keys
        
        Args:
            access_token: OAuth access token from Alpaca (optional)
            api_key: API key ID (optional, alternative to OAuth)
            secret_key: API secret key (optional, alternative to OAuth)
            use_paper: Use paper trading API (default True)
        """
        self.access_token = access_token
        self.api_key = api_key
        self.secret_key = secret_key
        self.base_url = self.BASE_URL_PAPER if use_paper else self.BASE_URL_LIVE
        
        # Validate that we have either OAuth token or API keys
        if not access_token and (not api_key or not secret_key):
            raise ValueError("Must provide either access_token or (api_key, secret_key)")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authentication headers using OAuth token or API keys"""
        if self.access_token:
            # OAuth authentication
            return {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json"
            }
        else:
            # API key authentication (same pattern as price_service.py)
            return {
                "APCA-API-KEY-ID": self.api_key,
                "APCA-API-SECRET-KEY": self.secret_key,
                "Content-Type": "application/json"
            }
    
    async def get_account(self) -> Dict:
        """
        Get account information including cash balance
        
        Returns:
            Account information dict
        """
        url = f"{self.base_url}/v2/account"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()
            return response.json()
    
    async def get_positions(self, symbol: Optional[str] = None) -> List[Dict]:
        """
        Get positions (optionally filtered by symbol)
        
        Args:
            symbol: Optional symbol to filter positions
        
        Returns:
            List of position dicts
        """
        url = f"{self.base_url}/v2/positions"
        params = {}
        if symbol:
            params["symbols"] = symbol.upper()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers(), params=params)
            response.raise_for_status()
            return response.json()
    
    async def get_position(self, symbol: str) -> Optional[Dict]:
        """
        Get specific position for a symbol
        
        Args:
            symbol: Stock symbol (e.g., "STRC")
        
        Returns:
            Position dict or None if not found
        """
        positions = await self.get_positions(symbol)
        return positions[0] if positions else None
    
    async def place_market_buy_order(self, symbol: str, notional: float = None, qty: float = None) -> Dict:
        """
        Place a market buy order using notional amount (fractional shares) or quantity (whole shares)
        
        Args:
            symbol: Stock symbol (e.g., "STRC")
            notional: Dollar amount to invest (e.g., 100.00) - for fractionable assets
            qty: Number of shares to buy (e.g., 10.0) - for non-fractionable assets
        
        Returns:
            Order response from Alpaca
        """
        if not notional and not qty:
            raise ValueError("Must provide either notional or qty")
        if notional and qty:
            raise ValueError("Cannot provide both notional and qty")
        
        url = f"{self.base_url}/v2/orders"
        
        order_data = {
            "symbol": symbol.upper(),
            "side": "buy",
            "type": "market",
            "time_in_force": "day"
        }
        
        if notional:
            order_data["notional"] = str(notional)  # Use notional for fractional shares
        else:
            order_data["qty"] = str(qty)  # Use qty for whole shares
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=self._get_headers(),
                json=order_data
            )
            response.raise_for_status()
            return response.json()
    
    async def place_market_sell_order(self, symbol: str, qty: float) -> Dict:
        """
        Place a market sell order
        
        Args:
            symbol: Stock symbol (e.g., "AAPL")
            qty: Number of shares to sell
        
        Returns:
            Order response from Alpaca
        """
        url = f"{self.base_url}/v2/orders"
        
        order_data = {
            "symbol": symbol.upper(),
            "side": "sell",
            "type": "market",
            "time_in_force": "day",
            "qty": str(qty)
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers=self._get_headers(),
                json=order_data
            )
            response.raise_for_status()
            return response.json()
    
    async def get_order(self, order_id: str) -> Optional[Dict]:
        """
        Get order status by order ID
        
        Args:
            order_id: Order ID from Alpaca
        
        Returns:
            Order dict or None if not found
        """
        url = f"{self.base_url}/v2/orders/{order_id}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers())
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
    
    async def get_latest_trade(self, symbol: str) -> Optional[Dict]:
        """
        Get latest trade price for a symbol
        
        Args:
            symbol: Stock symbol (e.g., "SATA")
        
        Returns:
            Latest trade dict with price, or None if not found
        """
        url = f"{self.base_url}/v2/stocks/{symbol.upper()}/trades/latest"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers())
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

