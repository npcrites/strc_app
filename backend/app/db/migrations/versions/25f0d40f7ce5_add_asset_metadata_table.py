"""add_asset_metadata_table

Revision ID: 25f0d40f7ce5
Revises: 90f7e1670728
Create Date: 2026-01-19 16:26:24.980636

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '25f0d40f7ce5'
down_revision: Union[str, None] = '90f7e1670728'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create asset_metadata table
    op.create_table(
        'asset_metadata',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('ticker', sa.String(), nullable=False),
        sa.Column('target_dividend_yield', sa.Numeric(5, 2), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ticker', name='uq_asset_metadata_ticker')
    )
    op.create_index('idx_asset_metadata_ticker', 'asset_metadata', ['ticker'])


def downgrade() -> None:
    # Drop asset_metadata table
    op.drop_index('idx_asset_metadata_ticker', table_name='asset_metadata')
    op.drop_table('asset_metadata')
