# Step-by-Step Migration Guide

## Prerequisites Check

First, verify PostgreSQL is accessible:

### Option 1: Using pgAdmin (if you have Postgres.app or pgAdmin)

1. **Open pgAdmin**
2. **Check if you can connect to a server**
   - If you see a server listed, note the username you use
   - If no server, add one:
     - Right-click "Servers" → "Register" → "Server"
     - Host: `localhost`, Port: `5432`
     - Username: Try `postgres` or your macOS username
     - Password: Usually empty for local

### Option 2: Using Command Line

```bash
# Check if psql is available
which psql

# If not, install PostgreSQL:
brew install postgresql@15
brew services start postgresql@15

# Add to PATH (add to ~/.zshrc):
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
source ~/.zshrc
```

## Step 1: Create the Database

### Using pgAdmin:
1. Right-click "Databases" → "Create" → "Database"
2. Name: `strc_tracker`
3. Click "Save"

### Using Command Line:
```bash
createdb strc_tracker
# Or if that doesn't work:
psql -U postgres -c "CREATE DATABASE strc_tracker;"
```

## Step 2: Update .env File

Edit `backend/.env` and set the correct DATABASE_URL:

```env
# For macOS default (no password):
DATABASE_URL=postgresql://nickcrites@localhost/strc_tracker

# For 'postgres' user:
DATABASE_URL=postgresql://postgres@localhost/strc_tracker

# If you set a password:
DATABASE_URL=postgresql://username:password@localhost/strc_tracker
```

**To find your username:**
- Check what username you use in pgAdmin
- Or try: `whoami` (your macOS username)
- Or try: `postgres`

## Step 3: Test Connection

Run the test script:

```bash
cd backend
python3 scripts/test_and_migrate.py
```

This will:
- Test the database connection
- Check migration status
- Run migrations
- Verify tables were created

## Step 4: Manual Migration (if script doesn't work)

```bash
cd backend

# Check current status
python3 -m alembic current

# Run migrations
python3 -m alembic upgrade head

# Verify tables
python3 << 'PYEOF'
from sqlalchemy import text, inspect
from app.db.session import engine

inspector = inspect(engine)
tables = inspector.get_table_names()
print(f"✅ Found {len(tables)} tables:")
for t in sorted(tables):
    print(f"   - {t}")
PYEOF
```

## Troubleshooting

### "role 'user' does not exist"
- Your `.env` has placeholder values
- Update DATABASE_URL with your actual PostgreSQL username

### "database 'strc_tracker' does not exist"
- Create it: `createdb strc_tracker` or via pgAdmin

### "connection refused"
- PostgreSQL isn't running
- Start it: `brew services start postgresql@15` or start Postgres.app

### "Not an executable object: 'SELECT 1'"
- SQLAlchemy 2.0 syntax issue (already fixed in scripts)
- Use `text("SELECT 1")` instead of `"SELECT 1"`

## Quick Test

After setup, test everything:

```bash
cd backend
python3 scripts/test_and_migrate.py
```

You should see:
- ✅ Database connection successful!
- ✅ Migrations completed successfully!
- ✅ All 6 tables found

