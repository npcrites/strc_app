"""add_dividend_frequency_to_positions

Revision ID: 90f7e1670728
Revises: 0f8fc013d982
Create Date: 2026-01-19 16:16:43.911048

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '90f7e1670728'
down_revision: Union[str, None] = '0f8fc013d982'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add dividend_frequency column to positions table
    op.add_column('positions', sa.Column('dividend_frequency', sa.String(), nullable=True))
    
    # Set default values based on ticker
    # SATA and STRC are monthly, rest are quarterly
    connection = op.get_bind()
    connection.execute(
        sa.text("""
            UPDATE positions 
            SET dividend_frequency = 'monthly' 
            WHERE UPPER(ticker) IN ('SATA', 'STRC')
        """)
    )
    connection.execute(
        sa.text("""
            UPDATE positions 
            SET dividend_frequency = 'quarterly' 
            WHERE dividend_frequency IS NULL
        """)
    )


def downgrade() -> None:
    # Remove dividend_frequency column from positions table
    op.drop_column('positions', 'dividend_frequency')
