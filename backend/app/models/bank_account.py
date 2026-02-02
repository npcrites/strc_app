"""
Bank Account model for Plaid integration
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Index, Boolean
from sqlalchemy.orm import relationship
from app.db.base import Base
from datetime import datetime


class BankAccount(Base):
    """Bank Account model representing Plaid-linked bank accounts"""
    __tablename__ = "bank_accounts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Plaid identifiers
    plaid_item_id = Column(String, nullable=False, index=True)  # Plaid Item ID (one per institution)
    plaid_access_token = Column(Text, nullable=False)  # Encrypted access token
    plaid_account_id = Column(String, nullable=False, unique=True, index=True)  # Plaid Account ID
    
    # Account information
    account_name = Column(String, nullable=True)  # User-friendly name
    account_type = Column(String, nullable=True)  # e.g., "depository", "credit", "loan"
    account_subtype = Column(String, nullable=True)  # e.g., "checking", "savings", "credit card"
    institution_name = Column(String, nullable=True)  # Bank name
    institution_id = Column(String, nullable=True)  # Plaid institution ID
    
    # Account details
    mask = Column(String, nullable=True)  # Last 4 digits (e.g., "0000")
    official_name = Column(String, nullable=True)  # Official account name from bank
    
    # Balance information (cached, updated via Plaid sync)
    balance_available = Column(String, nullable=True)  # Available balance (as string to preserve precision)
    balance_current = Column(String, nullable=True)  # Current balance
    balance_limit = Column(String, nullable=True)  # Credit limit (for credit accounts)
    balance_iso_currency_code = Column(String, nullable=True, default="USD")
    
    # Metadata
    is_primary = Column(Boolean, nullable=False, default=False)  # Primary account for transfers
    is_active = Column(Boolean, nullable=False, default=True)  # Account is active/usable
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_synced_at = Column(DateTime, nullable=True)  # Last time we synced with Plaid
    
    # Relationships
    user = relationship("User", back_populates="bank_accounts")
    
    # Indexes
    __table_args__ = (
        Index('idx_bank_accounts_user_id', 'user_id'),
        Index('idx_bank_accounts_plaid_item_id', 'plaid_item_id'),
        Index('idx_bank_accounts_plaid_account_id', 'plaid_account_id', unique=True),
    )

