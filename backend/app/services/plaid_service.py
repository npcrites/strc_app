"""
Plaid service for bank account integration
"""
import logging
from typing import Dict, List, Optional
from plaid import ApiClient
from plaid.configuration import Configuration
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.auth_get_request import AuthGetRequest
from plaid.model.identity_get_request import IdentityGetRequest
from app.core.config import settings

logger = logging.getLogger(__name__)


class PlaidService:
    """Service for interacting with Plaid API"""
    
    def __init__(self):
        """Initialize Plaid client"""
        configuration = Configuration(
            host=self._get_plaid_host(settings.PLAID_ENV),
            api_key={
                'clientId': settings.PLAID_CLIENT_ID,
                'secret': settings.PLAID_SECRET
            }
        )
        api_client = ApiClient(configuration)
        self.client = plaid_api.PlaidApi(api_client)
    
    @staticmethod
    def _get_plaid_host(env: str) -> str:
        """Get Plaid host based on environment"""
        env_map = {
            'sandbox': 'https://sandbox.plaid.com',
            'development': 'https://development.plaid.com',
            'production': 'https://production.plaid.com'
        }
        return env_map.get(env.lower(), env_map['sandbox'])
    
    def create_link_token(self, user_id: int, phone_number: Optional[str] = None) -> Dict:
        """
        Create a Plaid Link token for the user
        
        Args:
            user_id: User ID
            phone_number: Optional phone number (Plaid will handle if not provided)
        
        Returns:
            Dict with 'link_token' key
        """
        try:
            # Create user object
            user = LinkTokenCreateRequestUser(
                client_user_id=str(user_id)
            )
            
            # Create link token request
            # For web-based Plaid Link (Expo Go compatible)
            # Note: redirect_uri is not needed for standard Link flow - we handle redirects manually
            request = LinkTokenCreateRequest(
                products=[Products('auth'), Products('identity')],
                client_name="STRC Tracker",
                country_codes=[CountryCode('US')],
                language='en',
                user=user,
                # Webhook URL (optional, for production)
                # webhook='https://your-domain.com/webhooks/plaid',
            )
            
            response = self.client.link_token_create(request)
            
            logger.info(f"Created Plaid Link token for user {user_id}")
            
            return {
                'link_token': response.link_token,
                'expiration': response.expiration.isoformat() if hasattr(response, 'expiration') and response.expiration else None
            }
        except Exception as e:
            logger.error(f"Error creating Plaid Link token: {str(e)}", exc_info=True)
            raise
    
    def exchange_public_token(self, public_token: str) -> Dict:
        """
        Exchange a public token for an access token
        
        Args:
            public_token: Public token from Plaid Link
        
        Returns:
            Dict with 'access_token' and 'item_id'
        """
        try:
            request = ItemPublicTokenExchangeRequest(
                public_token=public_token
            )
            
            response = self.client.item_public_token_exchange(request)
            
            logger.info(f"Exchanged public token for access token. Item ID: {response.item_id}")
            
            return {
                'access_token': response.access_token,
                'item_id': response.item_id
            }
        except Exception as e:
            logger.error(f"Error exchanging public token: {str(e)}", exc_info=True)
            raise
    
    def get_accounts(self, access_token: str) -> List[Dict]:
        """
        Get accounts for an access token
        
        Args:
            access_token: Plaid access token
        
        Returns:
            List of account dictionaries
        """
        try:
            request = AccountsGetRequest(access_token=access_token)
            response = self.client.accounts_get(request)
            
            accounts = []
            for account in response.accounts:
                accounts.append({
                    'account_id': account.account_id,
                    'name': account.name if hasattr(account, 'name') else None,
                    'official_name': account.official_name if hasattr(account, 'official_name') else None,
                    'type': account.type if hasattr(account, 'type') else None,
                    'subtype': account.subtype if hasattr(account, 'subtype') else None,
                    'mask': account.mask if hasattr(account, 'mask') else None,
                    'balances': {
                        'available': str(account.balances.available) if hasattr(account.balances, 'available') and account.balances.available is not None else None,
                        'current': str(account.balances.current) if hasattr(account.balances, 'current') and account.balances.current is not None else None,
                        'limit': str(account.balances.limit) if hasattr(account.balances, 'limit') and account.balances.limit is not None else None,
                        'iso_currency_code': account.balances.iso_currency_code if hasattr(account.balances, 'iso_currency_code') else 'USD',
                    }
                })
            
            logger.info(f"Retrieved {len(accounts)} accounts from Plaid")
            return accounts
        except Exception as e:
            logger.error(f"Error getting accounts: {str(e)}", exc_info=True)
            raise
    
    def get_auth(self, access_token: str) -> Dict:
        """
        Get Auth data (routing numbers, account numbers) for ACH transfers
        
        Args:
            access_token: Plaid access token
        
        Returns:
            Dict with auth data
        """
        try:
            request = AuthGetRequest(access_token=access_token)
            response = self.client.auth_get(request)
            
            # Extract account and routing numbers
            auth_data = {
                'accounts': []
            }
            
            for account in response.accounts if hasattr(response, 'accounts') else []:
                auth_data['accounts'].append({
                    'account_id': account.account_id,
                    'routing': account.routing if hasattr(account, 'routing') else None,
                    'account': account.account if hasattr(account, 'account') else None,
                    'routing_wire': account.routing_wire if hasattr(account, 'routing_wire') else None,
                })
            
            logger.info(f"Retrieved Auth data for {len(auth_data['accounts'])} accounts")
            return auth_data
        except Exception as e:
            logger.error(f"Error getting Auth data: {str(e)}", exc_info=True)
            raise
    
    def get_identity(self, access_token: str) -> Dict:
        """
        Get Identity data (names, emails, phone numbers)
        
        Args:
            access_token: Plaid access token
        
        Returns:
            Dict with identity data
        """
        try:
            request = IdentityGetRequest(access_token=access_token)
            response = self.client.identity_get(request)
            
            identity_data = {
                'accounts': []
            }
            
            for account in response.accounts if hasattr(response, 'accounts') else []:
                identity_data['accounts'].append({
                    'account_id': account.account_id,
                    'owners': account.owners if hasattr(account, 'owners') else []
                })
            
            logger.info(f"Retrieved Identity data for {len(identity_data['accounts'])} accounts")
            return identity_data
        except Exception as e:
            logger.error(f"Error getting Identity data: {str(e)}", exc_info=True)
            raise
    
    def get_institution_name(self, institution_id: str) -> Optional[str]:
        """
        Get institution name by ID (optional, can be cached)
        
        Args:
            institution_id: Plaid institution ID
        
        Returns:
            Institution name or None
        """
        # For now, we'll get this from the accounts response
        # In production, you might want to cache institution names
        return None

