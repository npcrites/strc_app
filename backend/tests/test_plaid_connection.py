"""
Test Plaid connection and basic functionality
Run from backend directory: python -m pytest tests/test_plaid_connection.py -v
Or directly: python -m tests.test_plaid_connection
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.services.plaid_service import PlaidService


def test_plaid_connection():
    """Test basic Plaid connection and link token creation"""
    print("\n" + "="*60)
    print("Testing Plaid Connection")
    print("="*60)
    print(f"Environment: {settings.PLAID_ENV}")
    print(f"Client ID: {settings.PLAID_CLIENT_ID[:10]}...")
    print()
    
    try:
        # Initialize service
        plaid_service = PlaidService()
        print("✅ PlaidService initialized successfully")
        
        # Test creating a link token
        print("\nTesting link token creation...")
        link_token_result = plaid_service.create_link_token("test_user_123")
        
        assert 'link_token' in link_token_result
        assert 'expiration' in link_token_result
        assert link_token_result['link_token'].startswith('link-')
        
        print(f"✅ Link token created: {link_token_result['link_token'][:30]}...")
        print(f"   Expiration: {link_token_result['expiration']}")
        
        print("\n✅ All connection tests passed!")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    test_plaid_connection()

