# Alpaca OAuth2 Implementation

This document describes the Alpaca OAuth2 authentication implementation that replaces password-based authentication.

## What Changed

### 1. User Model (`app/models/user.py`)
- **Removed**: `hashed_password` field
- **Changed**: `email` is now nullable (users authenticate via Alpaca)
- **Added**: Alpaca OAuth fields:
  - `alpaca_access_token` - OAuth access token (stored as Text)
  - `alpaca_refresh_token` - OAuth refresh token
  - `alpaca_token_expires_at` - Token expiration timestamp
  - `alpaca_account_id` - Unique Alpaca account ID (indexed)
  - `alpaca_account_number` - Account number from Alpaca
  - `alpaca_account_status` - Account status (e.g., "ACTIVE")
  - `alpaca_currency` - Account currency (default: "USD")
  - `alpaca_trading_blocked` - Whether trading is blocked
  - `alpaca_portfolio_created_at` - When the account was created

### 2. Configuration (`app/core/config.py`)
Added OAuth settings:
- `ALPACA_CLIENT_ID` - OAuth client ID from Alpaca
- `ALPACA_CLIENT_SECRET` - OAuth client secret
- `ALPACA_REDIRECT_URI` - Callback URL (default: `http://localhost:8000/api/users/auth/alpaca/callback`)
- `ALPACA_OAUTH_BASE_URL` - OAuth base URL (default: `https://app.alpaca.markets` for paper trading)

### 3. New Services
- **`app/services/alpaca_oauth_service.py`**: Handles OAuth2 flow
  - `get_authorization_url()` - Generate OAuth authorization URL
  - `exchange_code_for_tokens()` - Exchange auth code for access/refresh tokens
  - `refresh_access_token()` - Refresh expired tokens

- **`app/services/alpaca_trading_service.py`**: Makes API calls to Alpaca Trading API
  - `get_account()` - Get account information
  - `get_positions()` - Get positions
  - `get_position()` - Get specific position
  - `place_market_buy_order()` - Place buy orders

### 4. API Routes (`app/api/routes/users.py`)
- **Removed**: `/register` and `/login` endpoints (password-based)
- **Added**:
  - `GET /api/users/auth/alpaca/authorize?env=paper` - Start OAuth flow (redirects to Alpaca)
  - `GET /api/users/auth/alpaca/callback` - OAuth callback handler
  - `GET /api/users/me` - Updated to return Alpaca account info

### 5. Security (`app/core/security.py`)
- **Removed**: Password hashing functions (`verify_password`, `get_password_hash`)
- **Kept**: JWT token creation and validation (still used for our API authentication)

### 6. Database Migration
- **File**: `app/db/migrations/versions/004_add_alpaca_oauth_fields.py`
- Drops `hashed_password` column
- Makes `email` nullable
- Adds all Alpaca OAuth fields
- Creates index on `alpaca_account_id`

## Setup Instructions

### 1. Get Alpaca OAuth Credentials
1. Go to [Alpaca Dashboard](https://app.alpaca.markets/)
2. Register your application to get `client_id` and `client_secret`
3. Set redirect URI to: `http://localhost:8000/api/users/auth/alpaca/callback`

### 2. Update `.env` File
Add these variables to your `.env` file:
```env
ALPACA_CLIENT_ID=your_client_id_here
ALPACA_CLIENT_SECRET=your_client_secret_here
ALPACA_REDIRECT_URI=http://localhost:8000/api/users/auth/alpaca/callback
ALPACA_OAUTH_BASE_URL=https://app.alpaca.markets  # Paper trading
```

For production/live trading, use:
```env
ALPACA_OAUTH_BASE_URL=https://alpaca.markets
```

### 3. Run Database Migration
```bash
cd backend
python3 -m alembic upgrade head
```

**Note**: This will:
- Drop the `hashed_password` column (existing users will need to re-authenticate via OAuth)
- Make `email` nullable
- Add Alpaca OAuth fields

### 4. Test the OAuth Flow

1. **Start your server**:
   ```bash
   uvicorn app.main:app --reload
   ```

2. **Initiate OAuth flow**:
   Visit in browser:
   ```
   http://localhost:8000/api/users/auth/alpaca/authorize?env=paper
   ```
   
   This will redirect you to Alpaca's authorization page.

3. **Authorize the app**:
   - Login to Alpaca
   - Grant permissions (trading, account:write)
   - You'll be redirected back to your callback URL

4. **Callback handling**:
   - The callback endpoint exchanges the code for tokens
   - Creates/updates user in database
   - Redirects to frontend with JWT token
   - Default frontend URL: `http://localhost:3000/auth/callback?token=...`

5. **Verify authentication**:
   ```bash
   # Use the JWT token from the callback
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:8000/api/users/me
   ```

## OAuth Flow

Based on [Alpaca OAuth2 Documentation](https://docs.alpaca.markets/docs/using-oauth2-and-trading-api):

1. **User requests authorization**: `GET /api/users/auth/alpaca/authorize`
2. **User authorizes on Alpaca**: Redirected to Alpaca login/consent screen
3. **Alpaca redirects with code**: `GET /api/users/auth/alpaca/callback?code=...&state=...`
4. **Exchange code for tokens**: Backend exchanges code for access/refresh tokens
5. **Get account info**: Backend calls Alpaca API to get account details
6. **Create/update user**: Store tokens and account info in database
7. **Return JWT token**: User receives JWT token for our API

## Important Notes

- **Token Storage**: OAuth tokens are stored in plain text. For production, encrypt them at rest.
- **State Management**: OAuth state is stored in-memory. For production, use Redis or database.
- **Frontend URL**: The callback redirects to `http://localhost:3000/auth/callback`. Update this in `users.py` if needed.
- **Environment**: Use `env=paper` for paper trading, `env=live` for live trading, or omit for both.
- **Existing Users**: Users with password authentication will need to re-authenticate via OAuth after migration.

## Next Steps

After OAuth is working:
1. Implement token refresh logic (tokens expire)
2. Encrypt tokens at rest (production)
3. Use Redis/database for OAuth state (production)
4. Implement auto-buyer background task
5. Add Plaid integration for bank balance visibility

