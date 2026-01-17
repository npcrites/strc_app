"""
End-to-end integration tests for dividend flow: ExDate → Dividend → API response
Tests the complete flow from API fetch to client response
"""
import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date, timedelta
from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.main import app
from app.services.dividend_data_service import DividendDataService
from app.models.user import User
from app.models.position import Position
from app.models.ex_date import ExDate
from app.models.dividend import Dividend, DividendStatus
from app.core.security import create_access_token


# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
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
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def test_user(db_session):
    """Create a test user"""
    user = User(
        email="test_e2e@example.com",
        full_name="Test E2E User",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_position(db_session, test_user):
    """Create a test position"""
    position = Position(
        user_id=test_user.id,
        ticker="STRC",
        name="Stretch Variable Preferred",
        shares=Decimal("100.000000"),
        cost_basis=Decimal("10000.00"),
        market_value=Decimal("11000.00"),
        asset_type="preferred_stock"
    )
    db_session.add(position)
    db_session.commit()
    db_session.refresh(position)
    return position


@pytest.fixture(scope="function")
def test_client(db_session):
    """Create FastAPI test client with database override"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides = {}
    from app.db.session import get_db
    app.dependency_overrides[get_db] = override_get_db
    
    client = TestClient(app)
    yield client
    
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def auth_token(test_user):
    """Create JWT token for test user"""
    return create_access_token(data={"sub": str(test_user.id), "user_id": test_user.id})


@pytest.fixture(scope="function")
def dividend_service():
    """Create DividendDataService instance"""
    with patch('app.services.dividend_data_service.settings') as mock_settings:
        mock_settings.ALPHA_VANTAGE_API_KEY = "test_api_key"
        mock_settings.ALLOWED_TICKERS = ["STRC", "STRD", "STRK", "STRF", "SATA"]
        service = DividendDataService()
        return service


class TestDividendE2EFlow:
    """End-to-end tests for complete dividend flow"""
    
    def test_exdate_to_dividend_to_api_response(
        self, db_session, test_user, test_position, test_client, auth_token, dividend_service
    ):
        """
        Test complete flow:
        1. Create ExDate record (simulating API fetch)
        2. Create Dividend record from ExDate
        3. Verify API endpoint returns correct total_dividends
        """
        # Step 1: Create ExDate records (simulating sync from Alpha Vantage)
        past_pay_date = date.today() - timedelta(days=30)
        past_ex_date = past_pay_date - timedelta(days=15)
        
        recent_pay_date = date.today() - timedelta(days=5)
        recent_ex_date = recent_pay_date - timedelta(days=15)
        
        future_pay_date = date.today() + timedelta(days=30)
        future_ex_date = future_pay_date - timedelta(days=15)
        
        ex_dates = [
            ExDate(
                ticker="STRC",
                ex_date=past_ex_date,
                pay_date=past_pay_date,
                dividend_amount="0.80",
                source="alpha_vantage_api"
            ),
            ExDate(
                ticker="STRC",
                ex_date=recent_ex_date,
                pay_date=recent_pay_date,
                dividend_amount="0.90",
                source="alpha_vantage_api"
            ),
            ExDate(
                ticker="STRC",
                ex_date=future_ex_date,
                pay_date=future_pay_date,
                dividend_amount="1.00",
                source="alpha_vantage_api"
            ),
        ]
        
        for ex_date in ex_dates:
            db_session.add(ex_date)
        db_session.commit()
        
        # Step 2: Create Dividend records from ExDate records
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        assert count == 3  # Should create dividends for all 3 ex_dates
        
        # Verify Dividend records were created with correct statuses
        dividends = db_session.query(Dividend).filter(
            Dividend.user_id == test_user.id,
            Dividend.ticker == "STRC"
        ).all()
        
        assert len(dividends) == 3
        
        # Past dividends should be PAID
        past_dividend = next(d for d in dividends if d.ex_date == past_ex_date)
        assert past_dividend.status == DividendStatus.PAID
        
        # Recent dividends should be PAID
        recent_dividend = next(d for d in dividends if d.ex_date == recent_ex_date)
        assert recent_dividend.status == DividendStatus.PAID
        
        # Future dividends should be UPCOMING
        future_dividend = next(d for d in dividends if d.ex_date == future_ex_date)
        assert future_dividend.status == DividendStatus.UPCOMING
        
        # Calculate expected total (only PAID dividends)
        expected_total = float(past_dividend.amount + recent_dividend.amount)
        
        # Step 3: Test API endpoint returns correct total_dividends
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["ticker"] == "STRC"
        assert data["shares"] == 100.0
        assert data["total_dividends"] == pytest.approx(expected_total, rel=0.01)
        # Should only include PAID dividends, not UPCOMING
        assert data["total_dividends"] > 0
        assert future_dividend.amount not in [past_dividend.amount, recent_dividend.amount] or \
               data["total_dividends"] == expected_total
    
    def test_exdate_sync_creates_dividend_and_api_updates(
        self, db_session, test_user, test_position, test_client, auth_token, dividend_service
    ):
        """
        Test that when a new ExDate is synced, dividends are created and API reflects changes
        """
        # Initially, no dividends
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        assert response.json()["total_dividends"] == 0.0
        
        # Step 1: Simulate sync creating new ExDate (like daily job would)
        with patch.object(dividend_service, 'fetch_historical_dividends') as mock_fetch:
            mock_fetch.return_value = [
                {
                    "ticker": "STRC",
                    "ex_date": date.today() - timedelta(days=20),
                    "pay_date": date.today() - timedelta(days=5),
                    "dividend_amount": "0.75"
                }
            ]
            
            stats = dividend_service.sync_ticker_dividends(db_session, "STRC")
            assert stats["created"] == 1
        
        # Step 2: Create Dividend records (like daily job would)
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        assert count == 1
        
        # Step 3: Verify API now returns the dividend
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Should now have dividends
        assert data["total_dividends"] > 0
        assert data["total_dividends"] == pytest.approx(float(test_position.shares * Decimal("0.75")), rel=0.01)
    
    def test_only_paid_dividends_counted_in_api(
        self, db_session, test_user, test_position, test_client, auth_token, dividend_service
    ):
        """
        Test that API endpoint only returns PAID dividends, not UPCOMING ones
        """
        # Create paid dividend
        paid_ex_date = ExDate(
            ticker="STRC",
            ex_date=date.today() - timedelta(days=30),
            pay_date=date.today() - timedelta(days=10),
            dividend_amount="1.00",
            source="alpha_vantage_api"
        )
        
        # Create upcoming dividend
        upcoming_ex_date = ExDate(
            ticker="STRC",
            ex_date=date.today() + timedelta(days=15),
            pay_date=date.today() + timedelta(days=30),
            dividend_amount="2.00",  # Higher amount
            source="alpha_vantage_api"
        )
        
        db_session.add(paid_ex_date)
        db_session.add(upcoming_ex_date)
        db_session.commit()
        
        # Create dividends
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        assert count == 2
        
        # Verify statuses
        dividends = db_session.query(Dividend).filter(
            Dividend.user_id == test_user.id,
            Dividend.ticker == "STRC"
        ).all()
        
        paid_dividend = next(d for d in dividends if d.status == DividendStatus.PAID)
        upcoming_dividend = next(d for d in dividends if d.status == DividendStatus.UPCOMING)
        
        # API should only return PAID dividend amount
        response = test_client.get(
            "/api/assets/STRC/holdings",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        assert data["total_dividends"] == pytest.approx(float(paid_dividend.amount), rel=0.01)
        # Should NOT include upcoming dividend
        assert data["total_dividends"] != pytest.approx(float(paid_dividend.amount + upcoming_dividend.amount), rel=0.01)
        assert data["total_dividends"] < float(paid_dividend.amount + upcoming_dividend.amount)
        
        # Should return upcoming dividend dates
        assert data["next_ex_date"] == upcoming_dividend.ex_date.isoformat()
        assert data["next_pay_date"] == upcoming_dividend.pay_date.isoformat()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

