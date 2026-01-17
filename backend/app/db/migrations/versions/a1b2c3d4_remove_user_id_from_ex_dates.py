"""remove_user_id_from_ex_dates

Revision ID: a1b2c3d4
Revises: f9ba7060517d
Create Date: 2026-01-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4'
down_revision: Union[str, None] = 'f9ba7060517d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop foreign key constraint
    try:
        op.drop_constraint('ex_dates_user_id_fkey', 'ex_dates', type_='foreignkey')
    except Exception:
        pass  # Constraint might not exist
    
    # Drop indexes that include user_id
    try:
        op.drop_index('idx_ex_dates_user_id', table_name='ex_dates')
    except Exception:
        pass  # Index might not exist
    
    try:
        op.drop_index('ix_ex_dates_user_id', table_name='ex_dates')
    except Exception:
        pass  # Index might not exist
    
    # Drop the old unique constraint
    try:
        op.drop_constraint('uq_ex_dates_user_ticker_date', 'ex_dates', type_='unique')
    except Exception:
        pass  # Constraint might not exist
    
    # Remove user_id column
    try:
        op.drop_column('ex_dates', 'user_id')
    except Exception:
        pass  # Column might not exist
    
    # Add new unique constraint on (ticker, ex_date)
    try:
        op.create_unique_constraint('uq_ex_dates_ticker_date', 'ex_dates', ['ticker', 'ex_date'])
    except Exception:
        pass  # Constraint might already exist


def downgrade() -> None:
    # Add user_id column back (nullable initially, but can be made required in application)
    try:
        op.add_column('ex_dates', sa.Column('user_id', sa.Integer(), nullable=True))
    except Exception:
        pass
    
    # Recreate foreign key constraint
    try:
        op.create_foreign_key('ex_dates_user_id_fkey', 'ex_dates', 'users', ['user_id'], ['id'], ondelete='CASCADE')
    except Exception:
        pass
    
    # Recreate indexes
    try:
        op.create_index('idx_ex_dates_user_id', 'ex_dates', ['user_id'])
    except Exception:
        pass
    
    try:
        op.create_index('ix_ex_dates_user_id', 'ex_dates', ['user_id'])
    except Exception:
        pass
    
    # Drop new unique constraint
    try:
        op.drop_constraint('uq_ex_dates_ticker_date', 'ex_dates', type_='unique')
    except Exception:
        pass
    
    # Recreate old unique constraint
    try:
        op.create_unique_constraint('uq_ex_dates_user_ticker_date', 'ex_dates', ['user_id', 'ticker', 'ex_date'])
    except Exception:
        pass

