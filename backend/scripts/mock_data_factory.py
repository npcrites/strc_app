"""
Standardized mock data factory for development and testing.

This module provides a reusable way to generate mock data for the application.
It can be used by seed scripts, tests, and development tools.
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from app.models import User, Brokerage, Account, Position, Dividend, ExDate
from app.models.dividend import DividendStatus
from app.core.security import get_password_hash


class MockDataFactory:
    """Factory for creating standardized mock data"""
    
    @staticmethod
    def create_demo_user(
        db: Session,
        email: str = "demo@example.com",
        password: str = "demo123",
        full_name: str = "Demo User",
        overwrite: bool = False
    ) -> User:
        """
        Create or get demo user.
        
        Args:
            db: Database session
            email: User email
            password: User password (will be hashed)
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
            hashed_password=get_password_hash(password),
            full_name=full_name,
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    
    @staticmethod
    def create_brokerages(
        db: Session,
        user_id: int,
        names: Optional[List[str]] = None
    ) -> List[Brokerage]:
        """
        Create brokerages for a user.
        
        Args:
            db: Database session
            user_id: User ID
            names: List of brokerage names (default: ["Fidelity Investments", "Charles Schwab"])
        
        Returns:
            List of Brokerage objects
        """
        if names is None:
            names = ["Fidelity Investments", "Charles Schwab"]
        
        brokerages = []
        for name in names:
            # Check if brokerage already exists
            existing = db.query(Brokerage).filter(
                Brokerage.user_id == user_id,
                Brokerage.name == name
            ).first()
            
            if existing:
                brokerages.append(existing)
                continue
            
            brokerage = Brokerage(
                user_id=user_id,
                name=name
            )
            db.add(brokerage)
            brokerages.append(brokerage)
        
        db.commit()
        for brokerage in brokerages:
            db.refresh(brokerage)
        
        return brokerages
    
    @staticmethod
    def create_accounts(
        db: Session,
        user_id: int,
        brokerages: List[Brokerage],
        accounts_config: Optional[List[Dict]] = None
    ) -> List[Account]:
        """
        Create accounts for a user.
        
        Args:
            db: Database session
            user_id: User ID
            brokerages: List of Brokerage objects
            accounts_config: List of account config dicts (if None, uses defaults)
        
        Returns:
            List of Account objects
        """
        if accounts_config is None:
            accounts_config = [
                {
                    "brokerage_id": brokerages[0].id,
                    "plaid_account_id": "acc_sample_fidelity_ira",
                    "name": "Fidelity IRA",
                    "type": "investment",
                    "subtype": "ira",
                    "balance": Decimal("250000.00")
                },
                {
                    "brokerage_id": brokerages[0].id,
                    "plaid_account_id": "acc_sample_fidelity_brokerage",
                    "name": "Fidelity Brokerage Account",
                    "type": "investment",
                    "subtype": "brokerage",
                    "balance": Decimal("150000.00")
                },
                {
                    "brokerage_id": brokerages[1].id,
                    "plaid_account_id": "acc_sample_schwab_401k",
                    "name": "Schwab 401(k)",
                    "type": "investment",
                    "subtype": "401k",
                    "balance": Decimal("400000.00")
                },
            ]
        
        accounts = []
        for acc_data in accounts_config:
            # Check if account already exists
            existing = db.query(Account).filter(
                Account.user_id == user_id,
                Account.plaid_account_id == acc_data["plaid_account_id"]
            ).first()
            
            if existing:
                accounts.append(existing)
                continue
            
            account = Account(
                user_id=user_id,
                **acc_data
            )
            db.add(account)
            accounts.append(account)
        
        db.commit()
        for account in accounts:
            db.refresh(account)
        
        return accounts
    
    @staticmethod
    def create_positions(
        db: Session,
        user_id: int,
        accounts: List[Account],
        positions_config: Optional[List[Dict]] = None
    ) -> List[Position]:
        """
        Create positions for a user.
        
        Args:
            db: Database session
            user_id: User ID
            accounts: List of Account objects
            positions_config: List of position config dicts (if None, uses defaults)
        
        Returns:
            List of Position objects
        """
        if positions_config is None:
            positions_config = [
                {
                    "account_id": accounts[0].id,
                    "ticker": "STRC",
                    "name": "Starco Preferred Stock",
                    "shares": Decimal("500.000000"),
                    "cost_basis": Decimal("50000.00"),
                    "market_value": Decimal("52500.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "account_id": accounts[0].id,
                    "ticker": "SATA",
                    "name": "Sata Preferred Stock",
                    "shares": Decimal("250.000000"),
                    "cost_basis": Decimal("25000.00"),
                    "market_value": Decimal("26250.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "account_id": accounts[0].id,
                    "ticker": "MSTR-A",
                    "name": "MicroStrategy Preferred Series A",
                    "shares": Decimal("125.000000"),
                    "cost_basis": Decimal("12500.00"),
                    "market_value": Decimal("13125.00"),
                    "asset_type": "preferred_stock"
                },
                {
                    "account_id": accounts[1].id,
                    "ticker": "AAPL",
                    "name": "Apple Inc.",
                    "shares": Decimal("200.000000"),
                    "cost_basis": Decimal("30000.00"),
                    "market_value": Decimal("35000.00"),
                    "asset_type": "common_stock"
                },
                {
                    "account_id": accounts[1].id,
                    "ticker": "MSFT",
                    "name": "Microsoft Corporation",
                    "shares": Decimal("100.000000"),
                    "cost_basis": Decimal("30000.00"),
                    "market_value": Decimal("35000.00"),
                    "asset_type": "common_stock"
                },
                {
                    "account_id": accounts[2].id,
                    "ticker": "STRC",
                    "name": "Starco Preferred Stock",
                    "shares": Decimal("1000.000000"),
                    "cost_basis": Decimal("100000.00"),
                    "market_value": Decimal("105000.00"),
                    "asset_type": "preferred_stock"
                },
            ]
        
        positions = []
        for pos_data in positions_config:
            # Check if position already exists (by ticker and account)
            existing = db.query(Position).filter(
                Position.user_id == user_id,
                Position.account_id == pos_data["account_id"],
                Position.ticker == pos_data["ticker"]
            ).first()
            
            if existing:
                # Update existing position
                for key, value in pos_data.items():
                    if key != "account_id":  # Don't update account_id
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
            # Generate dividends based on positions
            dividends_config = []
            
            # Find STRC positions
            strc_positions = [p for p in positions if p.ticker == "STRC"]
            for pos in strc_positions:
                # Past dividend
                dividends_config.append({
                    "position_id": pos.id,
                    "ticker": "STRC",
                    "amount": Decimal("1250.0000") * (pos.shares / 500),  # Scaled for larger positions
                    "pay_date": today - timedelta(days=30),
                    "status": DividendStatus.PAID,
                    "dividend_per_share": Decimal("2.5000"),
                    "shares_at_ex_date": pos.shares,
                    "ex_date": today - timedelta(days=45),
                    "source": "manual"
                })
                # Upcoming dividend
                dividends_config.append({
                    "position_id": pos.id,
                    "ticker": "STRC",
                    "amount": Decimal("1250.0000") * (pos.shares / 500),
                    "pay_date": today + timedelta(days=30),
                    "status": DividendStatus.UPCOMING,
                    "dividend_per_share": Decimal("2.5000"),
                    "shares_at_ex_date": pos.shares,
                    "ex_date": today + timedelta(days=15),
                    "source": "manual"
                })
            
            # Find SATA positions
            sata_positions = [p for p in positions if p.ticker == "SATA"]
            for pos in sata_positions:
                dividends_config.append({
                    "position_id": pos.id,
                    "ticker": "SATA",
                    "amount": Decimal("625.0000") * (pos.shares / 250),
                    "pay_date": today - timedelta(days=20),
                    "status": DividendStatus.PAID,
                    "dividend_per_share": Decimal("2.5000"),
                    "shares_at_ex_date": pos.shares,
                    "ex_date": today - timedelta(days=35),
                    "source": "manual"
                })
            
            # Find MSTR-A positions
            mstr_positions = [p for p in positions if p.ticker == "MSTR-A"]
            for pos in mstr_positions:
                dividends_config.append({
                    "position_id": pos.id,
                    "ticker": "MSTR-A",
                    "amount": Decimal("312.5000") * (pos.shares / 125),
                    "pay_date": today + timedelta(days=45),
                    "status": DividendStatus.UPCOMING,
                    "dividend_per_share": Decimal("2.5000"),
                    "shares_at_ex_date": pos.shares,
                    "ex_date": today + timedelta(days=30),
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
        user_id: int,
        ex_dates_config: Optional[List[Dict]] = None
    ) -> List[ExDate]:
        """
        Create ex-dates for tickers.
        
        Args:
            db: Database session
            user_id: User ID
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
                    "dividend_amount": Decimal("2.5000"),
                    "pay_date": today + timedelta(days=30),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
                {
                    "ticker": "SATA",
                    "ex_date": today + timedelta(days=60),
                    "dividend_amount": Decimal("2.5000"),
                    "pay_date": today + timedelta(days=75),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
                {
                    "ticker": "MSTR-A",
                    "ex_date": today + timedelta(days=30),
                    "dividend_amount": Decimal("2.5000"),
                    "pay_date": today + timedelta(days=45),
                    "source": "manual",
                    "notes": "Quarterly dividend"
                },
            ]
        
        ex_dates = []
        for ex_data in ex_dates_config:
            # Check if ex-date already exists
            existing = db.query(ExDate).filter(
                ExDate.user_id == user_id,
                ExDate.ticker == ex_data["ticker"],
                ExDate.ex_date == ex_data["ex_date"]
            ).first()
            
            if existing:
                ex_dates.append(existing)
                continue
            
            ex_date = ExDate(
                user_id=user_id,
                **ex_data
            )
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
        
        # Create brokerages
        brokerages = MockDataFactory.create_brokerages(db, user.id)
        
        # Create accounts
        accounts = MockDataFactory.create_accounts(db, user.id, brokerages)
        
        # Create positions
        positions = MockDataFactory.create_positions(db, user.id, accounts)
        
        # Create dividends
        dividends = MockDataFactory.create_dividends(db, user.id, positions)
        
        # Create ex-dates
        ex_dates = MockDataFactory.create_ex_dates(db, user.id)
        
        return {
            "user": user,
            "brokerages": brokerages,
            "accounts": accounts,
            "positions": positions,
            "dividends": dividends,
            "ex_dates": ex_dates,
            "summary": {
                "user_id": user.id,
                "user_email": user.email,
                "brokerages_count": len(brokerages),
                "accounts_count": len(accounts),
                "positions_count": len(positions),
                "dividends_count": len(dividends),
                "ex_dates_count": len(ex_dates),
            }
        }

