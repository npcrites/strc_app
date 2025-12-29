"""
Tests for PlaidService
Run with: pytest tests/test_plaid_service.py -v
"""
import pytest
from datetime import date, timedelta
from app.services.plaid_service import PlaidService


class TestPlaidService:
    """Test cases for PlaidService"""
    
    @pytest.fixture
    def plaid_service(self):
        """Create a PlaidService instance for testing"""
        return PlaidService()
    
    def test_create_link_token(self, plaid_service):
        """Test creating a Plaid Link token"""
        result = plaid_service.create_link_token("test_user_123")
        
        assert "link_token" in result
        assert "expiration" in result
        assert result["link_token"].startswith("link-")
    
    def test_service_initialization(self, plaid_service):
        """Test that PlaidService initializes correctly"""
        assert plaid_service is not None
        assert plaid_service.client is not None
    
    # Note: The following tests require actual access tokens from Plaid
    # They are commented out to avoid errors in CI/CD
    # Uncomment and provide valid tokens for integration testing
    
    # def test_exchange_public_token(self, plaid_service):
    #     """Test exchanging public token for access token"""
    #     # This requires a valid public_token from Plaid Link
    #     result = plaid_service.exchange_public_token("public_token_here")
    #     assert "access_token" in result
    #     assert "item_id" in result
    
    # def test_get_accounts(self, plaid_service):
    #     """Test retrieving accounts"""
    #     # This requires a valid access_token
    #     result = plaid_service.get_accounts("access_token_here")
    #     assert isinstance(result, list)
    
    # def test_get_investment_holdings(self, plaid_service):
    #     """Test retrieving investment holdings"""
    #     # This requires a valid access_token with investment accounts
    #     result = plaid_service.get_investment_holdings("access_token_here")
    #     assert "holdings" in result
    #     assert "securities" in result
    #     assert "accounts" in result


