"""
Standardized mock data factory for development and testing.

This module provides a reusable way to generate mock data for the application.
It can be used by seed scripts, tests, and development tools.
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.models import User, Position, Dividend, ExDate
from app.models.dividend import DividendStatus


class MockDataFactory:
    """Factory for creating standardized mock data"""
    
    @staticmethod
    def create_demo_user(
        db: Session,
        email: str = "demo@example.com",
        password: str = None,  # Not used - OAuth only
        full_name: str = "Demo User",
        overwrite: bool = False
    ) -> User:
        """
        Create or get demo user.
        
        Args:
            db: Database session
            email: User email
            password: Not used (OAuth-only authentication)
            full_name: User full name
            overwrite: If True, delete existing user and recreate
        
        Returns:
            User object
        """
        existing_user = db.query(User).filter(User.email == email).first()
        
        if existing_user:
            if overwrite:
                # Delete existing user and all related data
                db.delete(existing_user)
                db.commit()
            else:
                return existing_user
        
        user = User(
            email=email,
            full_name=full_name,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def create_positions(
        db: Session,
        user_id: int,
        positions_config: Optional[List[Dict]] = None
    ) -> List[Position]:
        """
        Create positions for a user.
        
        Args:
            db: Database session
            user_id: User ID
            positions_config: List of position config dicts (if None, uses defaults)
        
        Returns:
            List of Position objects
        """
        if positions_config is None:
            # Only create positions for allowed tickers: STRC, STRD, STRK, STRF, SATA
            positions_config = [
                {
                    "ticker": "STRC",
                    "name": "STRC Preferred Stock",
                    "shares": Decimal("30.000000"),
                    "cost_basis": Decimal("3000.00"),
                    "market_value": Decimal("3150.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "ticker": "SATA",
                    "name": "SATA Preferred Stock",
                    "shares": Decimal("15.000000"),
                    "cost_basis": Decimal("1500.00"),
                    "market_value": Decimal("1575.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "ticker": "STRD",
                    "name": "STRD Preferred Stock",
                    "shares": Decimal("25.000000"),
                    "cost_basis": Decimal("2500.00"),
                    "market_value": Decimal("2625.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "ticker": "STRK",
                    "name": "STRK Preferred Stock",
                    "shares": Decimal("20.000000"),
                    "cost_basis": Decimal("2000.00"),
                    "market_value": Decimal("2100.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "ticker": "STRF",
                    "name": "STRF Preferred Stock",
                    "shares": Decimal("15.000000"),
                    "cost_basis": Decimal("1500.00"),
                    "market_value": Decimal("1575.00"),
                    "asset_type": "preferred_stock"
                },
            ]
        
        positions = []
        for pos_data in positions_config:
            # Check if position already exists (by ticker and user)
            existing = db.query(Position).filter(
                Position.user_id == user_id,
                Position.ticker == pos_data["ticker"]
            ).first()
            
            if existing:
                # Update existing position
                for key, value in pos_data.items():
                    setattr(existing, key, value)
                existing.snapshot_timestamp = datetime.utcnow()
                positions.append(existing)
                continue
            
            position = Position(
                user_id=user_id,
                snapshot_timestamp=datetime.utcnow(),
                **pos_data
            )
            db.add(position)
            positions.append(position)
        
        db.commit()
        for position in positions:
            db.refresh(position)
        
        return positions
    
    @staticmethod
    def create_dividends(
        db: Session,
        user_id: int,
        positions: List[Position],
        dividends_config: Optional[List[Dict]] = None
    ) -> List[Dividend]:
        """
        Create dividends for positions.
        
        Args:
            db: Database session
            user_id: User ID
            positions: List of Position objects
            dividends_config: List of dividend config dicts (if None, generates defaults)
        
        Returns:
            List of Dividend objects
        """
        today = date.today()
        
        if dividends_config is None:
            # Generate dividends based on positions - small, frequent transactions
            dividends_config = []
            
            # Find STRC positions - monthly dividends, past 6 months
            strc_positions = [p for p in positions if p.ticker == "STRC"]
            for pos in strc_positions:
                dividend_per_share = Decimal("0.25")  # $0.25 per share monthly
                for month_offset in range(-6, 2):  # Past 6 months + 1 upcoming
                    pay_date = today + timedelta(days=30 * month_offset)
                    ex_date = pay_date - timedelta(days=15)
                    amount = dividend_per_share * pos.shares
                    
                    dividends_config.append({
                        "position_id": pos.id,
                        "ticker": "STRC",
                        "amount": amount,
                        "pay_date": pay_date,
                        "status": DividendStatus.PAID if month_offset < 0 else DividendStatus.UPCOMING,
                        "dividend_per_share": dividend_per_share,
                        "shares_at_ex_date": pos.shares,
                        "ex_date": ex_date,
                        "source": "manual"
                    })
            
            # Find SATA positions - bi-monthly dividends, past 6 months
            sata_positions = [p for p in positions if p.ticker == "SATA"]
            for pos in sata_positions:
                dividend_per_share = Decimal("0.30")  # $0.30 per share bi-monthly
                for month_offset in range(-6, 2, 2):  # Every 2 months
                    pay_date = today + timedelta(days=30 * month_offset)
                    ex_date = pay_date - timedelta(days=15)
                    amount = dividend_per_share * pos.shares
                    
                    dividends_config.append({
                        "position_id": pos.id,
                        "ticker": "SATA",
                        "amount": amount,
                        "pay_date": pay_date,
                        "status": DividendStatus.PAID if month_offset < 0 else DividendStatus.UPCOMING,
                        "dividend_per_share": dividend_per_share,
                        "shares_at_ex_date": pos.shares,
                        "ex_date": ex_date,
                        "source": "manual"
                    })
            
            # Find STRD positions - quarterly dividends
            strd_positions = [p for p in positions if p.ticker == "STRD"]
            for pos in strd_positions:
                dividend_per_share = Decimal("0.35")  # $0.35 per share quarterly
                for quarter_offset in range(-2, 1):  # Past 2 quarters + 1 upcoming
                    pay_date = today + timedelta(days=90 * quarter_offset)
                    ex_date = pay_date - timedelta(days=15)
                    amount = dividend_per_share * pos.shares
                    
                    dividends_config.append({
                        "position_id": pos.id,
                        "ticker": "STRD",
                        "amount": amount,
                        "pay_date": pay_date,
                        "status": DividendStatus.PAID if quarter_offset < 0 else DividendStatus.UPCOMING,
                        "dividend_per_share": dividend_per_share,
                        "shares_at_ex_date": pos.shares,
                        "ex_date": ex_date,
                        "source": "manual"
                    })
            
            # Find STRK positions - quarterly dividends
            strk_positions = [p for p in positions if p.ticker == "STRK"]
            for pos in strk_positions:
                dividend_per_share = Decimal("0.40")  # $0.40 per share quarterly
                for quarter_offset in range(-2, 1):  # Past 2 quarters + 1 upcoming
                    pay_date = today + timedelta(days=90 * quarter_offset + 15)
                    ex_date = pay_date - timedelta(days=15)
                    amount = dividend_per_share * pos.shares
                    
                    dividends_config.append({
                        "position_id": pos.id,
                        "ticker": "STRK",
                        "amount": amount,
                        "pay_date": pay_date,
                        "status": DividendStatus.PAID if quarter_offset < 0 else DividendStatus.UPCOMING,
                        "dividend_per_share": dividend_per_share,
                        "shares_at_ex_date": pos.shares,
                        "ex_date": ex_date,
                        "source": "manual"
                    })
            
            # Find STRF positions - quarterly dividends
            strf_positions = [p for p in positions if p.ticker == "STRF"]
            for pos in strf_positions:
                dividend_per_share = Decimal("0.30")  # $0.30 per share quarterly
                for quarter_offset in range(-2, 1):  # Past 2 quarters + 1 upcoming
                    pay_date = today + timedelta(days=90 * quarter_offset + 30)
                    ex_date = pay_date - timedelta(days=15)
                    amount = dividend_per_share * pos.shares
                    
                    dividends_config.append({
                        "position_id": pos.id,
                        "ticker": "STRF",
                        "amount": amount,
                        "pay_date": pay_date,
                        "status": DividendStatus.PAID if quarter_offset < 0 else DividendStatus.UPCOMING,
                        "dividend_per_share": dividend_per_share,
                        "shares_at_ex_date": pos.shares,
                        "ex_date": ex_date,
                        "source": "manual"
                    })
        
        dividends = []
        for div_data in dividends_config:
            # Check if dividend already exists
            existing = db.query(Dividend).filter(
                Dividend.user_id == user_id,
                Dividend.position_id == div_data["position_id"],
                Dividend.pay_date == div_data["pay_date"],
                Dividend.ticker == div_data["ticker"]
            ).first()
            
            if existing:
                dividends.append(existing)
                continue
            
            dividend = Dividend(
                user_id=user_id,
                **div_data
            )
            db.add(dividend)
            dividends.append(dividend)
        
        db.commit()
        for dividend in dividends:
            db.refresh(dividend)
        
        return dividends
    
    @staticmethod
    def create_ex_dates(
        db: Session,
        user_id: Optional[int] = None,  # Deprecated: kept for backward compatibility but not used
        ex_dates_config: Optional[List[Dict]] = None
    ) -> List[ExDate]:
        """
        Create ex-dates for tickers (asset-specific, not user-specific).
        
        Args:
            db: Database session
            user_id: Deprecated - kept for backward compatibility but not used
            ex_dates_config: List of ex-date config dicts (if None, uses defaults)
        
        Returns:
            List of ExDate objects
        """
        today = date.today()
        
        if ex_dates_config is None:
            ex_dates_config = [
                {
                    "ticker": "STRC",
                    "ex_date": today + timedelta(days=15),
                    "dividend_amount": Decimal("0.25"),
                    "pay_date": today + timedelta(days=30),
                    "source": "manual",
                    "notes": "Monthly dividend"
                },
                {
                    "ticker": "SATA",
                    "ex_date": today + timedelta(days=45),
                    "dividend_amount": Decimal("0.30"),
                    "pay_date": today + timedelta(days=60),
                    "source": "manual",
                    "notes": "Bi-monthly dividend"
                },
                {
                    "ticker": "STRD",
                    "ex_date": today + timedelta(days=75),
                    "dividend_amount": Decimal("0.35"),
                    "pay_date": today + timedelta(days=90),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
                {
                    "ticker": "STRK",
                    "ex_date": today + timedelta(days=90),
                    "dividend_amount": Decimal("0.40"),
                    "pay_date": today + timedelta(days=105),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
                {
                    "ticker": "STRF",
                    "ex_date": today + timedelta(days=105),
                    "dividend_amount": Decimal("0.30"),
                    "pay_date": today + timedelta(days=120),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
            ]
        
        ex_dates = []
        for ex_data in ex_dates_config:
            # Check if ex-date already exists (no user_id check)
            existing = db.query(ExDate).filter(
                ExDate.ticker == ex_data["ticker"],
                ExDate.ex_date == ex_data["ex_date"]
            ).first()
            
            if existing:
                ex_dates.append(existing)
                continue
            
            # Convert Decimal to string for dividend_amount if needed
            ex_data_copy = ex_data.copy()
            if "dividend_amount" in ex_data_copy and isinstance(ex_data_copy["dividend_amount"], Decimal):
                ex_data_copy["dividend_amount"] = str(ex_data_copy["dividend_amount"])
            
            ex_date = ExDate(**ex_data_copy)
            db.add(ex_date)
            ex_dates.append(ex_date)
        
        db.commit()
        for ex_date in ex_dates:
            db.refresh(ex_date)
        
        return ex_dates
    
    @staticmethod
    def create_complete_portfolio(
        db: Session,
        user_email: str = "demo@example.com",
        user_password: str = "demo123",
        overwrite: bool = False
    ) -> Dict:
        """
        Create a complete portfolio with all data for a user.
        This is the main entry point for seeding data.
        
        Args:
            db: Database session
            user_email: User email
            user_password: User password
            overwrite: If True, delete existing user and recreate
        
        Returns:
            Dict with summary of created data
        """
        # Create user
        user = MockDataFactory.create_demo_user(
            db, user_email, user_password, overwrite=overwrite
        )
        
        # Create positions (no brokerages/accounts needed)
        positions = MockDataFactory.create_positions(db, user.id)
        
        # Create dividends
        dividends = MockDataFactory.create_dividends(db, user.id, positions)
        
        # Create ex-dates
        ex_dates = MockDataFactory.create_ex_dates(db, user.id)
        
        return {
            "user": user,
            "positions": positions,
            "dividends": dividends,
            "ex_dates": ex_dates,
            "summary": {
                "user_id": user.id,
                "user_email": user.email,
                "positions_count": len(positions),
                "dividends_count": len(dividends),
                "ex_dates_count": len(ex_dates),
            }
        }

