"""
Plaid service for integrating with Plaid API
"""
from typing import List, Dict, Optional
from datetime import datetime, date
from plaid.api import plaid_api
from plaid.configuration import Configuration, Environment
from plaid.api_client import ApiClient
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
from app.core.config import settings


class PlaidService:
    """Service for interacting with Plaid API"""
    
    def __init__(self):
        # Map environment string to Plaid Environment
        env_map = {
            'sandbox': Environment.Sandbox,
            'development': Environment.Sandbox,  # Development uses Sandbox
            'production': Environment.Production,
        }
        
        plaid_env = env_map.get(settings.PLAID_ENV.lower(), Environment.Sandbox)
        
        configuration = Configuration(
            host=plaid_env,
            api_key={
                'clientId': settings.PLAID_CLIENT_ID,
                'secret': settings.PLAID_SECRET,
            }
        )
        api_client = ApiClient(configuration)
        self.client = plaid_api.PlaidApi(api_client)
    
    def create_link_token(self, user_id: str) -> Dict:
        """Create a Plaid Link token for the user"""
        request = LinkTokenCreateRequest(
            products=[Products('transactions'), Products('investments')],
            client_name="STRC Tracker",
            country_codes=[CountryCode('US')],
            language='en',
            user=LinkTokenCreateRequestUser(client_user_id=str(user_id))
        )
        
        try:
            response = self.client.link_token_create(request)
            return {
                "link_token": response['link_token'],
                "expiration": response['expiration'].isoformat() if hasattr(response['expiration'], 'isoformat') else str(response['expiration'])
            }
        except Exception as e:
            raise Exception(f"Failed to create link token: {str(e)}")
    
    def exchange_public_token(self, public_token: str) -> Dict:
        """Exchange public token for access token"""
        request = ItemPublicTokenExchangeRequest(public_token=public_token)
        
        try:
            response = self.client.item_public_token_exchange(request)
            return {
                "access_token": response['access_token'],
                "item_id": response['item_id']
            }
        except Exception as e:
            raise Exception(f"Failed to exchange public token: {str(e)}")
    
    def get_accounts(self, access_token: str) -> List[Dict]:
        """Get accounts for a given access token"""
        request = AccountsGetRequest(access_token=access_token)
        
        try:
            response = self.client.accounts_get(request)
            accounts = []
            for account in response['accounts']:
                balances = account.get('balances', {})
                accounts.append({
                    "account_id": account['account_id'],
                    "name": account['name'],
                    "type": account['type'],
                    "subtype": account.get('subtype'),
                    "balance": {
                        "available": balances.get('available'),
                        "current": balances.get('current'),
                    },
                    "mask": account.get('mask'),
                })
            return accounts
        except Exception as e:
            raise Exception(f"Failed to get accounts: {str(e)}")
    
    def get_transactions(
        self,
        access_token: str,
        start_date: date,
        end_date: date
    ) -> List[Dict]:
        """Get transactions for a date range"""
        request = TransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date
        )
        
        try:
            response = self.client.transactions_get(request)
            transactions = []
            for tx in response['transactions']:
                transactions.append({
                    "transaction_id": tx['transaction_id'],
                    "account_id": tx['account_id'],
                    "amount": tx['amount'],
                    "date": tx['date'].isoformat() if isinstance(tx['date'], date) else tx['date'],
                    "name": tx['name'],
                    "merchant_name": tx.get('merchant_name'),
                    "category": tx.get('category'),
                    "category_id": tx.get('category_id'),
                    "pending": tx.get('pending', False),
                })
            return transactions
        except Exception as e:
            raise Exception(f"Failed to get transactions: {str(e)}")
    
    def get_investment_transactions(
        self,
        access_token: str,
        start_date: date,
        end_date: date
    ) -> List[Dict]:
        """Get investment/trading transactions for a date range"""
        request = InvestmentsTransactionsGetRequest(
            access_token=access_token,
            start_date=start_date,
            end_date=end_date
        )
        
        try:
            response = self.client.investments_transactions_get(request)
            transactions = []
            for tx in response['investment_transactions']:
                transactions.append({
                    "investment_transaction_id": tx['investment_transaction_id'],
                    "account_id": tx['account_id'],
                    "security_id": tx.get('security_id'),
                    "date": tx['date'].isoformat() if isinstance(tx['date'], date) else tx['date'],
                    "name": tx['name'],
                    "quantity": tx.get('quantity'),
                    "amount": tx['amount'],
                    "price": tx.get('price'),
                    "fees": tx.get('fees'),
                    "type": tx['type'],
                    "subtype": tx.get('subtype'),
                    "iso_currency_code": tx.get('iso_currency_code'),
                })
            return transactions
        except Exception as e:
            raise Exception(f"Failed to get investment transactions: {str(e)}")
    
    def get_investment_holdings(self, access_token: str) -> Dict:
        """Get current investment holdings (positions)"""
        request = InvestmentsHoldingsGetRequest(access_token=access_token)
        
        try:
            response = self.client.investments_holdings_get(request)
            
            holdings = []
            for holding in response['holdings']:
                holdings.append({
                    "account_id": holding['account_id'],
                    "security_id": holding['security_id'],
                    "quantity": holding['quantity'],
                    "institution_price": holding.get('institution_price'),
                    "institution_value": holding.get('institution_value'),
                    "cost_basis": holding.get('cost_basis'),
                    "iso_currency_code": holding.get('iso_currency_code'),
                })
            
            securities = []
            for security in response['securities']:
                securities.append({
                    "security_id": security['security_id'],
                    "name": security.get('name'),
                    "ticker_symbol": security.get('ticker_symbol'),
                    "type": security.get('type'),
                    "close_price": security.get('close_price'),
                    "close_price_as_of": security.get('close_price_as_of'),
                    "iso_currency_code": security.get('iso_currency_code'),
                })
            
            accounts = []
            for account in response['accounts']:
                accounts.append({
                    "account_id": account['account_id'],
                    "name": account['name'],
                    "type": account['type'],
                    "subtype": account.get('subtype'),
                })
            
            return {
                "accounts": accounts,
                "holdings": holdings,
                "securities": securities,
            }
        except Exception as e:
            raise Exception(f"Failed to get investment holdings: {str(e)}")
    
    def sync_transactions(self, access_token: str, cursor: Optional[str] = None) -> Dict:
        """Sync transactions using Plaid Sync API (recommended for production)"""
        request = TransactionsSyncRequest(
            access_token=access_token,
            cursor=cursor
        )
        
        try:
            response = self.client.transactions_sync(request)
            return {
                "added": [tx.to_dict() for tx in response['added']],
                "modified": [tx.to_dict() for tx in response['modified']],
                "removed": [tx.to_dict() for tx in response['removed']],
                "has_more": response['has_more'],
                "next_cursor": response['next_cursor'],
            }
        except Exception as e:
            raise Exception(f"Failed to sync transactions: {str(e)}")


