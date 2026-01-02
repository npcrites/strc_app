# Portfolio Tracking System Implementation

This document describes the implementation of the live portfolio value tracking and historical performance charting system.

## Overview

The system consists of two complementary data layers:

1. **Live Price Data Layer**: Real-time market prices cached in database
2. **Historical Snapshot Layer**: Periodic portfolio snapshots for charting

## Architecture

### Database Schema

#### 1. `asset_prices` Table
- **Purpose**: Cache current market prices for all symbols
- **Primary Key**: `symbol` (unique)
- **Fields**:
  - `symbol`: Stock symbol (e.g., "AAPL")
  - `price`: Current price (NUMERIC 15,4)
  - `updated_at`: Last update timestamp
- **Indexes**: symbol, updated_at

#### 2. `portfolio_snapshots` Table
- **Purpose**: Store historical portfolio-level snapshots
- **Primary Key**: `id`
- **Unique Constraint**: `(user_id, timestamp)` - prevents duplicate snapshots
- **Fields**:
  - `user_id`: Foreign key to users
  - `total_value`: Total portfolio value
  - `cash_balance`: Cash balance
  - `investment_value`: Investment value (total - cash)
  - `timestamp`: Snapshot timestamp
- **Indexes**: (user_id, timestamp) - critical for chart queries

#### 3. `position_snapshots` Table
- **Purpose**: Store position-level details for each portfolio snapshot
- **Primary Key**: `id`
- **Foreign Key**: `portfolio_snapshot_id` (cascade delete)
- **Fields**:
  - `ticker`: Stock symbol
  - `shares`: Number of shares
  - `cost_basis`: Total cost basis
  - `current_value`: Current market value
  - `price_per_share`: Price at snapshot time

### Services

#### PriceService (`app/services/price_service.py`)
- Fetches live prices from Alpaca API
- Caches prices in `asset_prices` table
- Methods:
  - `get_all_active_symbols()`: Get unique symbols from positions
  - `fetch_prices_from_alpaca()`: Fetch prices from Alpaca API
  - `update_price_cache()`: Upsert prices to database
  - `get_price()` / `get_prices()`: Retrieve cached prices
  - `is_price_fresh()`: Check if price is recent (< 5 min)
  - `update_all_prices()`: Full workflow (get symbols → fetch → cache)

#### SnapshotService (`app/services/snapshot_service.py`)
- Creates historical portfolio snapshots
- Methods:
  - `create_portfolio_snapshot()`: Create snapshot for a user
  - `create_snapshots_for_all_users()`: Batch snapshot creation

### Background Jobs

#### PortfolioScheduler (`app/services/portfolio_scheduler.py`)
- Manages two background jobs:
  1. **Price Update Job**: Runs every 10 seconds (configurable)
     - Fetches prices from Alpaca
     - Updates price cache
  2. **Snapshot Creation Job**: Runs every 5 minutes (configurable)
     - Creates portfolio snapshots for all active users

### API Endpoints

#### GET `/api/portfolio/current`
Returns current portfolio value with live prices.

**Response:**
```json
{
  "total_value": 125000.50,
  "investment_value": 120000.00,
  "cash_balance": 5000.50,
  "positions": [
    {
      "ticker": "AAPL",
      "shares": 100.0,
      "cost_basis": 15000.00,
      "current_value": 17500.00,
      "price_per_share": 175.00,
      "unrealized_gain_loss": 2500.00,
      "unrealized_gain_loss_percent": 16.67
    }
  ],
  "last_updated": "2024-01-01T10:00:00Z",
  "price_fresh": true
}
```

#### GET `/api/portfolio/performance?timeframe=1D`
Returns historical performance chart data.

**Query Parameters:**
- `timeframe`: One of `1D`, `1W`, `1M`, `3M`, `YTD`, `ALL`

**Response:**
```json
{
  "timeframe": "1D",
  "data_points": [
    {
      "timestamp": "2024-01-01T09:30:00Z",
      "value": 120000.00
    },
    {
      "timestamp": "2024-01-01T09:35:00Z",
      "value": 120500.00
    }
  ],
  "start_value": 120000.00,
  "current_value": 125000.50,
  "profit_loss": 5000.50,
  "profit_loss_percent": 4.17,
  "data_available": true
}
```

## Configuration

Add to your `.env` file:

```env
# Alpaca API credentials
ALPACA_API_KEY=PK4EMCZWZG1VFHCR8664
ALPACA_SECRET_KEY=your_secret_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Job settings
PRICE_UPDATE_ENABLED=true
PRICE_UPDATE_INTERVAL_SECONDS=10
SNAPSHOT_ENABLED=true
SNAPSHOT_INTERVAL_MINUTES=5
```

## Setup Steps

1. **Run Database Migration**
   ```bash
   cd backend
   source venv/bin/activate
   alembic upgrade head
   ```

2. **Configure Alpaca Credentials**
   - Add `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` to `.env`
   - The API key provided: `PK4EMCZWZG1VFHCR8664`
   - You'll need to get the secret key from your Alpaca account

3. **Start the Server**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

   The scheduler will automatically start and begin:
   - Updating prices every 10 seconds
   - Creating snapshots every 5 minutes

4. **Test the System**
   ```bash
   python scripts/test_portfolio_system.py
   ```

## How It Works

### Price Updates
1. Every 10 seconds, the price update job:
   - Queries all positions with `shares > 0`
   - Extracts unique symbols
   - Fetches latest prices from Alpaca API (batch request)
   - Updates `asset_prices` table (upsert pattern)

### Snapshot Creation
1. Every 5 minutes, the snapshot job:
   - Gets all active users
   - For each user:
     - Queries current positions
     - Gets prices from cache (not Alpaca directly)
     - Calculates total portfolio value
     - Creates `portfolio_snapshot` record
     - Creates `position_snapshot` records for each position

### API Endpoints
- **Current Value**: Queries positions + price cache → calculates on-the-fly
- **Performance Chart**: Queries `portfolio_snapshots` → aggregates into time buckets

## Time Buckets for Charts

- **1D**: 5-minute buckets (288 points max)
- **1W**: 30-minute buckets (336 points max)
- **1M**: 1-hour buckets (~720 points)
- **3M**: 3-hour buckets (~720 points)
- **YTD**: Daily buckets
- **ALL**: Daily buckets

## Error Handling

- **Missing Prices**: Positions without prices are skipped in snapshots
- **API Failures**: Errors are logged, job continues
- **Duplicate Snapshots**: Unique constraint prevents duplicates (within 1 second)
- **Database Errors**: Transactions rollback on failure

## Monitoring

Check logs for:
- Price update success/failure counts
- Snapshot creation statistics
- API errors
- Job execution times

## Performance Considerations

- **Database Indexes**: Critical indexes on (user_id, timestamp) for fast chart queries
- **Batch Operations**: Prices fetched in batches of 100 symbols
- **Caching**: Prices cached in database to avoid repeated API calls
- **Aggregation**: Chart data aggregated in Python (consider PostgreSQL `date_trunc` for production)

## Future Enhancements

- [ ] WebSocket support for true real-time prices
- [ ] PostgreSQL `date_trunc` for more efficient aggregation
- [ ] Response caching for chart endpoints
- [ ] Market hours detection (pause jobs after hours)
- [ ] Data retention policies (aggregate old snapshots)
- [ ] Force refresh endpoint for manual snapshots

## Troubleshooting

### Prices not updating
- Check Alpaca API credentials in `.env`
- Verify `PRICE_UPDATE_ENABLED=true`
- Check logs for API errors
- Verify positions exist with `shares > 0`

### Snapshots not creating
- Check `SNAPSHOT_ENABLED=true`
- Verify users have positions
- Check logs for errors
- Verify price cache has data

### Chart data empty
- Ensure snapshots have been created (wait 5+ minutes)
- Check that user has positions
- Verify time range has data

### API errors
- Check Alpaca API rate limits (200 req/min default)
- Verify network connectivity
- Check API credentials are valid

