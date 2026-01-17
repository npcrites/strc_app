"""add_dividend_unique_constraint

Revision ID: 5a1d881601ca
Revises: a1b2c3d4
Create Date: 2026-01-17 13:06:14.754757

"""
from typing import Sequence, Union
import logging

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision: str = '5a1d881601ca'
down_revision: Union[str, None] = 'a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add unique constraint to dividends table to prevent duplicate dividend records
    for the same user, position, ticker, and ex-date combination.
    
    Note: PostgreSQL treats NULL != NULL in unique constraints, so multiple rows
    with NULL position_id won't violate the constraint. This is the desired behavior
    since position_id can be NULL for some dividend records.
    """
    try:
        # First, check if there are any duplicate records and handle them if needed
        # This query will find duplicates based on user_id, position_id, ticker, ex_date
        connection = op.get_bind()
        duplicates = connection.execute(sa.text("""
            SELECT user_id, position_id, ticker, ex_date, COUNT(*) as count
            FROM dividends
            WHERE ex_date IS NOT NULL
            GROUP BY user_id, position_id, ticker, ex_date
            HAVING COUNT(*) > 1
        """))
        
        duplicate_rows = duplicates.fetchall()
        if duplicate_rows:
            logger.warning(f"Found {len(duplicate_rows)} duplicate dividend records. Cleaning up...")
            # For each duplicate group, keep the most recent one and delete others
            for dup in duplicate_rows:
                user_id, position_id, ticker, ex_date, count = dup
                if position_id:
                    # Keep the most recent record (highest id) and delete others
                    connection.execute(sa.text("""
                        DELETE FROM dividends
                        WHERE id NOT IN (
                            SELECT MAX(id)
                            FROM dividends
                            WHERE user_id = :user_id
                              AND position_id = :position_id
                              AND ticker = :ticker
                              AND ex_date = :ex_date
                        )
                        AND user_id = :user_id
                        AND position_id = :position_id
                        AND ticker = :ticker
                        AND ex_date = :ex_date
                    """), {
                        "user_id": user_id,
                        "position_id": position_id,
                        "ticker": ticker,
                        "ex_date": ex_date
                    })
                else:
                    # Handle NULL position_id separately
                    connection.execute(sa.text("""
                        DELETE FROM dividends
                        WHERE id NOT IN (
                            SELECT MAX(id)
                            FROM dividends
                            WHERE user_id = :user_id
                              AND position_id IS NULL
                              AND ticker = :ticker
                              AND ex_date = :ex_date
                        )
                        AND user_id = :user_id
                        AND position_id IS NULL
                        AND ticker = :ticker
                        AND ex_date = :ex_date
                    """), {
                        "user_id": user_id,
                        "ticker": ticker,
                        "ex_date": ex_date
                    })
        
        # Add unique constraint
        op.create_unique_constraint(
            'uq_dividends_user_position_ticker_ex_date',
            'dividends',
            ['user_id', 'position_id', 'ticker', 'ex_date']
        )
        logger.info("Successfully added unique constraint to dividends table")
    except Exception as e:
        logger.error(f"Error adding unique constraint to dividends: {e}")
        # Re-raise to fail the migration if constraint creation fails
        raise


def downgrade() -> None:
    """Remove unique constraint from dividends table"""
    try:
        op.drop_constraint(
            'uq_dividends_user_position_ticker_ex_date',
            'dividends',
            type_='unique'
        )
    except Exception as e:
        logger.warning(f"Error dropping unique constraint from dividends: {e}")
        # Don't fail migration if constraint doesn't exist
        pass
