"""
Users authentication API endpoints - Alpaca OAuth2
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.core.security import get_current_user, create_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.alpaca_oauth_service import AlpacaOAuthService
from app.services.alpaca_trading_service import AlpacaTradingService
from app.core.utils import parse_date
from datetime import timedelta, datetime
from app.core.config import settings
import secrets
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

# In-memory state storage for OAuth (in production, use Redis or similar)
# Maps state -> timestamp for CSRF protection
oauth_states: dict[str, datetime] = {}


@router.get("/auth/alpaca/authorize")
async def alpaca_authorize(
    env: str = Query(None, description="Environment: 'live' or 'paper'"),
    return_url: bool = Query(False, description="Return URL as JSON instead of redirecting")
):
    """
    Generate Alpaca OAuth authorization URL
    
    Step 1: Get authorization URL to start OAuth flow
    User will be redirected to Alpaca to authorize the app
    
    Args:
        env: Environment ('live' or 'paper')
        return_url: If True, return JSON with URL instead of redirecting (for mobile apps)
    """
    if env and env not in ["live", "paper"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="env must be 'live' or 'paper'"
        )
    
    oauth_service = AlpacaOAuthService()
    
    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    oauth_states[state] = datetime.utcnow()
    
    auth_url = oauth_service.get_authorization_url(state, env=env)
    
    # For mobile apps, return URL as JSON so they can open it in in-app browser
    if return_url:
        return {"authorization_url": auth_url, "state": state}
    
    # For web, redirect directly
    return RedirectResponse(url=auth_url)


@router.get("/auth/alpaca/callback")
async def alpaca_callback(
    code: str = Query(..., description="Authorization code from Alpaca"),
    state: str = Query(..., description="State parameter for CSRF protection"),
    db: Session = Depends(get_db)
):
    """
    Handle Alpaca OAuth callback
    
    Step 3: Alpaca redirects here after user authorizes
    Exchanges authorization code for access token and creates/updates user
    """
    # Verify state (CSRF protection)
    if state not in oauth_states:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid state parameter"
        )
    
    # State should be recent (expire after 10 minutes)
    if (datetime.utcnow() - oauth_states[state]).total_seconds() > 600:
        del oauth_states[state]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="State expired"
        )
    
    del oauth_states[state]
    
    try:
        # Exchange code for tokens
        oauth_service = AlpacaOAuthService()
        token_response = await oauth_service.exchange_code_for_tokens(code)
        
        access_token = token_response["access_token"]
        refresh_token = token_response.get("refresh_token")  # May not be provided
        expires_in = token_response.get("expires_in", 3600)
        expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        
        # Get account info from Alpaca to identify user and store account details
        trading_service = AlpacaTradingService(access_token, use_paper=True)
        account = await trading_service.get_account()
        account_id = account["id"]
        account_number = account.get("account_number")
        
        # Check if user exists with this Alpaca account
        user = db.query(User).filter(User.alpaca_account_id == account_id).first()
        
        if not user:
            # Create new user
            user = User(
                alpaca_account_id=account_id,
                alpaca_access_token=access_token,
                alpaca_refresh_token=refresh_token,
                alpaca_token_expires_at=expires_at,
                alpaca_account_number=account_number,
                alpaca_account_status=account.get("status"),
                alpaca_currency=account.get("currency", "USD"),
                alpaca_trading_blocked=account.get("trading_blocked", False),
                alpaca_portfolio_created_at=parse_date(account["created_at"]) if account.get("created_at") else None,
                email=account.get("email"),  # If available from Alpaca
                is_active=True
            )
            db.add(user)
        else:
            # Update existing user's tokens and account info
            user.alpaca_access_token = access_token
            user.alpaca_refresh_token = refresh_token
            user.alpaca_token_expires_at = expires_at
            user.alpaca_account_number = account_number
            user.alpaca_account_status = account.get("status")
            user.alpaca_currency = account.get("currency", "USD")
            user.alpaca_trading_blocked = account.get("trading_blocked", False)
            user.is_active = True
            if account.get("email") and not user.email:
                user.email = account.get("email")
        
        db.commit()
        db.refresh(user)
        
        # Create JWT token for our API
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        jwt_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=access_token_expires
        )
        
        # For React Native, redirect to deep link URL
        # The app should register a URL scheme like 'strctracker://'
        # For now, redirect to a URL that can be handled by the app
        # In production, use your app's URL scheme: strctracker://auth/callback?token=...
        deep_link_url = f"strctracker://auth/callback?token={jwt_token}&token_type=bearer"
        return RedirectResponse(
            url=deep_link_url,
            status_code=status.HTTP_302_FOUND
        )
        
    except httpx.HTTPStatusError as e:
        logger.error(f"Alpaca API error during OAuth callback: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to complete authentication: {e.response.text}"
        )
    except Exception as e:
        logger.error(f"OAuth callback error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete authentication: {str(e)}"
        )


@router.post("/demo/login")
async def demo_login(db: Session = Depends(get_db)):
    """
    Demo login endpoint - bypasses OAuth for development
    Creates/returns JWT token for demo@example.com user
    """
    # Find or create demo user
    demo_user = db.query(User).filter(User.email == "demo@example.com").first()
    
    if not demo_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo user not found. Run: python scripts/seed_demo_user_strc.py"
        )
    
    if not demo_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo user account is inactive"
        )
    
    # Create JWT token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jwt_token = create_access_token(
        data={"sub": str(demo_user.id)},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "user_id": demo_user.id
    }


@router.get("/me")
async def get_current_user_info(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user information"""
    # Get user_id from token
    user_id = int(current_user.get("user_id"))
    
    # Fetch user from database
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "alpaca_account_id": user.alpaca_account_id,
        "alpaca_account_number": user.alpaca_account_number,
        "alpaca_account_status": user.alpaca_account_status,
        "alpaca_currency": user.alpaca_currency,
        "alpaca_trading_blocked": user.alpaca_trading_blocked
    }
