# Backend Scripts

Utility scripts for testing and development.

## Available Scripts

### `fetch_investment_data.py`

Fetches and displays sample investment data from Plaid Sandbox.

**Usage:**
```bash
cd backend
python scripts/fetch_investment_data.py
```

**What it does:**
1. Creates a sandbox Plaid item with investment accounts
2. Fetches and displays:
   - Investment accounts (IRA, 401k, etc.)
   - Securities (stocks, ETFs, mutual funds, etc.)
   - Current holdings with quantities and values
   - Investment transactions (buys, sells, dividends, etc.)

**Output includes:**
- Account list with types
- Securities with ticker symbols and prices
- Holdings with cost basis and current values
- Transaction history with types and amounts
- Portfolio summary

**Example output:**
```
📊 Accounts (12):
  • Plaid IRA (investment)
  • Plaid 401k (investment)
  ...

💼 Securities (13):
  • AAPL   | Apple Inc.                    | equity    | $150.00
  ...

📈 Holdings (13):
  • AAPL   | Apple Inc. | Qty: 10.0000 | Cost: $1,500.00 | Value: $1,500.00
  ...

💰 Total Portfolio Value: $25,446.39
```

## Running Tests

### Connection Test
```bash
python -m tests.test_plaid_connection
```

### Plaid Service Tests
```bash
pytest tests/test_plaid_service.py -v
```

## Notes

- All scripts use the `.env` file for Plaid credentials
- Sandbox environment is used by default
- Scripts are for development/testing purposes only

