"""add_bank_accounts_table

Revision ID: 0f4f8a1ca98d
Revises: d63ecc6cbcd2
Create Date: 2026-02-01 21:11:48.340505

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f4f8a1ca98d'
down_revision: Union[str, None] = 'd63ecc6cbcd2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create bank_accounts table
    op.create_table(
        'bank_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('plaid_item_id', sa.String(), nullable=False),
        sa.Column('plaid_access_token', sa.Text(), nullable=False),
        sa.Column('plaid_account_id', sa.String(), nullable=False),
        sa.Column('account_name', sa.String(), nullable=True),
        sa.Column('account_type', sa.String(), nullable=True),
        sa.Column('account_subtype', sa.String(), nullable=True),
        sa.Column('institution_name', sa.String(), nullable=True),
        sa.Column('institution_id', sa.String(), nullable=True),
        sa.Column('mask', sa.String(), nullable=True),
        sa.Column('official_name', sa.String(), nullable=True),
        sa.Column('balance_available', sa.String(), nullable=True),
        sa.Column('balance_current', sa.String(), nullable=True),
        sa.Column('balance_limit', sa.String(), nullable=True),
        sa.Column('balance_iso_currency_code', sa.String(), nullable=True, server_default='USD'),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_bank_accounts_user_id', 'bank_accounts', ['user_id'])
    op.create_index('idx_bank_accounts_plaid_item_id', 'bank_accounts', ['plaid_item_id'])
    op.create_index('idx_bank_accounts_plaid_account_id', 'bank_accounts', ['plaid_account_id'], unique=True)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_bank_accounts_plaid_account_id', table_name='bank_accounts')
    op.drop_index('idx_bank_accounts_plaid_item_id', table_name='bank_accounts')
    op.drop_index('idx_bank_accounts_user_id', table_name='bank_accounts')
    
    # Drop table
    op.drop_table('bank_accounts')
