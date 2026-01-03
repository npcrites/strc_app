"""remove_created_at_from_position_snapshots

Revision ID: 32e645ef7764
Revises: be19e6cc6621
Create Date: 2026-01-02 22:02:48.123456

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32e645ef7764'
down_revision: Union[str, None] = 'be19e6cc6621'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove created_at column from position_snapshots (not in model)
    op.execute("""
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'position_snapshots' 
                AND column_name = 'created_at'
            ) THEN
                ALTER TABLE position_snapshots 
                DROP COLUMN created_at;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Add created_at back (for rollback)
    op.execute("""
        ALTER TABLE position_snapshots 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    """)
