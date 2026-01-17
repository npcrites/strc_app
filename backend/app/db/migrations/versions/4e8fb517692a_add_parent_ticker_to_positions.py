"""add_parent_ticker_to_positions

Revision ID: 4e8fb517692a
Revises: 32e645ef7764
Create Date: 2026-01-14 19:01:20.236660

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e8fb517692a'
down_revision: Union[str, None] = '32e645ef7764'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add parent_ticker column to positions table
    op.add_column('positions', sa.Column('parent_ticker', sa.String(), nullable=True))
    
    # Create index for efficient querying by parent_ticker
    op.create_index('idx_positions_parent_ticker', 'positions', ['parent_ticker'])


def downgrade() -> None:
    # Drop index
    op.drop_index('idx_positions_parent_ticker', table_name='positions')
    
    # Drop parent_ticker column
    op.drop_column('positions', 'parent_ticker')
