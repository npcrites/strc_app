"""
Utility functions
"""
from typing import Any, Dict, Optional
from datetime import datetime


def format_currency(amount: float) -> str:
    """Format amount as currency string"""
    return f"${amount:,.2f}"


def format_percentage(value: float) -> str:
    """Format value as percentage"""
    return f"{value:.2f}%"


def get_parent_ticker(ticker: str) -> Optional[str]:
    """
    Get the parent ticker for a given ticker symbol.
    
    Maps child tickers to their parent company tickers.
    Returns None if the ticker is a standalone asset (no parent).
    
    Args:
        ticker: Ticker symbol (e.g., "STRC", "MSTR-A", "SATA")
    
    Returns:
        Parent ticker if applicable, None otherwise
    
    Examples:
        get_parent_ticker("STRC") -> "MSTR"
        get_parent_ticker("STRD") -> "MSTR"
        get_parent_ticker("SATA") -> "ASST"
        get_parent_ticker("AAPL") -> None
    """
    ticker_upper = ticker.upper()
    
    # Parent ticker mappings
    # Strive Asset Management products (credit products) -> MicroStrategy
    if ticker_upper in ["STRC", "STRD", "STRF", "STRK"]:
        return "MSTR"
    
    # SATA -> ASST
    if ticker_upper == "SATA":
        return "ASST"
    
    # Handle tickers with suffixes like "MSTR-A" -> "MSTR"
    # This pattern matches preferred stock or other child securities
    if "-" in ticker_upper:
        base_ticker = ticker_upper.split("-")[0]
        # Only return parent if base ticker is a known parent
        # For now, we only know MSTR is a parent, but this can be extended
        if base_ticker == "MSTR":
            return base_ticker
    
    # No parent for this ticker
    return None


def calculate_percentage_change(old_value: float, new_value: float) -> float:
    """Calculate percentage change between two values"""
    if old_value == 0:
        return 0.0
    return ((new_value - old_value) / old_value) * 100


def parse_date(date_string: str) -> datetime:
    """Parse date string to datetime object"""
    try:
        return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
    except ValueError:
        return datetime.strptime(date_string, "%Y-%m-%d")


def serialize_model(model: Any) -> Dict:
    """Serialize SQLAlchemy model to dict"""
    if hasattr(model, '__dict__'):
        return {k: v for k, v in model.__dict__.items() if not k.startswith('_')}
    return model


