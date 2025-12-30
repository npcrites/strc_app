# Local PostgreSQL Database Setup Guide

## Step 1: Install PostgreSQL

### Option A: Using Homebrew (Recommended for macOS)

```bash
# Install PostgreSQL
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Verify installation
psql --version
```

### Option B: Using Postgres.app (GUI Application)

1. Download from: https://postgresapp.com/
2. Install and open the app
3. Click "Initialize" to create a new server
4. The server will start automatically

### Option C: Using Docker

```bash
# Run PostgreSQL in Docker
docker run --name strc_tracker_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=strc_tracker \
  -p 5432:5432 \
  -d postgres:15

# Verify it's running
docker ps | grep strc_tracker_db
```

## Step 2: Create the Database

### Using psql (Command Line)

```bash
# Connect to PostgreSQL (default user is your macOS username)
psql postgres

# Or if using Homebrew installation:
psql -U postgres

# Create database
CREATE DATABASE strc_tracker;

# Create a user (optional, but recommended)
CREATE USER strc_user WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE strc_tracker TO strc_user;

# Exit psql
\q
```

### Using pgAdmin (GUI)

1. **Open pgAdmin** (from Applications or via the app)

2. **Add New Server**:
   - Right-click "Servers" → "Register" → "Server"
   - **General Tab**:
     - Name: `Local PostgreSQL` (or any name you prefer)
   - **Connection Tab**:
     - Host name/address: `localhost` (or `127.0.0.1`)
     - Port: `5432` (default PostgreSQL port)
     - Maintenance database: `postgres`
     - Username: `postgres` (or your macOS username)
     - Password: (leave blank if no password, or enter your password)
     - Check "Save password" if you want
   - Click "Save"

3. **Create Database**:
   - Expand your server → Right-click "Databases" → "Create" → "Database"
   - **General Tab**:
     - Database: `strc_tracker`
   - Click "Save"

## Step 3: Configure Your Application

Update your `.env` file in the `backend` directory:

```env
# For default PostgreSQL installation (no password)
DATABASE_URL=postgresql://postgres@localhost/strc_tracker

# For custom user with password
DATABASE_URL=postgresql://strc_user:your_password_here@localhost/strc_tracker

# For Docker PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost/strc_tracker
```

## Step 4: Run Migrations

```bash
cd backend

# Check current migration status
python3 -m alembic current

# Apply all migrations
python3 -m alembic upgrade head

# Verify tables were created
python3 -c "from app.db.session import engine; from sqlalchemy import inspect; inspector = inspect(engine); print('Tables:', inspector.get_table_names())"
```

## Step 5: Verify Connection in pgAdmin

1. In pgAdmin, expand your server → `strc_tracker` → `Schemas` → `public` → `Tables`
2. You should see:
   - `users`
   - `brokerages`
   - `accounts`
   - `positions`
   - `dividends`
   - `ex_dates`

## Troubleshooting

### PostgreSQL Not Starting

**Homebrew:**
```bash
# Check status
brew services list

# Restart
brew services restart postgresql@15

# Check logs
tail -f ~/Library/Logs/Homebrew/postgresql@15.log
```

**Postgres.app:**
- Check the app is running in your Applications
- Click the elephant icon in menu bar → "Start"

**Docker:**
```bash
# Check if container is running
docker ps

# View logs
docker logs strc_tracker_db

# Restart container
docker restart strc_tracker_db
```

### Connection Refused

- Verify PostgreSQL is running: `pg_isready` or check service status
- Check port 5432 is not blocked by firewall
- Verify connection string in `.env` matches your setup

### Authentication Failed

- Default macOS PostgreSQL often uses your macOS username
- Try: `DATABASE_URL=postgresql://YOUR_MACOS_USERNAME@localhost/strc_tracker`
- Or create a new user with password (see Step 2)

### Port Already in Use

If port 5432 is already in use:
```bash
# Find what's using the port
lsof -i :5432

# Stop the conflicting service or use a different port
```

## Quick Start Commands

```bash
# 1. Install PostgreSQL (Homebrew)
brew install postgresql@15
brew services start postgresql@15

# 2. Create database
createdb strc_tracker

# 3. Update .env file
echo "DATABASE_URL=postgresql://postgres@localhost/strc_tracker" >> backend/.env

# 4. Run migrations
cd backend
python3 -m alembic upgrade head

# 5. Test connection
python3 -m pytest tests/test_plaid_database_population.py -v
```

## pgAdmin Connection Details Summary

When connecting pgAdmin to your local PostgreSQL:

- **Host**: `localhost` or `127.0.0.1`
- **Port**: `5432`
- **Database**: `postgres` (for initial connection), then `strc_tracker` (after creation)
- **Username**: 
  - `postgres` (if using Homebrew or Docker)
  - Your macOS username (if using default macOS PostgreSQL)
- **Password**: 
  - Usually empty for local development
  - Or the password you set during installation

