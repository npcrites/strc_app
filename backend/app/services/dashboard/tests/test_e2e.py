"""
End-to-end tests for dashboard service (requires database)
"""
import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta
from decimal import Decimal
from sqlalchemy.exc import OperationalError

# Add parent directory to path
backend_dir = Path(__file__).parent.parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models import User, Position, Dividend, DividendStatus
from app.core.security import get_password_hash
from app.services.dashboard.dashboard_service import DashboardService
from app.services.dashboard.models.time_range import TimeRange, TimeGranularity


@pytest.fixture(scope="function")
def db_session():
    """Create a database session for testing"""
    try:
        # Test connection
        with engine.connect() as conn:
            from sqlalchemy import text
            conn.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("Database not available - skipping E2E test")
    
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
def test_user(db_session):
    """Create a test user"""
    user = User(
        email="dashboard_test@example.com",
        hashed_password=get_password_hash("test123"),
        full_name="Dashboard Test User",
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture(scope="function")
def test_positions(db_session, test_user):
    """Create test positions"""
    # Create positions with different timestamps
    now = datetime.now()
    positions = [
        Position(
            user_id=test_user.id,
            ticker="STRC",
            name="Starco Preferred",
            shares=Decimal("100.000000"),
            cost_basis=Decimal("10000.00"),
            market_value=Decimal("10000.00"),
            asset_type="preferred_stock",
            snapshot_timestamp=now - timedelta(days=30)
        ),
        Position(
            user_id=test_user.id,
            ticker="STRC",
            name="Starco Preferred",
            shares=Decimal("100.000000"),
            cost_basis=Decimal("10000.00"),
            market_value=Decimal("11000.00"),
            asset_type="preferred_stock",
            snapshot_timestamp=now
        ),
        Position(
            user_id=test_user.id,
            ticker="AAPL",
            name="Apple Inc.",
            shares=Decimal("10.000000"),
            cost_basis=Decimal("1500.00"),
            market_value=Decimal("1750.00"),
            asset_type="common_stock",
            snapshot_timestamp=now
        ),
    ]
    
    for pos in positions:
        db_session.add(pos)
    db_session.commit()
    
    # Create dividends for cash flow testing
    dividends = [
        Dividend(
            user_id=test_user.id,
            position_id=positions[0].id,
            ticker="STRC",
            amount=Decimal("250.0000"),
            pay_date=now - timedelta(days=15),
            status=DividendStatus.PAID,
            dividend_per_share=Decimal("2.5000"),
            shares_at_ex_date=Decimal("100.000000"),
            ex_date=now - timedelta(days=20),
            source="manual"
        ),
        Dividend(
            user_id=test_user.id,
            position_id=positions[0].id,
            ticker="STRC",
            amount=Decimal("250.0000"),
            pay_date=now - timedelta(days=5),
            status=DividendStatus.PAID,
            dividend_per_share=Decimal("2.5000"),
            shares_at_ex_date=Decimal("100.000000"),
            ex_date=now - timedelta(days=10),
            source="manual"
        ),
        # Add upcoming dividend for activity testing
        Dividend(
            user_id=test_user.id,
            position_id=positions[0].id,
            ticker="STRC",
            amount=Decimal("250.0000"),
            pay_date=now + timedelta(days=30),
            status=DividendStatus.UPCOMING,
            dividend_per_share=Decimal("2.5000"),
            shares_at_ex_date=Decimal("100.000000"),
            ex_date=now + timedelta(days=15),
            source="manual"
        ),
    ]
    
    for div in dividends:
        db_session.add(div)
    db_session.commit()
    
    return positions


def test_dashboard_e2e_basic(db_session, test_user, test_positions):
    """Test end-to-end dashboard building with positions and dividends"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    time_range = TimeRange(start_date, end_date, TimeGranularity.DAILY)
    
    snapshot = DashboardService.build_dashboard(db_session, test_user.id, time_range)
    
    # Assertions
    assert snapshot.total.current > 0
    assert snapshot.total.start > 0
    assert len(snapshot.allocation) > 0
    assert snapshot.performance.max > 0
    
    # Check allocation includes both asset types
    asset_types = [item.asset_type for item in snapshot.allocation]
    assert "preferred_stock" in asset_types
    assert "common_stock" in asset_types
    
    # Check that cash flows are included in total
    # Total should be > position value alone (includes dividends)
    position_total = sum(item.value for item in snapshot.allocation)
    assert snapshot.total.current >= position_total  # Should include cash flows
    
    # Check that separate series are included
    assert snapshot.performance.position_series is not None
    assert snapshot.performance.cash_series is not None
    assert len(snapshot.performance.cash_series) > 0  # Should have dividend cash flows
    
    # Check activity feed
    assert len(snapshot.activity) > 0
    # Should have paid dividends in the time range
    paid_dividends = [a for a in snapshot.activity if a.activity_type == "DIVIDEND"]
    assert len(paid_dividends) >= 2  # At least 2 paid dividends
    # Should have upcoming dividends
    upcoming = [a for a in snapshot.activity if a.activity_type == "UPCOMING_DIVIDEND"]
    assert len(upcoming) >= 1  # At least 1 upcoming dividend
    # Verify chronological sorting
    timestamps = [a.timestamp for a in snapshot.activity]
    assert timestamps == sorted(timestamps)


def test_dashboard_e2e_empty_portfolio(db_session, test_user):
    """Test dashboard with empty portfolio"""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    time_range = TimeRange(start_date, end_date, TimeGranularity.DAILY)
    
    snapshot = DashboardService.build_dashboard(db_session, test_user.id, time_range)
    
    assert snapshot.total.current == 0.0
    assert snapshot.total.start == 0.0
    assert len(snapshot.allocation) == 0


def test_dashboard_e2e_time_range_shorthand(db_session, test_user, test_positions):
    """Test dashboard with shorthand time ranges"""
    for shorthand in ["1M", "3M", "1Y"]:
        time_range = TimeRange.from_shorthand(shorthand)
        snapshot = DashboardService.build_dashboard(db_session, test_user.id, time_range)
        
        assert snapshot is not None
        assert snapshot.total.current >= 0
        assert isinstance(snapshot.allocation, list)
        # Check that cash flows are included
        assert snapshot.performance.cash_series is not None
        # Check activity feed exists
        assert isinstance(snapshot.activity, list)

