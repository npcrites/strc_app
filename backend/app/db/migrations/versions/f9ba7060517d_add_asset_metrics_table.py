"""add_asset_metrics_table

Revision ID: f9ba7060517d
Revises: 4e8fb517692a
Create Date: 2026-01-14 19:17:09.480278

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f9ba7060517d'
down_revision: Union[str, None] = '4e8fb517692a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Check if table already exists (from previous manual creation)
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    if 'asset_metrics' not in tables:
        # Create asset_metrics table
        op.create_table(
            'asset_metrics',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('ticker', sa.String(), nullable=False),
            sa.Column('metric_type', sa.String(), nullable=False),
            sa.Column('value', sa.Numeric(20, 4), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=False),
            sa.Column('is_parent_level', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        
        # Create indexes
        op.create_index('idx_asset_metrics_ticker', 'asset_metrics', ['ticker'])
        op.create_index('idx_asset_metrics_metric_type', 'asset_metrics', ['metric_type'])
        op.create_index('idx_asset_metrics_timestamp', 'asset_metrics', ['timestamp'])
        op.create_index('idx_asset_metrics_is_parent_level', 'asset_metrics', ['is_parent_level'])
        op.create_index('idx_asset_metrics_ticker_type', 'asset_metrics', ['ticker', 'metric_type'])
        op.create_index('idx_asset_metrics_ticker_timestamp', 'asset_metrics', ['ticker', 'timestamp'])
        op.create_index('idx_asset_metrics_ticker_type_timestamp', 'asset_metrics', ['ticker', 'metric_type', 'timestamp'])
        op.create_index('idx_asset_metrics_parent_type_timestamp', 'asset_metrics', ['is_parent_level', 'metric_type', 'timestamp'])
    else:
        # Table exists, just ensure indexes exist
        # Check which indexes exist and create missing ones
        indexes = [idx['name'] for idx in inspector.get_indexes('asset_metrics')]
        
        if 'idx_asset_metrics_ticker' not in indexes:
            op.create_index('idx_asset_metrics_ticker', 'asset_metrics', ['ticker'])
        if 'idx_asset_metrics_metric_type' not in indexes:
            op.create_index('idx_asset_metrics_metric_type', 'asset_metrics', ['metric_type'])
        if 'idx_asset_metrics_timestamp' not in indexes:
            op.create_index('idx_asset_metrics_timestamp', 'asset_metrics', ['timestamp'])
        if 'idx_asset_metrics_is_parent_level' not in indexes:
            op.create_index('idx_asset_metrics_is_parent_level', 'asset_metrics', ['is_parent_level'])
        if 'idx_asset_metrics_ticker_type' not in indexes:
            op.create_index('idx_asset_metrics_ticker_type', 'asset_metrics', ['ticker', 'metric_type'])
        if 'idx_asset_metrics_ticker_timestamp' not in indexes:
            op.create_index('idx_asset_metrics_ticker_timestamp', 'asset_metrics', ['ticker', 'timestamp'])
        if 'idx_asset_metrics_ticker_type_timestamp' not in indexes:
            op.create_index('idx_asset_metrics_ticker_type_timestamp', 'asset_metrics', ['ticker', 'metric_type', 'timestamp'])
        if 'idx_asset_metrics_parent_type_timestamp' not in indexes:
            op.create_index('idx_asset_metrics_parent_type_timestamp', 'asset_metrics', ['is_parent_level', 'metric_type', 'timestamp'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_asset_metrics_parent_type_timestamp', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_ticker_type_timestamp', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_ticker_timestamp', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_ticker_type', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_is_parent_level', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_timestamp', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_metric_type', table_name='asset_metrics')
    op.drop_index('idx_asset_metrics_ticker', table_name='asset_metrics')
    
    # Drop table
    op.drop_table('asset_metrics')
