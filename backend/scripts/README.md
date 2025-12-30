# Mock Data Scripts

This directory contains scripts for generating standardized mock data for development and testing.

## Quick Start

### Seed Demo User Data

To seed the database with a complete demo portfolio:

```bash
cd backend
python scripts/seed_sample_data.py
```

This will create:
- Demo user: `demo@example.com` / `demo123`
- 2 brokerages (Fidelity, Schwab)
- 3 accounts (IRA, Brokerage, 401k)
- 6 positions (STRC, SATA, MSTR-A, AAPL, MSFT)
- Multiple dividends (paid and upcoming)
- Ex-dates for upcoming dividends

### Overwrite Existing Data

To delete and recreate the demo user (WARNING: This deletes all user data):

```bash
python scripts/seed_sample_data.py --overwrite
```

## MockDataFactory

The `MockDataFactory` class provides a standardized way to create mock data programmatically.

### Usage in Code

```python
from scripts.mock_data_factory import MockDataFactory
from app.db.session import SessionLocal

db = SessionLocal()

# Create complete portfolio
result = MockDataFactory.create_complete_portfolio(
    db,
    user_email="demo@example.com",
    user_password="demo123"
)

# Or create individual components
user = MockDataFactory.create_demo_user(db, "test@example.com", "password123")
brokerages = MockDataFactory.create_brokerages(db, user.id)
accounts = MockDataFactory.create_accounts(db, user.id, brokerages)
positions = MockDataFactory.create_positions(db, user.id, accounts)
dividends = MockDataFactory.create_dividends(db, user.id, positions)
ex_dates = MockDataFactory.create_ex_dates(db, user.id)
```

### Features

- **Idempotent**: Running the same script multiple times won't create duplicates
- **Configurable**: All methods accept custom configuration
- **Reusable**: Can be used in tests, seed scripts, and development tools
- **Safe**: Checks for existing data before creating new records

### Customizing Mock Data

You can customize the mock data by passing configuration dictionaries:

```python
# Custom positions
positions_config = [
    {
        "account_id": account.id,
        "ticker": "CUSTOM",
        "name": "Custom Stock",
        "shares": Decimal("100.000000"),
        "cost_basis": Decimal("10000.00"),
        "market_value": Decimal("11000.00"),
        "asset_type": "common_stock"
    }
]

positions = MockDataFactory.create_positions(
    db, user.id, accounts, positions_config=positions_config
)
```

## Architecture

```
scripts/
├── mock_data_factory.py    # Reusable factory class
├── seed_sample_data.py     # CLI script for seeding
└── README.md               # This file
```

## Safety Checks

The seed script includes safety checks:
- ✅ Verifies database is not production
- ✅ Confirms localhost connection
- ✅ Checks for existing data before creating
- ✅ Provides clear error messages

## Demo User Credentials

After seeding, you can log in with:
- **Email**: `demo@example.com`
- **Password**: `demo123`

## Future Enhancements

The factory can be extended to support:
- Multiple users with different portfolio configurations
- Historical data generation
- Realistic market data simulation
- Custom asset types and tickers
