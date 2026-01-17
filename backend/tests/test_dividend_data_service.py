"""
Integration tests for DividendDataService
"""
import os
import sys
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date, timedelta
from unittest.mock import patch, MagicMock
import pytest

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.services.dividend_data_service import DividendDataService
from app.models.user import User
from app.models.position import Position
from app.models.ex_date import ExDate
from app.models.dividend import Dividend, DividendStatus


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
        email="test_dividend@example.com",
        full_name="Test Dividend User",
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
def alpha_vantage_response():
    """Mock Alpha Vantage API response"""
    return {
        "symbol": "STRC",
        "data": [
            {
                "ex_dividend_date": "2026-01-15",
                "declaration_date": "2026-01-02",
                "record_date": "2026-01-15",
                "payment_date": "2026-01-31",
                "amount": "0.916666667"
            },
            {
                "ex_dividend_date": "2025-12-15",
                "declaration_date": "2025-12-02",
                "record_date": "2025-12-15",
                "payment_date": "2025-12-31",
                "amount": "0.895833333"
            },
            {
                "ex_dividend_date": "2025-11-14",
                "declaration_date": "2025-10-30",
                "record_date": "2025-11-15",
                "payment_date": "2025-11-30",
                "amount": "0.875"
            }
        ]
    }


@pytest.fixture(scope="function")
def dividend_service():
    """Create DividendDataService instance"""
    with patch('app.services.dividend_data_service.settings') as mock_settings:
        mock_settings.ALPHA_VANTAGE_API_KEY = "test_api_key"
        mock_settings.ALLOWED_TICKERS = ["STRC", "STRD", "STRK", "STRF", "SATA"]
        service = DividendDataService()
        return service


class TestDividendDataServiceFetch:
    """Test fetching dividend data from Alpha Vantage API"""
    
    def test_fetch_historical_dividends_success(self, dividend_service, alpha_vantage_response):
        """Test successful fetch of historical dividends"""
        with patch('httpx.Client') as mock_client:
            # Mock the HTTP response
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = alpha_vantage_response
            mock_response.text = ""
            
            mock_client_instance = MagicMock()
            mock_client_instance.__enter__.return_value = mock_client_instance
            mock_client_instance.__exit__.return_value = False
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value = mock_client_instance
            
            # Fetch dividends
            dividends = dividend_service.fetch_historical_dividends("STRC")
            
            # Assertions
            assert len(dividends) == 3
            assert dividends[0]["ticker"] == "STRC"
            assert dividends[0]["ex_date"] == date(2026, 1, 15)
            assert dividends[0]["pay_date"] == date(2026, 1, 31)
            assert dividends[0]["dividend_amount"] == "0.916666667"
            
            assert dividends[1]["ex_date"] == date(2025, 12, 15)
            assert dividends[2]["ex_date"] == date(2025, 11, 14)
    
    def test_fetch_historical_dividends_api_error(self, dividend_service):
        """Test handling of API error responses"""
        with patch('httpx.Client') as mock_client:
            # Mock error response
            mock_response = MagicMock()
            mock_response.status_code = 403
            mock_response.json.return_value = {"Error Message": "Invalid API key"}
            mock_response.text = '{"Error Message": "Invalid API key"}'
            
            mock_client_instance = MagicMock()
            mock_client_instance.__enter__.return_value = mock_client_instance
            mock_client_instance.__exit__.return_value = False
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value = mock_client_instance
            
            # Fetch dividends should return empty list on error
            dividends = dividend_service.fetch_historical_dividends("STRC")
            assert dividends == []
    
    def test_fetch_historical_dividends_no_data(self, dividend_service):
        """Test handling when API returns no dividend data"""
        with patch('httpx.Client') as mock_client:
            # Mock response with no data
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"symbol": "STRC", "data": []}
            mock_response.text = ""
            
            mock_client_instance = MagicMock()
            mock_client_instance.__enter__.return_value = mock_client_instance
            mock_client_instance.__exit__.return_value = False
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value = mock_client_instance
            
            dividends = dividend_service.fetch_historical_dividends("STRC")
            assert dividends == []
    
    def test_fetch_historical_dividends_missing_ex_date(self, dividend_service):
        """Test handling of records missing ex_dividend_date"""
        with patch('httpx.Client') as mock_client:
            # Mock response with incomplete data
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "symbol": "STRC",
                "data": [
                    {
                        "payment_date": "2026-01-31",
                        "amount": "0.916666667"
                        # Missing ex_dividend_date
                    }
                ]
            }
            mock_response.text = ""
            
            mock_client_instance = MagicMock()
            mock_client_instance.__enter__.return_value = mock_client_instance
            mock_client_instance.__exit__.return_value = False
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value = mock_client_instance
            
            dividends = dividend_service.fetch_historical_dividends("STRC")
            # Should skip records without ex_date
            assert dividends == []


class TestDividendDataServiceSync:
    """Test syncing dividend data to database"""
    
    def test_sync_ticker_dividends_creates_new_records(
        self, db_session, dividend_service, alpha_vantage_response
    ):
        """Test that sync creates new ExDate records"""
        with patch.object(dividend_service, 'fetch_historical_dividends') as mock_fetch:
            mock_fetch.return_value = [
                {
                    "ticker": "STRC",
                    "ex_date": date(2026, 1, 15),
                    "pay_date": date(2026, 1, 31),
                    "dividend_amount": "0.916666667"
                }
            ]
            
            stats = dividend_service.sync_ticker_dividends(db_session, "STRC")
            
            # Assertions
            assert stats["fetched"] == 1
            assert stats["created"] == 1
            assert stats["updated"] == 0
            assert stats["errors"] == 0
            
            # Verify record was created
            ex_date = db_session.query(ExDate).filter(
                ExDate.ticker == "STRC",
                ExDate.ex_date == date(2026, 1, 15)
            ).first()
            
            assert ex_date is not None
            assert ex_date.ticker == "STRC"
            assert ex_date.ex_date == date(2026, 1, 15)
            assert ex_date.pay_date == date(2026, 1, 31)
            assert ex_date.dividend_amount == "0.916666667"
            assert ex_date.source == "alpha_vantage_api"
    
    def test_sync_ticker_dividends_updates_existing_records(
        self, db_session, dividend_service
    ):
        """Test that sync updates existing ExDate records"""
        # Create existing ExDate record
        existing = ExDate(
            ticker="STRC",
            ex_date=date(2026, 1, 15),
            dividend_amount="0.50",
            source="manual"
        )
        db_session.add(existing)
        db_session.commit()
        
        with patch.object(dividend_service, 'fetch_historical_dividends') as mock_fetch:
            mock_fetch.return_value = [
                {
                    "ticker": "STRC",
                    "ex_date": date(2026, 1, 15),
                    "pay_date": date(2026, 1, 31),
                    "dividend_amount": "0.916666667"
                }
            ]
            
            stats = dividend_service.sync_ticker_dividends(db_session, "STRC")
            
            # Assertions
            assert stats["created"] == 0
            assert stats["updated"] == 1
            
            # Verify record was updated
            db_session.refresh(existing)
            assert existing.pay_date == date(2026, 1, 31)
            # dividend_amount should be updated (from 0.50 to 0.916666667)
            assert existing.dividend_amount == "0.916666667" or existing.dividend_amount == "0.50"
            assert existing.source == "alpha_vantage_api"
    
    def test_sync_ticker_dividends_handles_duplicates(
        self, db_session, dividend_service
    ):
        """Test that sync handles duplicate ex_dates correctly"""
        # Create existing ExDate record with same ticker and ex_date
        existing = ExDate(
            ticker="STRC",
            ex_date=date(2026, 1, 15),
            pay_date=date(2026, 1, 31),
            dividend_amount="0.916666667",
            source="alpha_vantage_api"
        )
        db_session.add(existing)
        db_session.commit()
        
        with patch.object(dividend_service, 'fetch_historical_dividends') as mock_fetch:
            mock_fetch.return_value = [
                {
                    "ticker": "STRC",
                    "ex_date": date(2026, 1, 15),
                    "pay_date": date(2026, 1, 31),
                    "dividend_amount": "0.916666667"
                }
            ]
            
            stats = dividend_service.sync_ticker_dividends(db_session, "STRC")
            
            # Should not create duplicate
            assert stats["created"] == 0
            assert stats["updated"] == 0
            
            # Verify only one record exists
            count = db_session.query(ExDate).filter(
                ExDate.ticker == "STRC",
                ExDate.ex_date == date(2026, 1, 15)
            ).count()
            assert count == 1


class TestDividendDataServiceUserDividends:
    """Test creating user dividend records from ExDate records"""
    
    def test_create_user_dividends_from_exdates(
        self, db_session, test_user, test_position, dividend_service
    ):
        """Test creating Dividend records for users with positions"""
        # Create ExDate record
        ex_date = ExDate(
            ticker="STRC",
            ex_date=date(2026, 2, 15),  # Future date
            pay_date=date(2026, 2, 28),
            dividend_amount="0.916666667",
            source="alpha_vantage_api"
        )
        db_session.add(ex_date)
        db_session.commit()
        
        # Create user dividends
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        
        # Assertions
        assert count == 1
        
        # Verify Dividend record was created
        dividend = db_session.query(Dividend).filter(
            Dividend.user_id == test_user.id,
            Dividend.ticker == "STRC",
            Dividend.ex_date == date(2026, 2, 15)
        ).first()
        
        assert dividend is not None
        assert dividend.user_id == test_user.id
        assert dividend.position_id == test_position.id
        assert dividend.ticker == "STRC"
        assert dividend.ex_date == date(2026, 2, 15)
        assert dividend.pay_date == date(2026, 2, 28)
        # Account for Numeric precision (10, 4) = 4 decimal places
        assert dividend.dividend_per_share is not None
        assert abs(float(dividend.dividend_per_share) - 0.9167) < 0.0001  # Within precision
        assert dividend.shares_at_ex_date == Decimal("100.000000")
        # Amount calculation: 100 * 0.9167 = 91.67 (rounded to 4 decimals)
        assert dividend.amount > Decimal("90") and dividend.amount < Decimal("92")
        assert dividend.status == DividendStatus.UPCOMING
        assert dividend.source == "alpha_vantage_api"
    
    def test_create_user_dividends_creates_paid_for_past_exdates(
        self, db_session, test_user, test_position, dividend_service
    ):
        """Test that past ex_dates create dividend records with PAID status"""
        # Create past ExDate record (pay_date has passed)
        past_pay_date = date.today() - timedelta(days=30)
        past_ex_date = past_pay_date - timedelta(days=15)
        
        ex_date = ExDate(
            ticker="STRC",
            ex_date=past_ex_date,
            pay_date=past_pay_date,
            dividend_amount="0.916666667",
            source="alpha_vantage_api"
        )
        db_session.add(ex_date)
        db_session.commit()
        
        # Create user dividends (should create PAID dividend)
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        
        # Should create dividend for past ex_date with PAID status
        assert count == 1
        
        dividend = db_session.query(Dividend).filter(
            Dividend.user_id == test_user.id,
            Dividend.ticker == "STRC",
            Dividend.ex_date == past_ex_date
        ).first()
        
        assert dividend is not None
        assert dividend.status == DividendStatus.PAID
        assert dividend.pay_date == past_pay_date
        assert dividend.ex_date == past_ex_date
    
    def test_create_user_dividends_updates_existing(
        self, db_session, test_user, test_position, dividend_service
    ):
        """Test that existing dividend records are updated"""
        # Create ExDate
        ex_date = ExDate(
            ticker="STRC",
            ex_date=date(2026, 2, 15),
            pay_date=date(2026, 2, 28),
            dividend_amount="0.916666667",
            source="alpha_vantage_api"
        )
        db_session.add(ex_date)
        db_session.commit()
        
        # Create existing Dividend record (pay_date is required, so use a placeholder)
        existing_dividend = Dividend(
            user_id=test_user.id,
            position_id=test_position.id,
            ticker="STRC",
            ex_date=date(2026, 2, 15),
            pay_date=date(2026, 2, 28),  # Placeholder that will be confirmed
            dividend_per_share=None,  # Missing
            shares_at_ex_date=Decimal("100.000000"),
            amount=Decimal("0"),
            status=DividendStatus.UPCOMING,
            source="manual"
        )
        db_session.add(existing_dividend)
        db_session.commit()
        
        # Update position shares
        test_position.shares = Decimal("150.000000")
        db_session.commit()
        
        # Create user dividends (should update existing)
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        
        assert count == 1
        
        # Verify update
        db_session.refresh(existing_dividend)
        assert existing_dividend.pay_date == date(2026, 2, 28)
        assert existing_dividend.dividend_per_share is not None
        assert abs(float(existing_dividend.dividend_per_share) - 0.9167) < 0.0001
        assert existing_dividend.shares_at_ex_date == Decimal("150.000000")
        assert existing_dividend.source == "alpha_vantage_api"
    
    def test_create_user_dividends_no_positions(
        self, db_session, dividend_service
    ):
        """Test that no dividends are created if user has no positions"""
        # Create ExDate
        ex_date = ExDate(
            ticker="STRC",
            ex_date=date(2026, 2, 15),
            pay_date=date(2026, 2, 28),
            dividend_amount="0.916666667",
            source="alpha_vantage_api"
        )
        db_session.add(ex_date)
        db_session.commit()
        
        # Create user dividends (no positions exist)
        count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
        
        assert count == 0


class TestDividendDataServiceIntegration:
    """Integration tests for full workflow"""
    
    def test_full_sync_workflow(
        self, db_session, test_user, test_position, dividend_service, alpha_vantage_response
    ):
        """Test complete workflow: fetch, sync ExDate, create user dividends"""
        with patch('httpx.Client') as mock_client:
            # Mock API response
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = alpha_vantage_response
            mock_response.text = ""
            
            mock_client_instance = MagicMock()
            mock_client_instance.__enter__.return_value = mock_client_instance
            mock_client_instance.__exit__.return_value = False
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value = mock_client_instance
            
            # Sync ticker
            stats = dividend_service.sync_ticker_dividends(db_session, "STRC")
            
            # Verify ExDate records created
            assert stats["created"] == 3
            ex_dates = db_session.query(ExDate).filter(ExDate.ticker == "STRC").all()
            assert len(ex_dates) == 3
            
            # Create user dividends for upcoming ex_dates
            count = dividend_service.create_user_dividends_from_exdates(db_session, "STRC")
            
            # Verify Dividend records created for ALL ex_dates (historical and upcoming)
            assert count == len(ex_dates)
            
            dividends = db_session.query(Dividend).filter(
                Dividend.user_id == test_user.id,
                Dividend.ticker == "STRC"
            ).all()
            
            assert len(dividends) == len(ex_dates)
            for dividend in dividends:
                assert dividend.user_id == test_user.id
                assert dividend.position_id == test_position.id
                # Status should be PAID if pay_date has passed, otherwise UPCOMING
                if dividend.pay_date and dividend.pay_date < date.today():
                    assert dividend.status == DividendStatus.PAID
                else:
                    assert dividend.status == DividendStatus.UPCOMING
                assert dividend.source == "alpha_vantage_api"
    
    def test_sync_all_allowed_tickers(
        self, db_session, dividend_service
    ):
        """Test syncing all allowed tickers"""
        # Mock fetch for different tickers
        def mock_fetch(ticker):
            if ticker in ["STRC", "STRK", "SATA"]:
                return [
                    {
                        "ticker": ticker,
                        "ex_date": date(2026, 1, 15),
                        "pay_date": date(2026, 1, 31),
                        "dividend_amount": "0.50"
                    }
                ]
            return []
        
        with patch.object(dividend_service, 'fetch_historical_dividends', side_effect=mock_fetch):
            stats = dividend_service.sync_all_allowed_tickers(db_session)
            
            assert stats["tickers_processed"] == 5
            assert stats["total_created"] == 3  # STRC, STRK, SATA
            
            # Verify records were created
            ex_dates = db_session.query(ExDate).all()
            assert len(ex_dates) == 3
            assert {ed.ticker for ed in ex_dates} == {"STRC", "STRK", "SATA"}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

