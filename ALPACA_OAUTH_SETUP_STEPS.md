# Alpaca OAuth Setup Steps

## Step 1: Register OAuth App in Alpaca

1. Go to [Alpaca Developer Dashboard](https://app.alpaca.markets/dashboard/developers/apps)
2. Click "Create New App" or find your existing app
3. Fill in the app details:
   - **App Name**: STRC Tracker (or your preferred name)
   - **Redirect URI**: `http://localhost:8000/api/users/auth/alpaca/callback`
   - **Scopes**: Select `trading` and `account:write`
4. Save the app
5. Copy the **Client ID** and **Client Secret** (you already have these)

**Important**: Make sure the redirect URI matches exactly: `http://localhost:8000/api/users/auth/alpaca/callback`

## Step 2: Verify Your Credentials

Your current credentials:
- Client ID: `PK3AYWRIKB2VIM3P4YRKBZUOPJ`
- Client Secret: `9GyHutd3fAucj4f1ihQDRciSoiu7jv9LgqJCBT6Q4ZSU`
- Redirect URI: `http://localhost:8000/api/users/auth/alpaca/callback`

Make sure these match what's in your Alpaca developer dashboard.

## Step 3: Set Up Deep Linking (For React Native)

The backend will redirect to `strctracker://auth/callback?token=...` after OAuth completes.

You need to configure your React Native app to handle this URL scheme.

### For Expo/React Native:

Add to `app.json`:

```json
{
  "expo": {
    "scheme": "strctracker",
    ...
  }
}
```

This will automatically configure deep linking for both iOS and Android.

## Step 4: Test the Flow

1. Click "Login with Alpaca" in your app
2. Browser opens to Alpaca authorization page
3. Authorize the app
4. Alpaca redirects to your backend callback
5. Backend exchanges code for tokens
6. Backend redirects to `strctracker://auth/callback?token=...`
7. App opens and handles the token

## Troubleshooting

- **"Unknown client" error**: App not registered or client_id doesn't match
- **"Invalid redirect_uri"**: Redirect URI not whitelisted in Alpaca dashboard
- **Deep link not working**: Make sure `scheme` is set in `app.json` and app is rebuilt

