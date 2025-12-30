# Database Migration Guide

## Alembic Setup

The project uses Alembic for database migrations. The migration files are located in `app/db/migrations/`.

## Initial Migration

The initial schema migration has been created at:
- `app/db/migrations/versions/001_initial_schema.py`

This migration creates all tables:
- `users`
- `brokerages`
- `accounts`
- `positions`
- `dividends`
- `ex_dates`

## Running Migrations

### Prerequisites

1. **PostgreSQL Database**: Ensure PostgreSQL is running and accessible
2. **Database URL**: Set `DATABASE_URL` in `.env` file:
   ```env
   DATABASE_URL=postgresql://user:password@localhost/strc_tracker
   ```

### Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE strc_tracker;

# Exit
\q
```

### Apply Migrations

```bash
cd backend

# Check current migration status
python3 -m alembic current

# Apply all pending migrations
python3 -m alembic upgrade head

# View migration history
python3 -m alembic history
```

### Create New Migration

```bash
# Auto-generate migration from model changes
python3 -m alembic revision --autogenerate -m "Description of changes"

# Review the generated migration file
# Then apply it
python3 -m alembic upgrade head
```

### Rollback Migration

```bash
# Rollback one migration
python3 -m alembic downgrade -1

# Rollback to specific revision
python3 -m alembic downgrade <revision_id>

# Rollback all migrations
python3 -m alembic downgrade base
```

## Migration Files

- **Location**: `app/db/migrations/versions/`
- **Naming**: `{revision_id}_{description}.py`
- **Format**: Each migration has `upgrade()` and `downgrade()` functions

## Configuration

Alembic configuration is in:
- `alembic.ini` - Main configuration file
- `app/db/migrations/env.py` - Migration environment setup

The `env.py` file is configured to:
- Import all models from `app.models`
- Use `DATABASE_URL` from `app.core.config.settings`
- Auto-generate migrations based on model changes

## Testing Migrations

To test migrations without a database:

```bash
# Generate SQL without executing
python3 -m alembic upgrade head --sql > migration.sql
```

## Troubleshooting

### Database Connection Error

If you see connection errors:
1. Check PostgreSQL is running: `pg_isready`
2. Verify `DATABASE_URL` in `.env`
3. Check database exists: `psql -l | grep strc_tracker`

### Migration Conflicts

If migrations conflict:
1. Check current state: `python3 -m alembic current`
2. Review migration history: `python3 -m alembic history`
3. Resolve conflicts manually in migration files

### Model Changes Not Detected

If autogenerate doesn't detect changes:
1. Ensure models are imported in `app/models/__init__.py`
2. Check `target_metadata = Base.metadata` in `env.py`
3. Verify model classes inherit from `Base`

## Next Steps

After running migrations:

1. **Verify Tables**: Connect to database and verify tables exist
2. **Run Tests**: Execute database population tests
3. **Seed Data**: Optionally run seed scripts to populate test data

