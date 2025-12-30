#!/bin/bash
# Quick setup script for local PostgreSQL database

set -e

echo "🚀 Setting up local PostgreSQL database for STRC Tracker"
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL not found. Installing via Homebrew..."
    brew install postgresql@15
    brew services start postgresql@15
    echo "✅ PostgreSQL installed and started"
else
    echo "✅ PostgreSQL found: $(psql --version)"
fi

# Check if PostgreSQL is running
if ! pg_isready &> /dev/null; then
    echo "⚠️  PostgreSQL not running. Starting service..."
    brew services start postgresql@15 || echo "Please start PostgreSQL manually"
    sleep 2
fi

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw strc_tracker; then
    echo "✅ Database 'strc_tracker' already exists"
else
    echo "📦 Creating database 'strc_tracker'..."
    createdb strc_tracker
    echo "✅ Database created"
fi

# Get current user for connection string
DB_USER=${USER:-postgres}

echo ""
echo "📝 Database connection details:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: strc_tracker"
echo "   User: $DB_USER"
echo ""
echo "💡 Add this to your backend/.env file:"
echo "   DATABASE_URL=postgresql://$DB_USER@localhost/strc_tracker"
echo ""
echo "✅ Setup complete! Run migrations with:"
echo "   cd backend && python3 -m alembic upgrade head"

