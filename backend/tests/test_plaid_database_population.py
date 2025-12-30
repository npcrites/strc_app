"""
Test that populates database with Plaid data
This test creates a sandbox Plaid item, fetches investment data,
and populates User, Brokerage, Account, Position, and Dividend tables.

Note: This test requires a running PostgreSQL database.
Set DATABASE_URL in .env file or skip this test if database is not available.
"""
import pytest
import sys
from pathlib import Path
from datetime import date, timedelta
from sqlalchemy.exc import OperationalError
from sqlalchemy import text

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.services.plaid_service import PlaidService
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models import User, Brokerage, Account, Position, Dividend, DividendStatus
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.sandbox_public_token_create_request_options import SandboxPublicTokenCreateRequestOptions
from plaid.model.products import Products
from app.core.security import get_password_hash


@pytest.fixture(scope="function")
def db_session():
    """Create a database session for testing"""
    try:
        # Test connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("Database not available - skipping database population test")
    
    # Create all tables
    Base.metadata.create_all(bind=engine)
    
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Clean up tables after test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def plaid_service():
    """Create a PlaidService instance"""
    return PlaidService()


@pytest.fixture(scope="function")
def test_user(db_session):
    """Create a test user"""
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Test User",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_plaid_database_population(plaid_service, db_session, test_user):
    """Test populating database with Plaid investment data"""
    
    # Step 1: Create sandbox Plaid item
    institution_id = "ins_109508"  # First National Bank supports investments
    
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
    
    # Exchange for access token
    exchange_result = plaid_service.exchange_public_token(public_token)
    access_token = exchange_result['access_token']
    
    # Store access token in user
    test_user.plaid_access_token = access_token
    db_session.commit()
    
    # Step 2: Get investment holdings
    holdings_data = plaid_service.get_investment_holdings(access_token)
    
    # Step 3: Get accounts
    accounts_data = plaid_service.get_accounts(access_token)
    
    # Step 4: Get investment transactions
    end_date = date.today()
    start_date = end_date - timedelta(days=365)
    transactions_data = plaid_service.get_investment_transactions(
        access_token, start_date, end_date
    )
    
    # Step 5: Create Brokerage
    brokerage = Brokerage(
        user_id=test_user.id,
        name="First National Bank"  # From sandbox institution
    )
    db_session.add(brokerage)
    db_session.commit()
    db_session.refresh(brokerage)
    
    # Step 6: Create Accounts from Plaid data
    account_map = {}  # Map Plaid account_id to our Account
    securities_map = {sec['security_id']: sec for sec in holdings_data.get('securities', [])}
    
    # Debug: Print account types we received
    print(f"\n📊 Plaid accounts received: {len(accounts_data)}")
    for acc in accounts_data[:5]:  # Show first 5
        print(f"   - {acc.get('name')}: type={acc.get('type')}, subtype={acc.get('subtype')}")
    
    # Get account IDs that have holdings
    account_ids_with_holdings = {h.get('account_id') for h in holdings_data.get('holdings', [])}
    print(f"   Account IDs with holdings: {len(account_ids_with_holdings)}")
    
    # Create accounts - include investment accounts or any account that has holdings
    for plaid_account in accounts_data:
        account_id = plaid_account.get('account_id')
        if not account_id:
            continue
            
        # Include if it's an investment account OR if it has holdings
        is_investment = plaid_account.get('type') == 'investment'
        has_holdings = account_id in account_ids_with_holdings
        
        if is_investment or has_holdings:
            # Extract balance safely
            balance = None
            balance_data = plaid_account.get('balance')
            if isinstance(balance_data, dict):
                balance = balance_data.get('current')
            elif balance_data is not None:
                balance = balance_data
            
            try:
                # Convert enum types to strings if needed
                account_type = plaid_account.get('type')
                if hasattr(account_type, 'value'):
                    account_type = account_type.value
                elif account_type is not None:
                    account_type = str(account_type)
                
                account_subtype = plaid_account.get('subtype')
                if hasattr(account_subtype, 'value'):
                    account_subtype = account_subtype.value
                elif account_subtype is not None:
                    account_subtype = str(account_subtype)
                
                account = Account(
                    user_id=test_user.id,
                    brokerage_id=brokerage.id,
                    plaid_account_id=account_id,
                    name=plaid_account.get('name', 'Unknown Account'),
                    type=account_type,
                    subtype=account_subtype,
                    balance=balance
                )
                db_session.add(account)
                db_session.flush()  # Flush to get ID without committing
                db_session.refresh(account)
                account_map[account_id] = account
                print(f"   ✅ Created account: {account.name} ({account.type})")
            except Exception as e:
                print(f"   ⚠️  Error creating account {account_id}: {e}")
                db_session.rollback()
                continue
    
    # Commit all accounts at once
    db_session.commit()
    
    # Step 7: Create Positions from holdings
    position_map = {}  # Map ticker to Position for dividend linking
    
    for holding in holdings_data.get('holdings', []):
        security_id = holding['security_id']
        security = securities_map.get(security_id, {})
        ticker = security.get('ticker_symbol')
        
        if not ticker or not holding.get('account_id'):
            continue
        
        account = account_map.get(holding['account_id'])
        if not account:
            continue
        
        # Check if position already exists for this ticker/account
        existing_position = db_session.query(Position).filter_by(
            user_id=test_user.id,
            account_id=account.id,
            ticker=ticker
        ).first()
        
        if existing_position:
            position = existing_position
            # Update existing position
            position.shares = holding.get('quantity', 0)
            position.cost_basis = holding.get('cost_basis', 0)
            position.market_value = holding.get('institution_value', 0)
            position.name = security.get('name')
            position.asset_type = security.get('type')
        else:
            position = Position(
                user_id=test_user.id,
                account_id=account.id,
                ticker=ticker,
                name=security.get('name'),
                shares=holding.get('quantity', 0),
                cost_basis=holding.get('cost_basis', 0),
                market_value=holding.get('institution_value', 0),
                asset_type=security.get('type')
            )
            db_session.add(position)
        
        db_session.commit()
        db_session.refresh(position)
        
        # Store position by ticker for dividend linking
        if ticker not in position_map:
            position_map[ticker] = position
    
    # Step 8: Create Dividends from transactions
    # Filter for dividend transactions
    dividend_transactions = [
        tx for tx in transactions_data 
        if tx.get('type') == 'cash' and tx.get('subtype') == 'dividend'
    ]
    
    for tx in dividend_transactions:
        ticker = None
        # Try to find ticker from security_id
        if tx.get('security_id'):
            security = securities_map.get(tx['security_id'], {})
            ticker = security.get('ticker_symbol')
        
        if not ticker:
            # Try to extract from transaction name
            tx_name = tx.get('name', '')
            # This is a simple heuristic - in production, you'd want better parsing
            continue
        
        # Find position for this ticker
        position = position_map.get(ticker)
        
        # Calculate ex_date (15 days before pay_date as per requirement)
        pay_date = tx.get('date')
        if isinstance(pay_date, str):
            pay_date = date.fromisoformat(pay_date)
        elif not isinstance(pay_date, date):
            continue
        
        ex_date = pay_date - timedelta(days=15)
        
        # Check if dividend already exists
        existing_dividend = db_session.query(Dividend).filter_by(
            user_id=test_user.id,
            ticker=ticker,
            pay_date=pay_date
        ).first()
        
        if not existing_dividend:
            dividend = Dividend(
                user_id=test_user.id,
                position_id=position.id if position else None,
                ticker=ticker,
                amount=abs(float(tx.get('amount', 0))),
                pay_date=pay_date,
                status=DividendStatus.PAID if pay_date < date.today() else DividendStatus.UPCOMING,
                ex_date=ex_date,
                shares_at_ex_date=position.shares if position else None,
                source="plaid"
            )
            db_session.add(dividend)
    
    db_session.commit()
    
    # Step 9: Verify data was created
    user_count = db_session.query(User).filter_by(id=test_user.id).count()
    brokerage_count = db_session.query(Brokerage).filter_by(user_id=test_user.id).count()
    account_count = db_session.query(Account).filter_by(user_id=test_user.id).count()
    position_count = db_session.query(Position).filter_by(user_id=test_user.id).count()
    dividend_count = db_session.query(Dividend).filter_by(user_id=test_user.id).count()
    
    assert user_count == 1, "User should be created"
    assert brokerage_count == 1, "Brokerage should be created"
    assert account_count > 0, f"At least one account should be created (found {account_count})"
    assert position_count > 0, f"At least one position should be created (found {position_count})"
    
    print(f"\n✅ Database populated successfully:")
    print(f"   User: {user_count}")
    print(f"   Brokerages: {brokerage_count}")
    print(f"   Accounts: {account_count}")
    print(f"   Positions: {position_count}")
    print(f"   Dividends: {dividend_count}")
    
    # Print some sample data
    positions = db_session.query(Position).filter_by(user_id=test_user.id).limit(5).all()
    print(f"\n📊 Sample Positions:")
    for pos in positions:
        print(f"   {pos.ticker}: {pos.shares} shares @ ${pos.cost_basis}")
    
    dividends = db_session.query(Dividend).filter_by(user_id=test_user.id).limit(5).all()
    print(f"\n💰 Sample Dividends:")
    for div in dividends:
        print(f"   {div.ticker}: ${div.amount} on {div.pay_date} (ex-date: {div.ex_date})")

