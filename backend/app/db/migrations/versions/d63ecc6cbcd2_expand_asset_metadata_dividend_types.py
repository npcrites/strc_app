"""expand_asset_metadata_dividend_types

Revision ID: d63ecc6cbcd2
Revises: 25f0d40f7ce5
Create Date: 2026-01-19 17:18:14.420957

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd63ecc6cbcd2'
down_revision: Union[str, None] = '25f0d40f7ce5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to asset_metadata table
    op.add_column('asset_metadata', sa.Column('dividend_calculation_type', sa.String(), nullable=True))
    op.add_column('asset_metadata', sa.Column('fixed_dividend_per_share', sa.Numeric(precision=10, scale=4), nullable=True))
    op.add_column('asset_metadata', sa.Column('dividend_rate_percentage', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('asset_metadata', sa.Column('is_cumulative', sa.Boolean(), nullable=True))
    op.add_column('asset_metadata', sa.Column('dividend_frequency', sa.String(), nullable=True))
    op.add_column('asset_metadata', sa.Column('special_features', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove new columns from asset_metadata table
    op.drop_column('asset_metadata', 'special_features')
    op.drop_column('asset_metadata', 'dividend_frequency')
    op.drop_column('asset_metadata', 'is_cumulative')
    op.drop_column('asset_metadata', 'dividend_rate_percentage')
    op.drop_column('asset_metadata', 'fixed_dividend_per_share')
    op.drop_column('asset_metadata', 'dividend_calculation_type')
