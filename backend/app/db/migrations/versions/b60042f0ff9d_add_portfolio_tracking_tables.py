"""add_portfolio_tracking_tables

Revision ID: b60042f0ff9d
Revises: 002_add_plaid_sync_fields
Create Date: 2026-01-02 16:21:26.222526

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b60042f0ff9d'
down_revision: Union[str, None] = '002_add_plaid_sync_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create asset_prices table (live price cache)
    op.create_table(
        'asset_prices',
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('price', sa.Numeric(15, 4), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('symbol')
    )
    op.create_index('idx_asset_prices_symbol', 'asset_prices', ['symbol'], unique=False)
    op.create_index('idx_asset_prices_updated_at', 'asset_prices', ['updated_at'], unique=False)
    
    # Create portfolio_snapshots table
    op.create_table(
        'portfolio_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('total_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('cash_balance', sa.Numeric(15, 2), nullable=True),
        sa.Column('investment_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'timestamp', name='uq_portfolio_snapshot_user_timestamp')
    )
    op.create_index('idx_portfolio_snapshots_user_timestamp', 'portfolio_snapshots', ['user_id', 'timestamp'], unique=False)
    op.create_index('idx_portfolio_snapshots_timestamp', 'portfolio_snapshots', ['timestamp'], unique=False)
    op.create_index('ix_portfolio_snapshots_id', 'portfolio_snapshots', ['id'], unique=False)
    op.create_index('ix_portfolio_snapshots_user_id', 'portfolio_snapshots', ['user_id'], unique=False)
    
    # Create position_snapshots table
    op.create_table(
        'position_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('portfolio_snapshot_id', sa.Integer(), nullable=False),
        sa.Column('ticker', sa.String(), nullable=False),
        sa.Column('shares', sa.Numeric(15, 6), nullable=False),
        sa.Column('cost_basis', sa.Numeric(15, 2), nullable=False),
        sa.Column('current_value', sa.Numeric(15, 2), nullable=False),
        sa.Column('price_per_share', sa.Numeric(15, 4), nullable=False),
        sa.ForeignKeyConstraint(['portfolio_snapshot_id'], ['portfolio_snapshots.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_position_snapshots_portfolio_id', 'position_snapshots', ['portfolio_snapshot_id'], unique=False)
    op.create_index('idx_position_snapshots_ticker', 'position_snapshots', ['ticker'], unique=False)
    op.create_index('ix_position_snapshots_id', 'position_snapshots', ['id'], unique=False)


def downgrade() -> None:
    # Drop position_snapshots table
    op.drop_index('ix_position_snapshots_id', table_name='position_snapshots')
    op.drop_index('idx_position_snapshots_ticker', table_name='position_snapshots')
    op.drop_index('idx_position_snapshots_portfolio_id', table_name='position_snapshots')
    op.drop_table('position_snapshots')
    
    # Drop portfolio_snapshots table
    op.drop_index('ix_portfolio_snapshots_user_id', table_name='portfolio_snapshots')
    op.drop_index('ix_portfolio_snapshots_id', table_name='portfolio_snapshots')
    op.drop_index('idx_portfolio_snapshots_timestamp', table_name='portfolio_snapshots')
    op.drop_index('idx_portfolio_snapshots_user_timestamp', table_name='portfolio_snapshots')
    op.drop_table('portfolio_snapshots')
    
    # Drop asset_prices table
    op.drop_index('idx_asset_prices_updated_at', table_name='asset_prices')
    op.drop_index('idx_asset_prices_symbol', table_name='asset_prices')
    op.drop_table('asset_prices')
