# Database Models

SQLAlchemy ORM models for the STRC Tracker MVP fintech application.

## Models Overview

### 1. User
- **Purpose**: User authentication and profile management
- **Key Fields**: `id`, `email`, `hashed_password`, `plaid_access_token`, `is_active`
- **Relationships**: 
  - One-to-many: Brokerages, Accounts, Positions, Dividends, ExDates
- **Indexes**: `id`, `email`, `user_id`

### 2. Brokerage
- **Purpose**: Track user's brokerage institutions (Fidelity, Schwab, etc.)
- **Key Fields**: `id`, `user_id`, `name`
- **Relationships**:
  - Many-to-one: User
  - One-to-many: Accounts
- **Indexes**: `id`, `user_id`

### 3. Account
- **Purpose**: Financial accounts linked via Plaid
- **Key Fields**: `id`, `user_id`, `brokerage_id`, `plaid_account_id`, `name`, `type`, `subtype`, `balance`
- **Relationships**:
  - Many-to-one: User, Brokerage
  - One-to-many: Positions
- **Indexes**: `id`, `user_id`, `brokerage_id`

### 4. Position
- **Purpose**: Stock/investment positions with historical snapshots
- **Key Fields**: `id`, `user_id`, `account_id`, `ticker`, `name`, `shares`, `cost_basis`, `market_value`, `asset_type`, `snapshot_timestamp`
- **Relationships**:
  - Many-to-one: User, Account
  - One-to-many: Dividends
- **Indexes**: `id`, `user_id`, `account_id`, `ticker`, `snapshot_timestamp`
- **Properties**: 
  - `average_cost_per_share`
  - `current_price_per_share`
  - `unrealized_gain_loss`
  - `unrealized_gain_loss_percent`

### 5. Dividend
- **Purpose**: Track dividend payments and upcoming dividends
- **Key Fields**: `id`, `user_id`, `position_id`, `ticker`, `amount`, `pay_date`, `status`, `dividend_per_share`, `ex_date`
- **Relationships**:
  - Many-to-one: User, Position
- **Indexes**: `id`, `user_id`, `ticker`, `pay_date`, `status`
- **Status Values**: `"upcoming"`, `"paid"`

### 6. ExDate
- **Purpose**: Track ex-dividend dates for securities
- **Key Fields**: `id`, `user_id`, `ticker`, `ex_date`, `dividend_amount`, `pay_date`
- **Relationships**:
  - Many-to-one: User
- **Indexes**: `id`, `user_id`, `ticker`, `ex_date`
- **Constraints**: Unique constraint on `(user_id, ticker, ex_date)`

## Database Schema Features

### Indexes
All tables have indexes on:
- Primary keys (`id`)
- Foreign keys (`user_id`, `account_id`, `brokerage_id`, `position_id`)
- Search fields (`ticker` for Positions, Dividends, ExDates)
- Date fields (`ex_date`, `pay_date`, `snapshot_timestamp`)

### Relationships
- **Cascade Deletes**: All child relationships cascade delete when parent is deleted
- **Foreign Keys**: All foreign keys use `ondelete="CASCADE"` for data integrity

### Data Types
- **Financial Data**: Uses `Numeric(15, 6)` for shares and `Numeric(15, 2)` for monetary values
- **Timestamps**: All tables include `created_at` and `updated_at`
- **Historical Tracking**: Positions include `snapshot_timestamp` for historical snapshots

### Constraints
- **Unique Constraints**: 
  - Users: `email`
  - Accounts: `plaid_account_id`
  - ExDates: `(user_id, ticker, ex_date)`

## Usage Example

```python
from app.models import User, Brokerage, Account, Position, Dividend, ExDate
from app.db.session import SessionLocal

db = SessionLocal()

# Create a user
user = User(
    email="user@example.com",
    hashed_password="hashed_password_here"
)
db.add(user)
db.commit()

# Create a brokerage
brokerage = Brokerage(
    user_id=user.id,
    name="Fidelity"
)
db.add(brokerage)
db.commit()

# Create an account
account = Account(
    user_id=user.id,
    brokerage_id=brokerage.id,
    name="IRA Account",
    type="investment",
    subtype="ira",
    balance=100000.00
)
db.add(account)
db.commit()

# Create a position
position = Position(
    user_id=user.id,
    account_id=account.id,
    ticker="STRC",
    name="Starco Preferred Stock",
    shares=100.0,
    cost_basis=10000.00,
    market_value=10500.00,
    asset_type="preferred_stock"
)
db.add(position)
db.commit()

# Create an ex-date
ex_date = ExDate(
    user_id=user.id,
    ticker="STRC",
    ex_date=date(2025, 1, 15),
    dividend_amount="0.25",
    pay_date=date(2025, 1, 30)
)
db.add(ex_date)
db.commit()

# Create a dividend
dividend = Dividend(
    user_id=user.id,
    position_id=position.id,
    ticker="STRC",
    amount=25.00,
    pay_date=date(2025, 1, 30),
    status=DividendStatus.UPCOMING,
    dividend_per_share=0.25,
    shares_at_ex_date=100.0
)
db.add(dividend)
db.commit()
```

## Migration

To create database tables, use Alembic:

```bash
# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Apply migration
alembic upgrade head
```

