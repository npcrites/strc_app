# Plaid Setup Guide

## Environment Variables

Create a `.env` file in the `backend` directory with the following variables:

```env
# Plaid Configuration
PLAID_CLIENT_ID=6952cecf168aa50020a8c16a
PLAID_SECRET=108b8a7a5be3ab3913904e606b83c9
PLAID_ENV=sandbox
```

## API Endpoints for Trading Data

### 1. Create Link Token
**POST** `/api/users/plaid/link`

Creates a Plaid Link token for connecting accounts. Returns a `link_token` that can be used with Plaid Link on the frontend.

### 2. Exchange Public Token
**POST** `/api/users/plaid/exchange`
- Body: `{"public_token": "public-sandbox-..."}`

Exchanges the public token from Plaid Link for an access token. Store this access token securely.

### 3. Get Investment Holdings
**GET** `/api/users/plaid/investment-holdings?access_token={access_token}`

Returns current investment positions including:
- Accounts
- Holdings (positions with quantities)
- Securities (stock information with ticker symbols)

### 4. Get Investment Transactions
**GET** `/api/users/plaid/investment-transactions?access_token={access_token}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}`

Returns trading transactions (buys, sells, dividends, etc.) for a date range.

### 5. Get Regular Transactions
**GET** `/api/users/plaid/transactions?access_token={access_token}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}`

Returns regular bank transactions.

### 6. Sync Transactions
**POST** `/api/users/plaid/sync-transactions`
- Body: `{"access_token": "...", "cursor": null}`

Uses Plaid's sync API for efficient transaction updates. Returns added, modified, and removed transactions.

## Example Usage

### Python Example

```python
from app.services.plaid_service import PlaidService
from datetime import date, timedelta

plaid = PlaidService()

# Get investment holdings
holdings = plaid.get_investment_holdings("access-sandbox-...")
print(f"Found {len(holdings['holdings'])} positions")

# Get trading transactions for last 30 days
end_date = date.today()
start_date = end_date - timedelta(days=30)
transactions = plaid.get_investment_transactions(
    "access-sandbox-...",
    start_date,
    end_date
)
print(f"Found {len(transactions)} trading transactions")
```

## Sandbox Testing

In sandbox mode, you can use test credentials:
- Username: `user_good`
- Password: `pass_good`

Plaid sandbox provides sample investment accounts with holdings and transactions for testing.

## Security Notes

- Never commit `.env` files to version control
- Store access tokens encrypted in the database
- Use HTTPS in production
- Rotate secrets regularly

