"""
Optional script to seed the database with sample data
"""
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app.db.session import SessionLocal
from app.db.base import Base
from app.models.user import User
from app.models.position import Position
from app.models.dividend import Dividend
from app.core.security import get_password_hash
from datetime import datetime, date, timedelta
from decimal import Decimal


def seed_database():
    """Seed database with sample data"""
    db = SessionLocal()
    
    try:
        # Create sample user
        user = User(
            email="demo@example.com",
            hashed_password=get_password_hash("demo123"),
            full_name="Demo User",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        print(f"Created user: {user.email}")
        
        # Create sample positions
        positions_data = [
            {
                "symbol": "AAPL",
                "quantity": Decimal("10.0"),
                "average_cost": Decimal("150.00"),
                "current_price": Decimal("175.00"),
            },
            {
                "symbol": "MSFT",
                "quantity": Decimal("5.0"),
                "average_cost": Decimal("300.00"),
                "current_price": Decimal("350.00"),
            },
            {
                "symbol": "GOOGL",
                "quantity": Decimal("3.0"),
                "average_cost": Decimal("120.00"),
                "current_price": Decimal("140.00"),
            },
        ]
        
        positions = []
        for pos_data in positions_data:
            position = Position(
                user_id=user.id,
                **pos_data
            )
            db.add(position)
            positions.append(position)
        
        db.commit()
        
        for position in positions:
            db.refresh(position)
            print(f"Created position: {position.symbol} ({position.quantity} shares)")
        
        # Create sample dividends
        dividends_data = [
            {
                "position_id": positions[0].id,
                "symbol": "AAPL",
                "amount": Decimal("24.00"),
                "quantity": Decimal("10.0"),
                "dividend_per_share": Decimal("0.24"),
                "ex_date": date.today() - timedelta(days=30),
                "payment_date": date.today() - timedelta(days=20),
            },
            {
                "position_id": positions[0].id,
                "symbol": "AAPL",
                "amount": Decimal("24.00"),
                "quantity": Decimal("10.0"),
                "dividend_per_share": Decimal("0.24"),
                "ex_date": date.today() - timedelta(days=90),
                "payment_date": date.today() - timedelta(days=80),
            },
            {
                "position_id": positions[1].id,
                "symbol": "MSFT",
                "amount": Decimal("37.50"),
                "quantity": Decimal("5.0"),
                "dividend_per_share": Decimal("0.75"),
                "ex_date": date.today() - timedelta(days=45),
                "payment_date": date.today() - timedelta(days=35),
            },
        ]
        
        for div_data in dividends_data:
            dividend = Dividend(
                user_id=user.id,
                **div_data
            )
            db.add(dividend)
        
        db.commit()
        print("Created sample dividends")
        
        print("\n✅ Database seeded successfully!")
        print(f"Login with: demo@example.com / demo123")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding database with sample data...")
    seed_database()


