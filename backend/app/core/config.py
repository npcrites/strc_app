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
    
    # Plaid
    PLAID_CLIENT_ID: str = ""
    PLAID_SECRET: str = ""
    PLAID_ENV: str = "sandbox"  # sandbox, development, production
    
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
        "case_sensitive": True
    }


settings = Settings()


