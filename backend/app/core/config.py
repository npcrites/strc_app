"""
Configuration and environment variables
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost/strc_tracker"
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 129600  # 90 days (129,600 minutes) - good for mobile apps
    
    # Alpaca API (for price fetching and trading)
    ALPACA_API_KEY: str = ""
    ALPACA_SECRET_KEY: str = ""
    ALPACA_BASE_URL: str = "https://paper-api.alpaca.markets"
    PRICE_UPDATE_ENABLED: bool = True
    PRICE_UPDATE_INTERVAL_SECONDS: int = 30
    POSITION_SYNC_ENABLED: bool = True
    POSITION_SYNC_INTERVAL_MINUTES: int = 5
    SNAPSHOT_ENABLED: bool = True
    SNAPSHOT_INTERVAL_MINUTES: int = 5
    
    # Alpaca OAuth Configuration
    ALPACA_CLIENT_ID: str = ""
    ALPACA_CLIENT_SECRET: str = ""
    ALPACA_REDIRECT_URI: str = "http://localhost:8000/api/users/auth/alpaca/callback"
    ALPACA_OAUTH_BASE_URL: str = "https://app.alpaca.markets"  # Paper trading OAuth
    # For production: use "https://alpaca.markets"
    
    # Bitcoin Treasuries API (for NAV data)
    BT_API_KEY: str = ""
    
    # Alpha Vantage API (for dividend data)
    ALPHA_VANTAGE_API_KEY: str = ""
    
    # Plaid Configuration
    PLAID_CLIENT_ID: str = "6952cecf168aa50020a8c16a"
    PLAID_SECRET: str = "108b8a7a5be3ab3913904e606b83c9"
    PLAID_ENV: str = "sandbox"  # sandbox, development, or production
    PLAID_PRODUCTS: List[str] = ["auth", "identity"]  # Products to enable
    
    # Dividend sync settings
    DIVIDEND_SYNC_ENABLED: bool = True
    DIVIDEND_SYNC_INTERVAL_HOURS: int = 24  # Daily
    
    # Allowed tickers for trading
    ALLOWED_TICKERS: List[str] = ["STRC", "STRD", "STRK", "STRF", "SATA"]
    
    # Excluded tickers (will be filtered out during position sync)
    EXCLUDED_TICKERS: List[str] = ["AAPL"]
    
    # CORS (comma-separated string, will be split)
    # Includes Expo default ports: 19000 (Metro), 19006 (Expo Go), 8081 (Metro alternative)
    # Also includes common Expo Go URLs for physical devices
    # For development, use "*" to allow all origins (set in .env: CORS_ORIGINS=*)
    # Default to "*" in development to allow connections from any network
    CORS_ORIGINS: str = "*"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list"""
        # Allow all origins if "*" is specified (useful for development)
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    # App
    DEBUG: bool = True
    
    # Share image configuration
    SHARE_IMAGE_BASE_URL: str = "http://localhost:8000"  # Change to your production domain
    SHARE_IMAGE_UPLOAD_DIR: str = "uploads/share_images"
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"  # Ignore extra fields in .env (like old Plaid settings)
    }


settings = Settings()


