"""Add Plaid sync fields to users table

Revision ID: 002_add_plaid_sync_fields
Revises: 001_initial_schema
Create Date: 2024-12-29 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_plaid_sync_fields'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add plaid_item_id column
    op.add_column('users', sa.Column('plaid_item_id', sa.String(), nullable=True))
    
    # Add plaid_last_synced_at column
    op.add_column('users', sa.Column('plaid_last_synced_at', sa.DateTime(), nullable=True))
    
    # Add index on plaid_access_token for querying users with tokens
    op.create_index('idx_users_plaid_access_token', 'users', ['plaid_access_token'], unique=False)


def downgrade() -> None:
    # Drop index
    op.drop_index('idx_users_plaid_access_token', table_name='users')
    
    # Drop columns
    op.drop_column('users', 'plaid_last_synced_at')
    op.drop_column('users', 'plaid_item_id')

