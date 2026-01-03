"""
Alpaca OAuth2 Service
Handles OAuth2 authentication flow with Alpaca
Reference: https://docs.alpaca.markets/docs/using-oauth2-and-trading-api
"""
import httpx
from typing import Dict, Optional
from urllib.parse import urlencode
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


class AlpacaOAuthService:
    """Service for handling Alpaca OAuth2 authentication"""
    
    def __init__(self):
        self.client_id = settings.ALPACA_CLIENT_ID
        self.client_secret = settings.ALPACA_CLIENT_SECRET
        self.redirect_uri = settings.ALPACA_REDIRECT_URI
        self.base_url = settings.ALPACA_OAUTH_BASE_URL
        # Token endpoint is on API base URL, not OAuth base URL
        self.token_url = "https://api.alpaca.markets/oauth/token"
    
    def get_authorization_url(self, state: str, env: Optional[str] = None) -> str:
        """
        Generate Alpaca OAuth authorization URL
        
        Args:
            state: CSRF protection token
            env: Optional - 'live' or 'paper'. If not specified, user will be prompted for both
        
        Returns:
            Authorization URL
        """
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "trading account:write",  # Required scopes
            "state": state
        }
        
        if env:
            params["env"] = env
        
        query_string = urlencode(params)
        return f"{self.base_url}/oauth/authorize?{query_string}"
    
    async def exchange_code_for_tokens(self, code: str) -> Dict:
        """
        Exchange authorization code for access/refresh tokens
        
        Args:
            code: Authorization code from OAuth callback
        
        Returns:
            Token response with access_token, token_type, scope
        """
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            return response.json()
    
    async def refresh_access_token(self, refresh_token: str) -> Dict:
        """
        Refresh access token using refresh token
        
        Args:
            refresh_token: Refresh token from previous OAuth flow
        
        Returns:
            New token response
        """
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.token_url,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            response.raise_for_status()
            return response.json()

