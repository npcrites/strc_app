"""add_business_day_adjusted_dates

Revision ID: 0f8fc013d982
Revises: 5a1d881601ca
Create Date: 2026-01-17 13:38:21.050096

"""
from typing import Sequence, Union
import logging

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision: str = '0f8fc013d982'
down_revision: Union[str, None] = '5a1d881601ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add business day adjusted date columns to ex_dates and dividends tables.
    
    For ex_dates:
    - invest_by_date: Last business day on or before ex_date (when investors need to buy)
    
    For dividends:
    - invest_by_date: Last business day on or before ex_date (when investors need to buy)
    - pay_date_adjusted: Next business day on or after pay_date (actual payment date if pay_date falls on weekend/holiday)
    
    Note: Existing records will have these columns set to NULL initially.
    They will be populated by the DividendDataService when it runs next or when backfilled.
    """
    logger.info("Adding invest_by_date column to ex_dates table...")
    try:
        op.add_column('ex_dates', sa.Column('invest_by_date', sa.Date(), nullable=True))
        op.create_index('idx_ex_dates_invest_by_date', 'ex_dates', ['invest_by_date'])
        logger.info("Successfully added invest_by_date column to ex_dates table")
    except Exception as e:
        logger.error(f"Error adding invest_by_date to ex_dates: {e}")
        raise
    
    logger.info("Adding invest_by_date and pay_date_adjusted columns to dividends table...")
    try:
        op.add_column('dividends', sa.Column('invest_by_date', sa.Date(), nullable=True))
        op.add_column('dividends', sa.Column('pay_date_adjusted', sa.Date(), nullable=True))
        op.create_index('idx_dividends_invest_by_date', 'dividends', ['invest_by_date'])
        op.create_index('idx_dividends_pay_date_adjusted', 'dividends', ['pay_date_adjusted'])
        logger.info("Successfully added invest_by_date and pay_date_adjusted columns to dividends table")
    except Exception as e:
        logger.error(f"Error adding columns to dividends: {e}")
        raise
    
    # Note: pay_date in dividends is already nullable, so no change needed there
    logger.info("Migration completed. Existing records will have NULL values for new columns.")
    logger.info("Run DividendDataService to populate these values for existing records.")


def downgrade() -> None:
    """Remove business day adjusted date columns from ex_dates and dividends tables"""
    logger.info("Removing invest_by_date column from ex_dates table...")
    try:
        op.drop_index('idx_ex_dates_invest_by_date', table_name='ex_dates')
        op.drop_column('ex_dates', 'invest_by_date')
        logger.info("Successfully removed invest_by_date column from ex_dates table")
    except Exception as e:
        logger.warning(f"Error removing invest_by_date from ex_dates: {e}")
    
    logger.info("Removing invest_by_date and pay_date_adjusted columns from dividends table...")
    try:
        op.drop_index('idx_dividends_invest_by_date', table_name='dividends')
        op.drop_index('idx_dividends_pay_date_adjusted', table_name='dividends')
        op.drop_column('dividends', 'invest_by_date')
        op.drop_column('dividends', 'pay_date_adjusted')
        logger.info("Successfully removed columns from dividends table")
    except Exception as e:
        logger.warning(f"Error removing columns from dividends: {e}")
