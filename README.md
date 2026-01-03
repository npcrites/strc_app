# STRC Tracker

A comprehensive stock position and dividend tracking application with Plaid integration.

## Project Structure

```
strc_tracker/
├── backend/          # FastAPI backend
├── DashboardApp/    # React Native + Expo mobile app (TypeScript)
└── scripts/          # Utility scripts
```

## Features

- **Position Tracking**: Track your stock positions with cost basis and current values
- **Dividend Management**: Record and track dividend payments
- **Total Return Calculation**: Calculate total returns including dividends and capital gains
- **Ex-Dividend Date Tracking**: Get notified about upcoming ex-dividend dates
- **Plaid Integration**: Connect bank accounts via Plaid for automatic transaction syncing
- **Mobile App**: React Native app for iOS and Android

## Backend Setup

For detailed backend setup instructions, see **[backend/README.md](backend/README.md)**.

**Quick Overview:**
1. Install dependencies: `pip install -r requirements.txt`
2. Configure environment: Create `.env` file with database and API credentials
3. Setup database: Run migrations with `alembic upgrade head`
4. Start server: `./start_server.sh` or `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`

API documentation: `http://localhost:8000/docs` (when server is running)

## Mobile App Setup

For detailed mobile app setup instructions, see **[DashboardApp/README.md](DashboardApp/README.md)**.

**Quick Overview:**
1. Install dependencies: `npm install`
2. Start Expo: `npm start`
3. Run on iOS: `npm run ios` or press `i` in Expo terminal
4. Run on Android: `npm run android` or press `a` in Expo terminal

**Note:** Make sure the backend server is running before starting the mobile app.

## Documentation

### Main Documentation
- **[backend/README.md](backend/README.md)** - Backend setup, configuration, and development guide
- **[DashboardApp/README.md](DashboardApp/README.md)** - Mobile app setup and troubleshooting

### Backend Documentation
See [backend/README.md#documentation](backend/README.md#documentation) for a complete list, including:
- Backend structure and architecture
- Database migrations and troubleshooting
- Portfolio tracking implementation
- Component-specific documentation (models, services, scripts)

## Docker

See **[backend/README.md#deployment](backend/README.md#deployment)** for Docker deployment instructions.

## API Endpoints

### Authentication
- `POST /api/users/register` - Register a new user
- `POST /api/users/login` - Login and get access token
- `GET /api/users/me` - Get current user info

### Positions
- `GET /api/positions` - Get all positions
- `GET /api/positions/{id}` - Get a specific position
- `POST /api/positions` - Create a new position
- `PUT /api/positions/{id}` - Update a position
- `DELETE /api/positions/{id}` - Delete a position

### Dividends
- `GET /api/dividends` - Get all dividends
- `GET /api/dividends/{id}` - Get a specific dividend
- `GET /api/dividends/upcoming/ex-dates` - Get upcoming ex-dividend dates
- `GET /api/dividends/summary/total-return` - Get total return calculation
- `POST /api/dividends` - Create a dividend record

### Plaid
- `POST /api/users/plaid/link` - Create Plaid Link token
- `POST /api/users/plaid/exchange` - Exchange public token for access token
- `GET /api/users/plaid/accounts` - Get linked Plaid accounts

## Testing

Run backend tests:
```bash
cd backend
pytest
```

## Development

### Backend

- FastAPI for the API framework
- SQLAlchemy for ORM
- Alembic for database migrations
- JWT for authentication
- Plaid Python SDK for bank integration

### Mobile

- React Native with Expo
- TypeScript for type safety
- React Navigation (Bottom Tabs) for routing
- Context API for authentication and state management
- AsyncStorage for token storage
- Victory Native for data visualization

## License

MIT


