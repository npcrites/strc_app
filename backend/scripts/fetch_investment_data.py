"""
Script to fetch and display sample investment data from Plaid Sandbox
Run from backend directory: python scripts/fetch_investment_data.py
"""
import os
import sys
from datetime import date, timedelta
from pprint import pprint

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.core.config import settings
from app.services.plaid_service import PlaidService
from plaid.api import plaid_api
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.sandbox_public_token_create_request_options import SandboxPublicTokenCreateRequestOptions
from plaid.model.products import Products


def create_sandbox_item(plaid_service: PlaidService):
    """Create a sandbox item with investment accounts"""
    # Use a test institution that supports investments
    # First National Bank (ins_109508) supports investments in sandbox
    institution_id = "ins_109508"
    
    try:
        request = SandboxPublicTokenCreateRequest(
            institution_id=institution_id,
            initial_products=[Products('investments'), Products('transactions')],
            options=SandboxPublicTokenCreateRequestOptions(
                override_username="user_good",
                override_password="pass_good"
            )
        )
        
        response = plaid_service.client.sandbox_public_token_create(request)
        public_token = response['public_token']
        
        print(f"   Public Token: {public_token[:30]}...")
        
        # Exchange for access token
        exchange_result = plaid_service.exchange_public_token(public_token)
        return exchange_result['access_token']
    except Exception as e:
        print(f"Error creating sandbox item: {e}")
        import traceback
        traceback.print_exc()
        raise


def display_investment_holdings(plaid_service: PlaidService, access_token: str):
    """Fetch and display investment holdings"""
    print("\n" + "="*80)
    print("INVESTMENT HOLDINGS")
    print("="*80)
    
    try:
        holdings_data = plaid_service.get_investment_holdings(access_token)
        
        print(f"\n📊 Accounts ({len(holdings_data['accounts'])}):")
        for account in holdings_data['accounts']:
            print(f"  • {account['name']} ({account['type']})")
            if account.get('subtype'):
                print(f"    Subtype: {account['subtype']}")
        
        print(f"\n💼 Securities ({len(holdings_data['securities'])}):")
        securities_map = {sec['security_id']: sec for sec in holdings_data['securities']}
        
        for security in holdings_data['securities']:
            ticker = security.get('ticker_symbol') or 'N/A'
            name = security.get('name') or 'Unknown'
            sec_type = str(security.get('type') or 'N/A')
            price = security.get('close_price') or 0
            price_str = f"${float(price):,.2f}" if price else "N/A"
            print(f"  • {ticker:6} | {name[:40]:40} | {sec_type[:15]:15} | {price_str}")
        
        print(f"\n📈 Holdings ({len(holdings_data['holdings'])}):")
        total_value = 0
        
        for holding in holdings_data['holdings']:
            security_id = holding['security_id']
            security = securities_map.get(security_id, {})
            ticker = security.get('ticker_symbol') or 'N/A'
            name = (security.get('name') or 'Unknown')[:35]
            quantity = holding.get('quantity') or 0
            cost_basis = holding.get('cost_basis') or 0
            institution_value = holding.get('institution_value') or 0
            total_value += float(institution_value) if institution_value else 0
            
            qty_str = f"{float(quantity):>10.4f}" if quantity else "N/A"
            cost_str = f"${float(cost_basis):>10,.2f}" if cost_basis else "N/A"
            value_str = f"${float(institution_value):>10,.2f}" if institution_value else "N/A"
            
            print(f"  • {ticker[:6]:6} | {name:35} | Qty: {qty_str:>10} | "
                  f"Cost: {cost_str:>12} | Value: {value_str:>12}")
        
        print(f"\n💰 Total Portfolio Value: ${total_value:,.2f}")
        
        return holdings_data
        
    except Exception as e:
        print(f"❌ Error fetching holdings: {e}")
        import traceback
        traceback.print_exc()
        return None


def display_investment_transactions(plaid_service: PlaidService, access_token: str, days: int = 90):
    """Fetch and display investment transactions"""
    print("\n" + "="*80)
    print("INVESTMENT TRANSACTIONS")
    print("="*80)
    
    end_date = date.today()
    start_date = end_date - timedelta(days=days)
    
    print(f"\n📅 Date Range: {start_date} to {end_date} ({days} days)")
    
    try:
        transactions = plaid_service.get_investment_transactions(
            access_token, start_date, end_date
        )
        
        if not transactions:
            print("\n  No transactions found in this date range.")
            return []
        
        print(f"\n📝 Transactions ({len(transactions)}):")
        print(f"\n{'Date':<12} {'Type':<15} {'Subtype':<15} {'Name':<40} {'Amount':>12} {'Quantity':>12}")
        print("-" * 120)
        
        total_amount = 0
        for tx in sorted(transactions, key=lambda x: str(x.get('date', '')), reverse=True):
            tx_date = str(tx.get('date', 'N/A'))
            tx_type = str(tx.get('type', 'N/A'))
            tx_subtype = str(tx.get('subtype', 'N/A'))
            tx_name = (tx.get('name') or 'Unknown')[:40]
            tx_amount = tx.get('amount') or 0
            tx_quantity = tx.get('quantity') or 0
            total_amount += abs(float(tx_amount)) if tx_amount else 0
            
            amount_str = f"${float(tx_amount):>11,.2f}" if tx_amount else "N/A"
            qty_str = f"{float(tx_quantity):>11,.4f}" if tx_quantity else "N/A"
            
            print(f"{tx_date[:12]:<12} {tx_type[:15]:<15} {tx_subtype[:15]:<15} {tx_name:<40} "
                  f"{amount_str:>12} {qty_str:>12}")
        
        print("-" * 120)
        print(f"{'Total':<82} ${total_amount:>11,.2f}")
        
        # Group by type
        type_counts = {}
        for tx in transactions:
            tx_type = str(tx.get('type', 'unknown'))
            type_counts[tx_type] = type_counts.get(tx_type, 0) + 1
        
        print(f"\n📊 Transaction Types:")
        for tx_type, count in sorted(type_counts.items()):
            print(f"  • {tx_type}: {count}")
        
        return transactions
        
    except Exception as e:
        print(f"❌ Error fetching transactions: {e}")
        import traceback
        traceback.print_exc()
        return []


def main():
    """Main function to fetch and display investment data"""
    print("="*80)
    print("PLAID INVESTMENT DATA FETCHER")
    print("="*80)
    print(f"\nEnvironment: {settings.PLAID_ENV}")
    print(f"Client ID: {settings.PLAID_CLIENT_ID[:10]}...")
    
    try:
        plaid_service = PlaidService()
        print("✅ PlaidService initialized")
        
        # Create sandbox item
        print("\n🔧 Creating sandbox item with investment accounts...")
        access_token = create_sandbox_item(plaid_service)
        print(f"✅ Created sandbox item")
        print(f"   Access Token: {access_token[:30]}...")
        
        # Fetch and display holdings
        holdings_data = display_investment_holdings(plaid_service, access_token)
        
        # Fetch and display transactions
        transactions = display_investment_transactions(plaid_service, access_token, days=365)
        
        print("\n" + "="*80)
        print("✅ SUCCESS - Investment data fetched successfully!")
        print("="*80)
        print("\n💡 Next steps:")
        print("  1. Store the access_token securely in your database")
        print("  2. Use this access_token to fetch real-time data via API endpoints")
        print("  3. Sync transactions periodically using sync_transactions()")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)

