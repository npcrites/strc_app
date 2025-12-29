"""
Users and Plaid authentication API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.core.security import get_current_user, create_access_token, get_password_hash, verify_password
from app.services.plaid_service import PlaidService
from datetime import timedelta, date
from typing import Optional
from app.core.config import settings

router = APIRouter(prefix="/users", tags=["users"])
plaid_service = PlaidService()


@router.post("/register")
async def register_user(user_data: dict):
    """Register a new user"""
    # TODO: Implement user registration with password hashing
    return {
        "message": "User registered successfully",
        "user_id": 1
    }


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login and get access token"""
    # TODO: Implement user authentication
    # For now, return a mock token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": "user@example.com"},
        expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


@router.get("/me")
async def get_current_user_info(user: dict = Depends(get_current_user)):
    """Get current user information"""
    return {
        "user_id": user.get("user_id"),
        "email": "user@example.com"  # TODO: Fetch from database
    }


@router.post("/plaid/link")
async def create_plaid_link_token(user: dict = Depends(get_current_user)):
    """Create a Plaid Link token for connecting bank accounts"""
    try:
        user_id = user.get("user_id")
        result = plaid_service.create_link_token(str(user_id))
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Plaid link token: {str(e)}"
        )


@router.post("/plaid/exchange")
async def exchange_plaid_public_token(
    public_token: str,
    user: dict = Depends(get_current_user)
):
    """Exchange Plaid public token for access token"""
    try:
        result = plaid_service.exchange_public_token(public_token)
        # TODO: Store access_token and item_id in database for this user
        return {
            "message": "Plaid account linked successfully",
            **result
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange public token: {str(e)}"
        )


@router.get("/plaid/accounts")
async def get_plaid_accounts(
    access_token: str,
    user: dict = Depends(get_current_user)
):
    """Get linked Plaid accounts"""
    try:
        accounts = plaid_service.get_accounts(access_token)
        return {
            "accounts": accounts
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to get accounts: {str(e)}"
        )


@router.get("/plaid/transactions")
async def get_plaid_transactions(
    access_token: str,
    start_date: date,
    end_date: date,
    user: dict = Depends(get_current_user)
):
    """Get transactions from Plaid"""
    try:
        transactions = plaid_service.get_transactions(access_token, start_date, end_date)
        return {
            "transactions": transactions,
            "count": len(transactions)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to get transactions: {str(e)}"
        )


@router.get("/plaid/investment-transactions")
async def get_plaid_investment_transactions(
    access_token: str,
    start_date: date,
    end_date: date,
    user: dict = Depends(get_current_user)
):
    """Get investment/trading transactions from Plaid"""
    try:
        transactions = plaid_service.get_investment_transactions(
            access_token, start_date, end_date
        )
        return {
            "investment_transactions": transactions,
            "count": len(transactions)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to get investment transactions: {str(e)}"
        )


@router.get("/plaid/investment-holdings")
async def get_plaid_investment_holdings(
    access_token: str,
    user: dict = Depends(get_current_user)
):
    """Get current investment holdings (positions) from Plaid"""
    try:
        holdings_data = plaid_service.get_investment_holdings(access_token)
        return holdings_data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to get investment holdings: {str(e)}"
        )


@router.post("/plaid/sync-transactions")
async def sync_plaid_transactions(
    access_token: str,
    cursor: Optional[str] = None,
    user: dict = Depends(get_current_user)
):
    """Sync transactions using Plaid Sync API"""
    try:
        result = plaid_service.sync_transactions(access_token, cursor)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to sync transactions: {str(e)}"
        )


