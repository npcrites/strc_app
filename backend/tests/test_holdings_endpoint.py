"""
Tests for the /api/assets/{ticker}/holdings endpoint
"""
import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date
import pytest

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.models.position import Position
from app.models.dividend import Dividend, DividendStatus
from app.models.ex_date import ExDate
from app.models.asset_price import AssetPrice
from app.core.security import create_access_token
from datetime import timedelta
from app.services.market_hours_service import MarketHoursService


# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_holdings.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test"""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Clean up tables after test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_user(db_session):
    """Create a test user"""
    user = User(
        email="test_holdings@example.com",
        full_name="Test Holdings User",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_token(test_user):
    """Create a JWT token for the test user"""
    access_token_expires = timedelta(minutes=60)
    token = create_access_token(
        data={"sub": str(test_user.id)},
        expires_delta=access_token_expires
    )
    return token


@pytest.fixture(scope="function")
def test_client(db_session, test_user):
    """Create a test client with overridden database dependency"""
    from app.core.security import get_current_user as original_get_current_user
    
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    async def override_get_current_user():
        return {"user_id": str(test_user.id)}
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[original_get_current_user] = override_get_current_user
    
    client = TestClient(app)
    yield client
    
    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def test_position(db_session, test_user):
    """Create a test position"""
    position = Position(
        user_id=test_user.id,
        ticker="STRC",
        name="STRC Preferred Stock",
        shares=Decimal('48.2'),
        cost_basis=Decimal('10000.00'),
        market_value=Decimal('12450.00'),
        asset_type="preferred_stock",
        snapshot_timestamp=datetime.utcnow()
    )
    db_session.add(position)
    db_session.commit()
    db_session.refresh(position)
    return position


@pytest.fixture(scope="function")
def test_asset_price(db_session):
    """Create a test asset price"""
    asset_price = AssetPrice(
        symbol="STRC",
        price=Decimal('258.30'),
        updated_at=datetime.utcnow()
    )
    db_session.add(asset_price)
    db_session.commit()
    db_session.refresh(asset_price)
    return asset_price


@pytest.fixture(scope="function")
def test_dividends(db_session, test_user, test_position):
    """Create test dividends"""
    # Calculate future dates for upcoming dividend (before creating the list)
    today = date.today()
    future_ex_date = today + timedelta(days=10)  # Ex-date 10 days from now
    future_pay_date = today + timedelta(days=25)  # Pay-date 25 days from now
    # Calculate pay_date_adjusted (next business day on or after pay_date)
    from app.services.market_hours_service import MarketHoursService
    market_hours_service = MarketHoursService()
    pay_date_adjusted = market_hours_service.get_next_business_day_on_or_after(future_pay_date)
    invest_by_date = market_hours_service.get_business_day_before(future_ex_date)
    
    dividends = [
        Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            amount=Decimal('300.50'),
            pay_date=date(2024, 1, 15),
            status=DividendStatus.PAID,
            dividend_per_share=Decimal('0.75'),
            shares_at_ex_date=Decimal('48.2'),
            ex_date=date(2024, 1, 1)
        ),
        Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            amount=Decimal('350.25'),
            pay_date=date(2024, 4, 15),
            status=DividendStatus.PAID,
            dividend_per_share=Decimal('0.85'),
            shares_at_ex_date=Decimal('48.2'),
            ex_date=date(2024, 4, 1)
        ),
        Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            amount=Decimal('595.05'),
            pay_date=date(2024, 7, 15),
            status=DividendStatus.PAID,
            dividend_per_share=Decimal('1.25'),
            shares_at_ex_date=Decimal('48.2'),
            ex_date=date(2024, 7, 1)
        ),
        # Add an upcoming dividend (should not be counted in total_dividends but should appear in next_pay_date)
        # Use future dates so it matches the query criteria
        Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            amount=Decimal('100.00'),
            pay_date=future_pay_date,
            pay_date_adjusted=pay_date_adjusted,
            status=DividendStatus.UPCOMING,
            dividend_per_share=Decimal('0.50'),
            shares_at_ex_date=Decimal('48.2'),
            ex_date=future_ex_date,
            invest_by_date=invest_by_date
        ),
    ]
    for dividend in dividends:
        db_session.add(dividend)
    db_session.commit()
    return dividends


class TestHoldingsEndpoint:
    """Test cases for the holdings endpoint"""
    
    def test_get_holdings_with_position_and_dividends(
        self, test_client, test_position, test_dividends, test_token
    ):
        """Test getting holdings with position and dividends"""
        response = test_client.get(
            f"/api/assets/{test_position.ticker}/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["ticker"] == "STRC"
        assert data["position_amount"] == 12450.00
        assert data["shares"] == 48.2
        
        # Total dividends should be sum of paid dividends only (300.50 + 350.25 + 595.05 = 1245.80)
        expected_total_dividends = 300.50 + 350.25 + 595.05
        assert data["total_dividends"] == pytest.approx(expected_total_dividends, rel=1e-6)
        
        # Check payout dates are included (upcoming dividend should be present)
        assert "next_ex_date" in data
        assert "next_pay_date" in data
        # The upcoming dividend from test_dividends should be returned
        today = date.today()
        future_ex_date = today + timedelta(days=10)
        future_pay_date = today + timedelta(days=25)
        assert data["next_ex_date"] == future_ex_date.isoformat()
        assert data["next_pay_date"] == future_pay_date.isoformat()
    
    def test_get_holdings_with_position_no_dividends(
        self, test_client, test_position, test_asset_price, test_token
    ):
        """Test getting holdings with position but no dividends"""
        response = test_client.get(
            f"/api/assets/{test_position.ticker}/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["ticker"] == "STRC"
        assert data["position_amount"] == 12450.00
        assert data["shares"] == 48.2
        assert data["total_dividends"] == 0.0
        # No upcoming dividends, so payout dates should be None
        assert data["next_ex_date"] is None
        assert data["next_pay_date"] is None
    
    def test_get_holdings_no_position(
        self, test_client, test_user, test_token
    ):
        """Test getting holdings when user has no position"""
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["ticker"] == "STRC"
        assert data["position_amount"] == 0.0
        assert data["shares"] == 0.0
        assert data["total_dividends"] == 0.0
        # No position, so no payout dates
        assert data["next_ex_date"] is None
        assert data["next_pay_date"] is None
    
    def test_get_holdings_position_without_market_value(
        self, test_client, test_user, test_asset_price, test_token
    ):
        """Test getting holdings when position has no market_value but has price"""
        # Create position without market_value
        position = Position(
            user_id=test_user.id,
            ticker="STRC",
            name="STRC Preferred Stock",
            shares=Decimal('48.2'),
            cost_basis=Decimal('10000.00'),
            market_value=None,  # No market_value
            asset_type="preferred_stock",
            snapshot_timestamp=datetime.utcnow()
        )
        db_session = test_client.app.dependency_overrides[get_db]().__next__()
        db_session.add(position)
        db_session.commit()
        
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["ticker"] == "STRC"
        # Should calculate from shares * price (48.2 * 258.30 = 12450.06)
        assert data["position_amount"] == pytest.approx(48.2 * 258.30, rel=1e-4)
        assert data["shares"] == 48.2
    
    def test_get_holdings_dividends_filtered_by_ticker(
        self, test_client, test_user, test_position, test_token
    ):
        """Test that dividends are filtered by ticker"""
        # Create dividends for different tickers
        db_session = test_client.app.dependency_overrides[get_db]().__next__()
        
        # STRC dividend
        strc_dividend = Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            amount=Decimal('500.00'),
            pay_date=date(2024, 1, 15),
            status=DividendStatus.PAID
        )
        db_session.add(strc_dividend)
        
        # Different ticker dividend (should not be counted)
        other_dividend = Dividend(
            user_id=test_user.id,
            position_id=None,
            ticker="MSFT",
            amount=Decimal('1000.00'),
            pay_date=date(2024, 1, 15),
            status=DividendStatus.PAID
        )
        db_session.add(other_dividend)
        db_session.commit()
        
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only include STRC dividends
        assert data["total_dividends"] == 500.00
    
    def test_get_holdings_only_paid_dividends(
        self, test_client, test_position, test_dividends, test_token
    ):
        """Test that only paid dividends are counted, not upcoming"""
        response = test_client.get(
            f"/api/assets/{test_position.ticker}/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Should only count paid dividends (300.50 + 350.25 + 595.05 = 1245.80)
        # The upcoming dividend (100.00) should not be included
        expected_total = 300.50 + 350.25 + 595.05
        assert data["total_dividends"] == pytest.approx(expected_total, rel=1e-6)
        
        # Should return upcoming dividend dates
        today = date.today()
        future_ex_date = today + timedelta(days=10)
        future_pay_date = today + timedelta(days=25)
        assert data["next_ex_date"] == future_ex_date.isoformat()
        assert data["next_pay_date"] == future_pay_date.isoformat()
    
    def test_get_holdings_unauthorized(self, db_session):
        """Test that unauthenticated requests are rejected"""
        # Create a fresh client without authentication override
        def override_get_db():
            try:
                yield db_session
            finally:
                pass
        
        # Don't override get_current_user - should fail auth
        app.dependency_overrides[get_db] = override_get_db
        
        client = TestClient(app)
        try:
            response = client.get("/api/assets/STRC/holdings")
            assert response.status_code == 401
        finally:
            # Clean up overrides
            app.dependency_overrides.clear()
    
    def test_get_holdings_pending_payout_sold_position_strf(
        self, test_client, test_user, test_token
    ):
        """Test getting holdings for STRF when user sold position but has pending payout"""
        db_session = test_client.app.dependency_overrides[get_db]().__next__()
        
        # Create a position that was sold (shares = 0)
        # This simulates user buying STRF, ex-date passing, then selling before payday
        position = Position(
            user_id=test_user.id,
            ticker="STRF",
            name="STRF Preferred Stock",
            shares=Decimal('0.0'),  # User sold the position
            cost_basis=Decimal('0.00'),
            market_value=Decimal('0.00'),
            asset_type="preferred_stock",
            snapshot_timestamp=datetime.utcnow()
        )
        db_session.add(position)
        db_session.commit()
        
        # Create ExDate for STRF with ex-date in the past, pay-date in the future
        today = date.today()
        past_ex_date = today - timedelta(days=10)  # Ex-date was 10 days ago
        future_pay_date = today + timedelta(days=5)  # Pay-date is 5 days from now
        
        market_hours_service = MarketHoursService()
        invest_by_date = market_hours_service.get_business_day_before(past_ex_date)
        pay_date_adjusted = market_hours_service.get_next_business_day_on_or_after(future_pay_date)
        
        ex_date_record = ExDate(
            ticker="STRF",
            ex_date=past_ex_date,
            pay_date=future_pay_date,
            invest_by_date=invest_by_date,
            dividend_amount="0.75",
            source="manual"
        )
        db_session.add(ex_date_record)
        db_session.commit()
        
        # Create a Dividend record with status=UPCOMING
        # User had 100 shares on ex-date, so payout is 100 * 0.75 = 75.00
        dividend = Dividend(
            user_id=test_user.id,
            position_id=position.id,
            ticker="STRF",
            amount=Decimal('75.00'),
            pay_date=future_pay_date,
            pay_date_adjusted=pay_date_adjusted,
            status=DividendStatus.UPCOMING,
            dividend_per_share=Decimal('0.75'),
            shares_at_ex_date=Decimal('100.0'),  # User had 100 shares on ex-date
            ex_date=past_ex_date,
            invest_by_date=invest_by_date,
            source="manual"
        )
        db_session.add(dividend)
        db_session.commit()
        
        # Call the holdings endpoint
        response = test_client.get(
            "/api/assets/STRF/holdings",
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify response
        assert data["ticker"] == "STRF"
        assert data["shares"] == 0.0  # No current holdings
        assert data["position_amount"] == 0.0  # No position value
        assert data["total_dividends"] == 0.0  # No paid dividends yet
        
        # Should return pending payout info even though shares = 0
        assert data["next_ex_date"] == past_ex_date.isoformat()
        assert data["next_pay_date"] == future_pay_date.isoformat()
        assert data["next_pay_date_adjusted"] == pay_date_adjusted.isoformat()
        assert data["next_payout_amount"] == 75.00  # Pending payout amount
        assert data["next_invest_by_date"] == invest_by_date.isoformat()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

