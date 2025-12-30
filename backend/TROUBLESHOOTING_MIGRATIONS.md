# Troubleshooting Database Migrations

## Common Issues and Solutions

### Issue 1: "role 'user' does not exist"

**Error:**
```
FATAL: role "user" does not exist
```

**Cause:** Your `.env` file has a placeholder DATABASE_URL with `user:password` instead of your actual PostgreSQL username.

**Solution:**

1. **Find your PostgreSQL username:**
   ```bash
   # Try your macOS username
   psql -U $(whoami) -d postgres
   
   # Or try 'postgres'
   psql -U postgres -d postgres
   ```

2. **Update your `.env` file:**
   ```env
   # Replace with your actual username (no password for local)
   DATABASE_URL=postgresql://nickcrites@localhost/strc_tracker
   
   # Or if using 'postgres' user:
   DATABASE_URL=postgresql://postgres@localhost/strc_tracker
   ```

3. **Or use the automated fix script:**
   ```bash
   cd backend
   ./scripts/fix_database_connection.sh
   ```

### Issue 2: "database 'strc_tracker' does not exist"

**Error:**
```
FATAL: database "strc_tracker" does not exist
```

**Solution:**

```bash
# Create the database
createdb strc_tracker

# Or if that doesn't work:
psql -U your_username -d postgres -c "CREATE DATABASE strc_tracker;"
```

### Issue 3: "connection refused"

**Error:**
```
connection to server at "localhost" (::1), port 5432 failed: Connection refused
```

**Solution:**

1. **Check if PostgreSQL is running:**
   ```bash
   # Homebrew
   brew services list | grep postgresql
   
   # Start if not running
   brew services start postgresql@15
   ```

2. **Or check with pgAdmin:**
   - Open pgAdmin
   - Check if your server shows as "Running"

### Issue 4: "authentication failed"

**Error:**
```
FATAL: password authentication failed for user
```

**Solution:**

1. **Try without password (local development):**
   ```env
   DATABASE_URL=postgresql://your_username@localhost/strc_tracker
   ```

2. **Or set a password:**
   ```bash
   psql -U your_username -d postgres
   ALTER USER your_username WITH PASSWORD 'your_password';
   ```
   
   Then update `.env`:
   ```env
   DATABASE_URL=postgresql://your_username:your_password@localhost/strc_tracker
   ```

## Step-by-Step Fix Process

### Quick Fix (Automated)

```bash
cd backend
./scripts/fix_database_connection.sh
```

### Manual Fix

1. **Check PostgreSQL is installed:**
   ```bash
   psql --version
   ```

2. **Check PostgreSQL is running:**
   ```bash
   brew services list | grep postgresql
   # If not running:
   brew services start postgresql@15
   ```

3. **Find your username:**
   ```bash
   whoami  # Your macOS username
   # Try connecting:
   psql -U $(whoami) -d postgres
   ```

4. **Create database:**
   ```bash
   createdb strc_tracker
   ```

5. **Update `.env` file:**
   ```bash
   cd backend
   # Edit .env and set:
   DATABASE_URL=postgresql://YOUR_USERNAME@localhost/strc_tracker
   ```

6. **Test connection:**
   ```bash
   python3 << 'PYEOF'
   from app.core.config import settings
   from app.db.session import engine
   with engine.connect() as conn:
       print("✅ Connection successful!")
   PYEOF
   ```

7. **Run migrations:**
   ```bash
   python3 -m alembic current
   python3 -m alembic upgrade head
   ```

8. **Verify tables:**
   ```bash
   python3 << 'PYEOF'
   from app.db.session import engine
   from sqlalchemy import inspect
   inspector = inspect(engine)
   print("Tables:", inspector.get_table_names())
   PYEOF
   ```

## Verification Commands

After fixing, verify everything works:

```bash
# 1. Check migration status
python3 -m alembic current

# 2. List all migrations
python3 -m alembic history

# 3. Verify tables exist
python3 -c "
from app.db.session import engine
from sqlalchemy import inspect
inspector = inspect(engine)
tables = inspector.get_table_names()
print(f'Found {len(tables)} tables:')
for t in sorted(tables):
    print(f'  - {t}')
"

# 4. Test database population
python3 -m pytest tests/test_plaid_database_population.py -v
```

## Getting Help

If you're still stuck:

1. **Check your `.env` file:**
   ```bash
   cat backend/.env | grep DATABASE_URL
   ```

2. **Test PostgreSQL connection directly:**
   ```bash
   psql -U your_username -d strc_tracker -c "SELECT version();"
   ```

3. **Check Alembic configuration:**
   ```bash
   python3 -c "from app.core.config import settings; print(settings.DATABASE_URL)"
   ```

