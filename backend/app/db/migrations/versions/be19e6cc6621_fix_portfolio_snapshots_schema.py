"""fix_portfolio_snapshots_schema

Revision ID: be19e6cc6621
Revises: 004_add_alpaca_oauth
Create Date: 2026-01-02 21:50:11.931261

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be19e6cc6621'
down_revision: Union[str, None] = '004_add_alpaca_oauth'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fix portfolio_snapshots table schema to match model
    # 1. Rename investments_value to investment_value (if exists)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'investments_value'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                RENAME COLUMN investments_value TO investment_value;
            END IF;
        END $$;
    """)
    
    # 2. Rename snapshot_timestamp to timestamp (if exists)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'snapshot_timestamp'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                RENAME COLUMN snapshot_timestamp TO timestamp;
            END IF;
        END $$;
    """)
    
    # 3. Add investment_value if it doesn't exist (after rename attempt)
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'investment_value'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                ADD COLUMN investment_value NUMERIC(15, 2) NOT NULL DEFAULT 0;
            END IF;
        END $$;
    """)
    
    # 4. Add timestamp if it doesn't exist (after rename attempt)
    op.execute("""
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'timestamp'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                ADD COLUMN timestamp TIMESTAMP NOT NULL DEFAULT NOW();
            END IF;
        END $$;
    """)
    
    # 5. Remove created_at if it exists (not in model)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'created_at'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                DROP COLUMN created_at;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Reverse the changes
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'investment_value'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                RENAME COLUMN investment_value TO investments_value;
            END IF;
        END $$;
    """)
    
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'portfolio_snapshots' 
                AND column_name = 'timestamp'
            ) THEN
                ALTER TABLE portfolio_snapshots 
                RENAME COLUMN timestamp TO snapshot_timestamp;
            END IF;
        END $$;
    """)
    
    op.execute("""
        ALTER TABLE portfolio_snapshots 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    """)
