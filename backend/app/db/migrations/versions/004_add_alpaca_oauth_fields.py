"""Add Alpaca OAuth fields and remove password auth

Revision ID: 004_add_alpaca_oauth
Revises: 003_remove_plaid
Create Date: 2025-01-03 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '004_add_alpaca_oauth'
down_revision: Union[str, None] = '003_remove_plaid'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop hashed_password column (we're using OAuth only)
    try:
        op.drop_column('users', 'hashed_password')
    except Exception:
        pass  # Column might not exist
    
    # Make email nullable (users authenticate via Alpaca OAuth)
    # In PostgreSQL, we need to drop the unique constraint/index first,
    # then alter the column, then recreate the index
    # Use raw SQL to handle this more reliably
    op.execute("""
        -- Drop unique constraint/index if it exists
        DROP INDEX IF EXISTS ix_users_email;
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        
        -- Alter column to be nullable
        ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
        
        -- Recreate unique index (allows NULL values in PostgreSQL)
        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email);
    """)
    
    # Add Alpaca OAuth token columns
    op.add_column('users', sa.Column('alpaca_access_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('alpaca_refresh_token', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('alpaca_token_expires_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('alpaca_account_id', sa.String(), nullable=True))
    
    # Add Alpaca account info columns (to avoid repeated API calls)
    op.add_column('users', sa.Column('alpaca_account_number', sa.String(), nullable=True))
    op.add_column('users', sa.Column('alpaca_account_status', sa.String(), nullable=True))
    op.add_column('users', sa.Column('alpaca_currency', sa.String(), nullable=True, server_default='USD'))
    op.add_column('users', sa.Column('alpaca_trading_blocked', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('alpaca_portfolio_created_at', sa.DateTime(), nullable=True))
    
    # Create unique index on alpaca_account_id
    op.create_index('ix_users_alpaca_account_id', 'users', ['alpaca_account_id'], unique=True)


def downgrade() -> None:
    # Drop Alpaca indexes and columns
    try:
        op.drop_index('ix_users_alpaca_account_id', table_name='users')
    except Exception:
        pass
    
    op.drop_column('users', 'alpaca_portfolio_created_at')
    op.drop_column('users', 'alpaca_trading_blocked')
    op.drop_column('users', 'alpaca_currency')
    op.drop_column('users', 'alpaca_account_status')
    op.drop_column('users', 'alpaca_account_number')
    op.drop_column('users', 'alpaca_account_id')
    op.drop_column('users', 'alpaca_token_expires_at')
    op.drop_column('users', 'alpaca_refresh_token')
    op.drop_column('users', 'alpaca_access_token')
    
    # Make email non-nullable again
    op.alter_column('users', 'email',
                    existing_type=sa.String(),
                    nullable=False,
                    existing_nullable=True)
    
    # Re-add hashed_password column
    op.add_column('users', sa.Column('hashed_password', sa.String(), nullable=False, server_default=''))

