# STRC Tracker Backend

FastAPI backend for tracking preferred stock positions, dividends, and ex-dividend dates.

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL installed and running
- Virtual environment (recommended)

### 1. Create Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux: venv/bin/activate
# On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Create a `.env` file in the `backend` directory (copy from `.env.example` if available):

```bash
cp .env.example .env  # If .env.example exists
# Edit .env with your settings
```

Required environment variables:
```env
DATABASE_URL=postgresql://user:password@localhost/strc_tracker
SECRET_KEY=your-secret-key-here
PLAID_CLIENT_ID=your-plaid-client-id
PLAID_SECRET=your-plaid-secret
PLAID_ENV=sandbox
DEBUG=True
```

**Note**: Never commit your `.env` file to version control!

### 4. Setup Database

```bash
# Create database (if not exists)
createdb strc_tracker

# Run migrations
python3 -m alembic upgrade head
```

### 5. Seed Sample Data (Optional)

```bash
python3 scripts/seed_sample_data.py
```

This creates a demo user (`demo@example.com` / `demo123`) with sample portfolio data.

### 6. Start the Server

**Recommended: Use the startup script**
```bash
./start_server.sh
```

**Alternative: Manual start**
```bash
source venv/bin/activate
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Important**: Use `--host 0.0.0.0` (not `127.0.0.1`) if you want mobile devices to connect!

### Verify Server is Running

```bash
curl http://localhost:8000/health
```

Should return: `{"status":"healthy"}`

### Server URLs

- **API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **API Docs (Swagger)**: http://localhost:8000/docs
- **API Docs (ReDoc)**: http://localhost:8000/redoc

## Project Structure

```
backend/
├── .env                    # Environment variables (not in git)
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── alembic.ini             # Alembic migration config
├── Dockerfile              # Docker container definition
├── requirements.txt        # Python dependencies
├── README.md               # This file
│
├── app/                    # Application code
│   ├── main.py            # FastAPI app entry point
│   ├── api/               # API routes
│   │   └── routes/
│   ├── core/              # Core configuration
│   │   ├── config.py      # Settings and env vars
│   │   └── security.py    # JWT and password hashing
│   ├── db/                # Database
│   │   ├── migrations/   # Alembic migrations
│   │   ├── base.py        # SQLAlchemy base
│   │   └── session.py     # Database session
│   ├── models/            # SQLAlchemy models
│   └── services/          # Business logic
│       ├── plaid_service.py
│       ├── dividend_engine.py
│       └── notification_engine.py
│
├── scripts/               # Utility scripts
│   ├── seed_sample_data.py
│   └── fetch_investment_data.py
│
└── tests/                 # Test suite
    ├── test_plaid_connection.py
    ├── test_plaid_service.py
    └── test_dividend_engine.py
```

## Documentation

Additional documentation is available in the `docs/` directory:

- **[BACKEND_STRUCTURE.md](docs/BACKEND_STRUCTURE.md)** - Detailed backend architecture and structure
- **[MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md)** - Database migration guide
- **[TROUBLESHOOTING_MIGRATIONS.md](docs/TROUBLESHOOTING_MIGRATIONS.md)** - Troubleshooting migration issues
- **[PORTFOLIO_TRACKING_IMPLEMENTATION.md](docs/PORTFOLIO_TRACKING_IMPLEMENTATION.md)** - Portfolio tracking system documentation
- **[ORGANIZATION.md](ORGANIZATION.md)** - Backend folder organization and file locations
- **[app/models/README.md](app/models/README.md)** - Database models documentation
- **[app/services/dashboard/README.md](app/services/dashboard/README.md)** - Dashboard service documentation
- **[scripts/README.md](scripts/README.md)** - Mock data and utility scripts

## Configuration Files

### `.env`
Environment variables for local development. **Never commit this file.**

### `alembic.ini`
Alembic configuration for database migrations. Must be at root level.

### `requirements.txt`
Python package dependencies. Install with `pip install -r requirements.txt`.

### `Dockerfile`
Docker container configuration for deployment.

## Database Migrations

```bash
# Create a new migration
python3 -m alembic revision --autogenerate -m "description"

# Apply migrations
python3 -m alembic upgrade head

# Rollback one migration
python3 -m alembic downgrade -1

# Check current version
python3 -m alembic current
```

## Running Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/test_plaid_connection.py -v

# Run with coverage
pytest --cov=app tests/
```

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Development

### Adding New Dependencies

1. Add to `requirements.txt`
2. Install: `pip install -r requirements.txt`
3. Update `.env.example` if needed

### Database Changes

1. Modify models in `app/models/`
2. Generate migration: `python3 -m alembic revision --autogenerate -m "description"`
3. Review migration in `app/db/migrations/versions/`
4. Apply: `python3 -m alembic upgrade head`

## Deployment

### Docker

```bash
# Build image
docker build -t strc_tracker_backend .

# Run container
docker run -p 8000:8000 --env-file .env strc_tracker_backend
```

### Environment Variables

Required environment variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - JWT secret key
- `PLAID_CLIENT_ID` - Plaid API client ID
- `PLAID_SECRET` - Plaid API secret
- `PLAID_ENV` - Plaid environment (sandbox/development/production)

## Troubleshooting

### Common Startup Issues

#### "No module named uvicorn" or Import Errors
- Make sure virtual environment is activated: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`
- On macOS, always use a virtual environment (PEP 668 requirement)

#### "Port 8000 already in use"
```bash
# Kill the process on port 8000
lsof -ti:8000 | xargs kill

# Or use a different port
python3 -m uvicorn app.main:app --reload --port 8001
```

#### "ModuleNotFoundError: No module named 'app'"
- Make sure you're in the `backend` directory
- Ensure virtual environment is activated

#### Database Connection Errors
```bash
# Check if PostgreSQL is running
psql -l
# Or
pg_isready

# Test connection
python3 scripts/test_and_migrate.py

# Fix common issues
bash scripts/fix_database_connection.sh
```

Verify your `.env` file has the correct `DATABASE_URL`:
```
DATABASE_URL=postgresql://user:password@localhost/strc_tracker
```

### Migration Issues

```bash
# Check migration status
python3 -m alembic current

# View migration history
python3 -m alembic history

# See detailed troubleshooting guide
# backend/docs/TROUBLESHOOTING_MIGRATIONS.md
```

### Accessing from Mobile Device

1. Find your computer's IP address:
   ```bash
   # macOS/Linux
   ipconfig getifaddr en0  # macOS
   # Or
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

2. Update `DashboardApp/app.json`:
   ```json
   "extra": {
     "apiUrlDevice": "http://YOUR_IP:8000/api"
   }
   ```

3. Make sure:
   - Server is started with `--host 0.0.0.0` (not `127.0.0.1`)
   - Both devices are on the same WiFi network
   - Firewall isn't blocking port 8000

For more detailed troubleshooting, see the [documentation in `backend/docs/`](docs/).

## License

[Your License Here]

