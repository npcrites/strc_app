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
    
    # Allowed tickers for trading
    ALLOWED_TICKERS: List[str] = ["STRC", "SATA"]
    
    # CORS (comma-separated string, will be split)
    # Includes Expo default ports: 19000 (Metro), 19006 (Expo Go), 8081 (Metro alternative)
    # Also includes common Expo Go URLs for physical devices
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:19006,http://localhost:19000,http://localhost:8081,exp://localhost:8081,exp://192.168.1.107:8081"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS_ORIGINS string to list"""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
    
    # App
    DEBUG: bool = True
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"  # Ignore extra fields in .env (like old Plaid settings)
    }


settings = Settings()


