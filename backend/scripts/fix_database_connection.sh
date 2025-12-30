#!/bin/bash
# Script to fix database connection and run migrations

set -e

echo "🔧 Fixing Database Connection and Running Migrations"
echo ""

cd "$(dirname "$0")/.."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found!"
    echo ""
    echo "Please install PostgreSQL first:"
    echo "  brew install postgresql@15"
    echo "  brew services start postgresql@15"
    exit 1
fi

echo "✅ PostgreSQL found: $(psql --version)"
echo ""

# Try to connect and find the correct username
echo "🔍 Detecting PostgreSQL username..."

# Try common usernames
for USERNAME in "$USER" "postgres" "$(whoami)"; do
    if psql -U "$USERNAME" -d postgres -c "SELECT 1;" &> /dev/null; then
        DB_USER="$USERNAME"
        echo "✅ Found working username: $DB_USER"
        break
    fi
done

if [ -z "$DB_USER" ]; then
    echo "⚠️  Could not auto-detect username. Trying to connect..."
    echo "Please enter your PostgreSQL username (or press Enter to try default):"
    read -r DB_USER
    DB_USER=${DB_USER:-$USER}
fi

# Check if database exists
if psql -U "$DB_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw strc_tracker; then
    echo "✅ Database 'strc_tracker' already exists"
else
    echo "📦 Creating database 'strc_tracker'..."
    createdb -U "$DB_USER" strc_tracker 2>/dev/null || psql -U "$DB_USER" -d postgres -c "CREATE DATABASE strc_tracker;" || {
        echo "❌ Failed to create database. Please create it manually:"
        echo "   createdb strc_tracker"
        exit 1
    }
    echo "✅ Database created"
fi

# Update .env file
ENV_FILE=".env"
DB_URL="postgresql://$DB_USER@localhost/strc_tracker"

echo ""
echo "📝 Updating .env file..."

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env file..."
    touch "$ENV_FILE"
fi

# Update or add DATABASE_URL
if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
    # Update existing DATABASE_URL
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
    else
        # Linux
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" "$ENV_FILE"
    fi
    echo "✅ Updated DATABASE_URL in .env"
else
    # Add new DATABASE_URL
    echo "" >> "$ENV_FILE"
    echo "DATABASE_URL=$DB_URL" >> "$ENV_FILE"
    echo "✅ Added DATABASE_URL to .env"
fi

echo ""
echo "🔗 Database connection string:"
echo "   $DB_URL"
echo ""

# Test connection
echo "🧪 Testing database connection..."
python3 << 'PYEOF'
import sys
from sqlalchemy import text
from app.core.config import settings
from app.db.session import engine

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT 1"))
        print("✅ Database connection successful!")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)
PYEOF

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Connection test failed. Please check:"
    echo "   1. PostgreSQL is running: brew services list | grep postgresql"
    echo "   2. Database exists: psql -l | grep strc_tracker"
    echo "   3. Username is correct in .env file"
    exit 1
fi

# Run migrations
echo ""
echo "📊 Running migrations..."
python3 -m alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migrations completed successfully!"
    echo ""
    echo "📋 Verifying tables..."
    python3 << 'PYEOF'
from app.db.session import engine
from sqlalchemy import inspect

inspector = inspect(engine)
tables = inspector.get_table_names()

    print(f"✅ Found {len(tables)} tables:")
for table in sorted(tables):
    print(f"   - {table}")
except Exception as e:
    print(f"❌ Error: {e}")
PYEOF
else
    echo ""
    echo "❌ Migration failed. Check the error above."
    exit 1
fi

echo ""
echo "🎉 Setup complete! Your database is ready."

