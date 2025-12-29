# STRC Tracker

A comprehensive stock position and dividend tracking application with Plaid integration.

## Project Structure

```
strc_tracker/
├── backend/          # FastAPI backend
├── mobile/           # React Native mobile app
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

### Prerequisites

- Python 3.11+
- PostgreSQL
- Plaid API credentials (optional, for bank integration)

### Installation

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
Create a `.env` file in the `backend` directory:
```env
DATABASE_URL=postgresql://user:password@localhost/strc_tracker
SECRET_KEY=your-secret-key-here
PLAID_CLIENT_ID=xxx
PLAID_SECRET=xxx
PLAID_ENV=sandbox
DEBUG=True
```

**Note**: The Plaid credentials above are for sandbox/testing. Never commit your `.env` file to version control!

5. Set up the database:
```bash
# Initialize Alembic (if not already done)
alembic init migrations

# Create initial migration
alembic revision --autogenerate -m "Initial migration"

# Apply migrations
alembic upgrade head
```

6. (Optional) Seed the database with sample data:
```bash
python ../scripts/seed_db.py
```

7. Run the server:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

API documentation: `http://localhost:8000/docs`

## Mobile App Setup

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator (for Mac) or Android Emulator

### Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Start the Expo development server:
```bash
npm start
```

4. Run on iOS:
```bash
npm run ios
```

5. Run on Android:
```bash
npm run android
```

## Docker

### Build and run the backend with Docker:

```bash
cd backend
docker build -t strc-tracker-backend .
docker run -p 8000:8000 --env-file .env strc-tracker-backend
```

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
- React Navigation for routing
- Context API for state management
- AsyncStorage for local storage

## License

MIT


