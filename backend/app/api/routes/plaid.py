"""
Plaid API endpoints for bank account linking
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.bank_account import BankAccount
from app.services.plaid_service import PlaidService
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plaid", tags=["plaid"])


# Request/Response models
class LinkTokenResponse(BaseModel):
    link_token: str
    expiration: Optional[str] = None


class ExchangeTokenRequest(BaseModel):
    public_token: str


class ExchangeTokenResponse(BaseModel):
    success: bool
    accounts: List[dict]
    message: Optional[str] = None


class BankAccountResponse(BaseModel):
    id: int
    account_name: Optional[str]
    account_type: Optional[str]
    account_subtype: Optional[str]
    institution_name: Optional[str]
    mask: Optional[str]
    official_name: Optional[str]
    balance_available: Optional[str]
    balance_current: Optional[str]
    balance_limit: Optional[str]
    balance_iso_currency_code: Optional[str]
    is_primary: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


@router.post("/link-token", response_model=LinkTokenResponse)
async def create_link_token(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a Plaid Link token for the current user
    
    This token is used to initialize Plaid Link in the mobile app
    """
    try:
        user_id = int(current_user["user_id"])
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        plaid_service = PlaidService()
        result = plaid_service.create_link_token(user_id)
        
        logger.info(f"Created Plaid Link token for user {user_id}")
        
        return LinkTokenResponse(
            link_token=result["link_token"],
            expiration=result.get("expiration")
        )
    except Exception as e:
        logger.error(f"Error creating Link token: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Link token: {str(e)}"
        )


@router.get("/link-page")
async def get_link_page(
    link_token: str,
    is_dark: str = Query("false", description="Dark mode preference"),
    # Note: We verify the link_token was created for a valid user, but don't require auth header
    # since this is opened in a browser/webview
):
    """
    Serve an HTML page with Plaid Link embedded
    
    This page will be opened in a webview in the mobile app
    """
    # Determine background color based on dark mode
    is_dark_mode = is_dark.lower() == "true"
    background_color = "#141210" if is_dark_mode else "#FAFAFA"
    text_color = "#F2EDE8" if is_dark_mode else "#000000"
    loading_text_color = "#8B7D6B" if is_dark_mode else "#666666"
    
    # Add color-scheme meta tag for dark mode hint
    color_scheme_meta = '<meta name="color-scheme" content="dark">' if is_dark_mode else '<meta name="color-scheme" content="light">'
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        {color_scheme_meta}
        <title>Link Bank Account</title>
        <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
        <style>
            * {{
                color-scheme: {'dark' if is_dark_mode else 'light'};
            }}
            html {{
                color-scheme: {'dark' if is_dark_mode else 'light'};
            }}
            body {{
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: {background_color};
                color: {text_color};
            }}
            #plaid-link-container {{
                width: 100%;
                height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background: {background_color};
            }}
            .loading {{
                text-align: center;
                color: {loading_text_color};
            }}
            /* Style Plaid's iframe container */
            iframe {{
                border: none !important;
                background: {background_color} !important;
            }}
            /* Try to style any Plaid containers */
            [id*="plaid"],
            [class*="plaid"],
            [id*="Plaid"],
            [class*="Plaid"] {{
                background: {background_color} !important;
            }}
            /* Hide Plaid's built-in close button */
            .plaid-link-button-close,
            [data-testid="close-button"],
            button[aria-label*="close" i],
            button[aria-label*="Close" i],
            .plaid-link-close-button {{
                display: none !important;
                visibility: hidden !important;
            }}
            /* Hide Plaid's loading spinner/indicator */
            [class*="loading"],
            [class*="Loading"],
            [class*="spinner"],
            [class*="Spinner"],
            .plaid-loading,
            #plaid-loading {{
                display: none !important;
                visibility: hidden !important;
            }}
        </style>
    </head>
    <body style="background: {background_color};">
        <div id="plaid-link-container" style="background: {background_color};">
        </div>
        <script>
            (function() {{
                const linkToken = '{link_token}';
                const isDarkMode = {str(is_dark_mode).lower()};
                
                // Set document background immediately
                document.documentElement.style.backgroundColor = '{background_color}';
                document.body.style.backgroundColor = '{background_color}';
                
                // Initialize Plaid Link
                const handler = Plaid.create({{
                    token: linkToken,
                    onSuccess: function(public_token, metadata) {{
                        console.log('Plaid Link success:', public_token);
                        // Redirect back to app with public_token
                        window.location.href = 'strctracker://plaid/callback?public_token=' + public_token;
                    }},
                    onExit: function(err, metadata) {{
                        console.log('Plaid Link exit:', err, metadata);
                        if (err) {{
                            // Redirect with error
                            window.location.href = 'strctracker://plaid/callback?error=' + encodeURIComponent(err.display_message || err.error_message || 'Cancelled');
                        }} else {{
                            // User closed without error
                            window.location.href = 'strctracker://plaid/callback?cancelled=true';
                        }}
                    }},
                    onEvent: function(eventName, metadata) {{
                        console.log('Plaid event:', eventName, metadata);
                    }}
                }});
                
                // Open Plaid Link automatically
                handler.open();
                
                // Continuously monitor and try to inject styles into Plaid's iframe
                function tryInjectStyles() {{
                    const iframes = document.querySelectorAll('iframe');
                    iframes.forEach(function(iframe) {{
                        try {{
                            // Try to access iframe content (may be blocked by CORS)
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (iframeDoc) {{
                                // Inject dark mode styles into iframe
                                const style = iframeDoc.createElement('style');
                                style.textContent = `
                                    * {{
                                        color-scheme: {'dark' if is_dark_mode else 'light'} !important;
                                    }}
                                    html, body {{
                                        background: {background_color} !important;
                                        color: {text_color} !important;
                                    }}
                                    [class*="phone"], [id*="phone"], 
                                    [class*="Phone"], [id*="Phone"],
                                    input, select, textarea {{
                                        background: {background_color} !important;
                                        color: {text_color} !important;
                                        border-color: {text_color}33 !important;
                                    }}
                                `;
                                iframeDoc.head.appendChild(style);
                                
                                // Try to hide close buttons
                                const closeButtons = iframeDoc.querySelectorAll(
                                    'button[aria-label*="close" i], ' +
                                    'button[aria-label*="Close" i], ' +
                                    '.plaid-link-button-close, ' +
                                    '[data-testid="close-button"]'
                                );
                                closeButtons.forEach(function(btn) {{
                                    btn.style.display = 'none';
                                    btn.style.visibility = 'hidden';
                                }});
                            }}
                        }} catch (e) {{
                            // CORS may prevent access to iframe content
                            // This is expected and normal
                        }}
                    }});
                }}
                
                // Try immediately and then periodically
                setTimeout(tryInjectStyles, 500);
                setTimeout(tryInjectStyles, 1500);
                setTimeout(tryInjectStyles, 3000);
                
                // Use MutationObserver to watch for new iframes
                const observer = new MutationObserver(function(mutations) {{
                    tryInjectStyles();
                }});
                observer.observe(document.body, {{
                    childList: true,
                    subtree: true
                }});
            }})();
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)


@router.post("/exchange-token", response_model=ExchangeTokenResponse)
async def exchange_public_token(
    request: ExchangeTokenRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Exchange a Plaid public token for an access token and store bank accounts
    
    This is called after the user successfully links their bank account in Plaid Link
    """
    try:
        user_id = int(current_user["user_id"])
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        plaid_service = PlaidService()
        
        # Exchange public token for access token
        exchange_result = plaid_service.exchange_public_token(request.public_token)
        access_token = exchange_result["access_token"]
        item_id = exchange_result["item_id"]
        
        # Get accounts from Plaid
        accounts_data = plaid_service.get_accounts(access_token)
        
        # Get institution info (from first account if available)
        institution_name = None
        institution_id = None
        if accounts_data:
            # We'll need to get institution info separately or from accounts
            # For now, we'll store what we can get
            pass
        
        # Store each account in database
        created_accounts = []
        for account_data in accounts_data:
            # Check if account already exists
            existing_account = db.query(BankAccount).filter(
                BankAccount.plaid_account_id == account_data["account_id"]
            ).first()
            
            if existing_account:
                # Update existing account
                existing_account.plaid_access_token = access_token
                existing_account.plaid_item_id = item_id
                existing_account.account_name = account_data.get("name")
                existing_account.account_type = account_data.get("type")
                existing_account.account_subtype = account_data.get("subtype")
                existing_account.mask = account_data.get("mask")
                existing_account.official_name = account_data.get("official_name")
                
                balances = account_data.get("balances", {})
                existing_account.balance_available = balances.get("available")
                existing_account.balance_current = balances.get("current")
                existing_account.balance_limit = balances.get("limit")
                existing_account.balance_iso_currency_code = balances.get("iso_currency_code", "USD")
                
                existing_account.last_synced_at = datetime.utcnow()
                existing_account.updated_at = datetime.utcnow()
                
                created_accounts.append({
                    "account_id": existing_account.plaid_account_id,
                    "name": existing_account.account_name,
                    "mask": existing_account.mask
                })
            else:
                # Create new account
                bank_account = BankAccount(
                    user_id=user_id,
                    plaid_item_id=item_id,
                    plaid_access_token=access_token,
                    plaid_account_id=account_data["account_id"],
                    account_name=account_data.get("name"),
                    account_type=account_data.get("type"),
                    account_subtype=account_data.get("subtype"),
                    institution_name=institution_name,
                    institution_id=institution_id,
                    mask=account_data.get("mask"),
                    official_name=account_data.get("official_name"),
                    balance_available=account_data.get("balances", {}).get("available"),
                    balance_current=account_data.get("balances", {}).get("current"),
                    balance_limit=account_data.get("balances", {}).get("limit"),
                    balance_iso_currency_code=account_data.get("balances", {}).get("iso_currency_code", "USD"),
                    is_primary=False,  # First account becomes primary
                    is_active=True,
                    last_synced_at=datetime.utcnow()
                )
                
                db.add(bank_account)
                created_accounts.append({
                    "account_id": bank_account.plaid_account_id,
                    "name": bank_account.account_name,
                    "mask": bank_account.mask
                })
        
        # Set first account as primary if user has no primary account
        if created_accounts and not db.query(BankAccount).filter(
            BankAccount.user_id == user_id,
            BankAccount.is_primary == True
        ).first():
            first_account = db.query(BankAccount).filter(
                BankAccount.user_id == user_id
            ).order_by(BankAccount.created_at).first()
            if first_account:
                first_account.is_primary = True
        
        db.commit()
        
        logger.info(f"Successfully linked {len(created_accounts)} bank accounts for user {user_id}")
        
        return ExchangeTokenResponse(
            success=True,
            accounts=created_accounts,
            message=f"Successfully linked {len(created_accounts)} bank account(s)"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error exchanging public token: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to link bank account: {str(e)}"
        )


@router.get("/accounts", response_model=List[BankAccountResponse])
async def get_bank_accounts(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all bank accounts for the current user
    """
    try:
        user_id = int(current_user["user_id"])
        
        accounts = db.query(BankAccount).filter(
            BankAccount.user_id == user_id,
            BankAccount.is_active == True
        ).all()
        
        return [
            BankAccountResponse(
                id=account.id,
                account_name=account.account_name,
                account_type=account.account_type,
                account_subtype=account.account_subtype,
                institution_name=account.institution_name,
                mask=account.mask,
                official_name=account.official_name,
                balance_available=account.balance_available,
                balance_current=account.balance_current,
                balance_limit=account.balance_limit,
                balance_iso_currency_code=account.balance_iso_currency_code,
                is_primary=account.is_primary,
                is_active=account.is_active,
                created_at=account.created_at,
                updated_at=account.updated_at
            )
            for account in accounts
        ]
    except Exception as e:
        logger.error(f"Error getting bank accounts: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get bank accounts: {str(e)}"
        )


@router.get("/has-linked-account")
async def has_linked_account(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check if the current user has at least one linked bank account
    
    Returns:
        {"has_linked_account": bool}
    """
    try:
        user_id = int(current_user["user_id"])
        
        count = db.query(BankAccount).filter(
            BankAccount.user_id == user_id,
            BankAccount.is_active == True
        ).count()
        
        return {"has_linked_account": count > 0}
    except Exception as e:
        logger.error(f"Error checking linked account: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check linked account: {str(e)}"
        )


@router.delete("/accounts/{account_id}")
async def remove_bank_account(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Remove (deactivate) a bank account
    
    Note: We don't delete the account, just mark it as inactive
    """
    try:
        user_id = int(current_user["user_id"])
        
        account = db.query(BankAccount).filter(
            BankAccount.id == account_id,
            BankAccount.user_id == user_id
        ).first()
        
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found"
            )
        
        account.is_active = False
        account.updated_at = datetime.utcnow()
        
        # If this was the primary account, set another account as primary
        if account.is_primary:
            other_account = db.query(BankAccount).filter(
                BankAccount.user_id == user_id,
                BankAccount.id != account_id,
                BankAccount.is_active == True
            ).first()
            
            if other_account:
                other_account.is_primary = True
        
        db.commit()
        
        logger.info(f"Removed bank account {account_id} for user {user_id}")
        
        return {"success": True, "message": "Bank account removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error removing bank account: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove bank account: {str(e)}"
        )


@router.post("/accounts/{account_id}/set-primary")
async def set_primary_account(
    account_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Set a bank account as the primary account for transfers
    """
    try:
        user_id = int(current_user["user_id"])
        
        account = db.query(BankAccount).filter(
            BankAccount.id == account_id,
            BankAccount.user_id == user_id,
            BankAccount.is_active == True
        ).first()
        
        if not account:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Bank account not found"
            )
        
        # Unset all other primary accounts for this user
        db.query(BankAccount).filter(
            BankAccount.user_id == user_id,
            BankAccount.is_primary == True
        ).update({"is_primary": False})
        
        # Set this account as primary
        account.is_primary = True
        account.updated_at = datetime.utcnow()
        
        db.commit()
        
        logger.info(f"Set bank account {account_id} as primary for user {user_id}")
        
        return {"success": True, "message": "Primary account updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error setting primary account: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set primary account: {str(e)}"
        )
