"""
Utility functions
"""
from typing import Any, Dict
from datetime import datetime


def format_currency(amount: float) -> str:
    """Format amount as currency string"""
    return f"${amount:,.2f}"


def format_percentage(value: float) -> str:
    """Format value as percentage"""
    return f"{value:.2f}%"


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


