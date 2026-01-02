"""Remove Plaid-related tables and columns

Revision ID: 003_remove_plaid
Revises: b60042f0ff9d
Create Date: 2025-01-02 20:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_remove_plaid'
down_revision: Union[str, None] = 'b60042f0ff9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop foreign key constraint from positions.account_id (if it exists)
    try:
        op.drop_constraint('positions_account_id_fkey', 'positions', type_='foreignkey')
    except Exception:
        pass  # Constraint might not exist
    
    # Drop index if it exists, then drop column
    try:
        op.drop_index('idx_positions_account_id', table_name='positions')
    except Exception:
        pass  # Index might not exist
    
    # Drop account_id column from positions (if it exists)
    try:
        op.drop_column('positions', 'account_id')
    except Exception:
        pass  # Column might not exist
    
    # Drop Plaid columns from users table (if they exist)
    try:
        op.drop_index('idx_users_plaid_access_token', table_name='users')
    except Exception:
        pass  # Index might not exist
    
    try:
        op.drop_column('users', 'plaid_access_token')
    except Exception:
        pass  # Column might not exist
    
    try:
        op.drop_column('users', 'plaid_item_id')
    except Exception:
        pass  # Column might not exist
    
    try:
        op.drop_column('users', 'plaid_last_synced_at')
    except Exception:
        pass  # Column might not exist
    
    # Drop accounts table (if it exists)
    try:
        op.drop_table('accounts')
    except Exception:
        pass  # Table might not exist
    
    # Drop brokerages table (if it exists)
    try:
        op.drop_table('brokerages')
    except Exception:
        pass  # Table might not exist


def downgrade() -> None:
    # Recreate brokerages table
    op.create_table('brokerages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_brokerages_user_id', 'brokerages', ['user_id'])
    
    # Recreate accounts table
    op.create_table('accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('brokerage_id', sa.Integer(), nullable=True),
        sa.Column('plaid_account_id', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('subtype', sa.String(), nullable=True),
        sa.Column('balance', sa.Numeric(15, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['brokerage_id'], ['brokerages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('plaid_account_id')
    )
    op.create_index('idx_accounts_user_id', 'accounts', ['user_id'])
    op.create_index('idx_accounts_brokerage_id', 'accounts', ['brokerage_id'])
    
    # Recreate Plaid columns in users
    op.add_column('users', sa.Column('plaid_access_token', sa.String(), nullable=True))
    op.add_column('users', sa.Column('plaid_item_id', sa.String(), nullable=True))
    op.add_column('users', sa.Column('plaid_last_synced_at', sa.DateTime(), nullable=True))
    op.create_index('idx_users_plaid_access_token', 'users', ['plaid_access_token'])
    
    # Recreate account_id in positions
    op.add_column('positions', sa.Column('account_id', sa.Integer(), nullable=True))
    op.create_index('idx_positions_account_id', 'positions', ['account_id'])
    op.create_foreign_key('positions_account_id_fkey', 'positions', 'accounts', ['account_id'], ['id'], ondelete='CASCADE')

