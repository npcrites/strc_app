# STRC Tracker Backend

FastAPI backend for tracking preferred stock positions, dividends, and ex-dividend dates.

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your database and Plaid credentials
```

### 3. Setup Database

```bash
# Create database (if not exists)
createdb strc_tracker

# Run migrations
python3 -m alembic upgrade head
```

### 4. Seed Sample Data (Optional)

```bash
python3 scripts/seed_sample_data.py
```

### 5. Run the Server

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

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

### Database Connection Issues

```bash
# Test connection
python3 scripts/test_and_migrate.py

# Fix common issues
bash scripts/fix_database_connection.sh
```

### Migration Issues

```bash
# Check migration status
python3 -m alembic current

# View migration history
python3 -m alembic history
```

## License

[Your License Here]

