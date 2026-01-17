"""
NAV Service for fetching and storing Net Asset Value data
"""
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from app.models.asset_metrics import AssetMetrics
from app.core.utils import get_parent_ticker
from app.core.config import settings
import logging
import requests
from dateutil import parser

logger = logging.getLogger(__name__)

# Bitcoin Treasuries API base URL
BT_API_BASE_URL = "https://playground.bitcointreasuries.net"


def fetch_company_latest(ticker: str) -> Optional[Dict]:
    """
    Fetch latest company data from Bitcoin Treasuries API v1 /companies/:symbol/latest endpoint.
    Returns all available data for the details section.
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
    
    Returns:
        Dict with company data or None if unavailable
    """
    try:
        url = f"{BT_API_BASE_URL}/api/v1/companies/{ticker.upper()}/latest"
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Check if the response indicates success
        if isinstance(data, dict) and data.get("success") == False:
            error_msg = data.get("error") or data.get("message", "Unknown error")
            logger.warning(f"API returned error for {ticker}: {error_msg}")
            return None
        
        # Return the data dictionary
        if isinstance(data, dict):
            return data
        else:
            logger.warning(f"Unexpected response format from companies/{ticker}/latest: {type(data)}")
            return None
            
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching companies/{ticker}/latest: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching companies/{ticker}/latest: {str(e)}", exc_info=True)
        return None


def fetch_mnav_latest(ticker: str) -> Optional[Dict]:
    """
    Fetch latest mNAV data from Bitcoin Treasuries API v1 endpoint.
    DEPRECATED: Use fetch_company_latest() instead.
    """
    return fetch_company_latest(ticker)


def fetch_company_history(ticker: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, limit: int = 1000) -> List[Dict]:
    """
    Fetch company history from Bitcoin Treasuries API v1 /companies/:symbol/history endpoint.
    
    Note: API has a limit of 1000 records per request.
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
        start_date: Optional start date for filtering
        end_date: Optional end date for filtering
        limit: Maximum number of records to fetch (default 1000, which is the API limit)
    
    Returns:
        List of historical data points
    """
    try:
        url = f"{BT_API_BASE_URL}/api/v1/companies/{ticker.upper()}/history"
        params = {}
        
        # Add date filters if provided
        if start_date:
            params["start"] = start_date.isoformat()
        if end_date:
            params["end"] = end_date.isoformat()
        
        # Add limit (API limit is 1000)
        if limit:
            params["limit"] = min(limit, 1000)  # Ensure we don't exceed API limit
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        
        data = response.json()
        
        # Check if the response indicates success
        if isinstance(data, dict) and data.get("success") == False:
            error_msg = data.get("error") or data.get("message", "Unknown error")
            logger.warning(f"API returned error for {ticker} history: {error_msg}")
            return []
        
        # Return the data list
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            # Some APIs return data in a "data" or "history" field
            if "data" in data:
                return data["data"]
            elif "history" in data:
                return data["history"]
            else:
                logger.warning(f"Unexpected response format from companies/{ticker}/history: {type(data)}")
                return []
        else:
            logger.warning(f"Unexpected response format from companies/{ticker}/history: {type(data)}")
            return []
            
    except requests.exceptions.RequestException as e:
        logger.warning(f"Error fetching companies/{ticker}/history: {str(e)}")
        return []
    except Exception as e:
        logger.error(f"Unexpected error fetching companies/{ticker}/history: {str(e)}", exc_info=True)
        return []


def fetch_company_data_from_api(ticker: str) -> Optional[Dict]:
    """
    Fetch company data from Bitcoin Treasuries API companies endpoint.
    Returns all company data including btcHoldings, marketCap, mNav, btcNav, etc.
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
    
    Returns:
        Dict with company data or None if unavailable
    """
    try:
        # Fetch all companies from the companies endpoint
        url = f"{BT_API_BASE_URL}/api/companies"
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # The API returns a list of company objects
        if not isinstance(data, list):
            logger.warning(f"Unexpected response format for companies endpoint: expected list, got {type(data)}")
            return None
        
        # Find the company with matching symbol/ticker
        ticker_upper = ticker.upper()
        company = None
        for comp in data:
            if comp.get("symbol", "").upper() == ticker_upper:
                company = comp
                break
        
        if not company:
            logger.warning(f"No company found with ticker {ticker}")
            return None
        
        return company
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching company data from API for {ticker}: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error fetching company data for {ticker}: {str(e)}", exc_info=True)
        return None


def fetch_nav_from_api(ticker: str) -> Optional[float]:
    """
    Fetch current NAV from Bitcoin Treasuries API companies endpoint.
    
    Args:
        ticker: Parent ticker symbol (e.g., "MSTR", "ASST")
    
    Returns:
        NAV value (mNav) or None if unavailable
    """
    company_data = fetch_company_data_from_api(ticker)
    if not company_data:
        return None
    
    # Extract mNav (market-adjusted NAV) - the API uses camelCase "mNav"
    nav = company_data.get("mNav")
    
    if nav is not None:
        try:
            nav_float = float(nav)
            logger.info(f"Fetched NAV for {ticker}: {nav_float}")
            return nav_float
        except (ValueError, TypeError):
            logger.warning(f"Invalid NAV value for {ticker}: {nav}")
            return None
    else:
        logger.warning(f"No mNav field found in response for {ticker}")
        return None


def fetch_nav_history_from_api(ticker: str, start_date: datetime, end_date: datetime) -> List[Dict]:
    """
    Fetch NAV history from Bitcoin Treasuries API.
    
    Note: The history endpoint may not be available yet. For now, we'll return
    the current NAV as a single data point. This can be extended when the
    history endpoint becomes available.
    
    Args:
        ticker: Parent ticker symbol
        start_date: Start date for history
        end_date: End date for history
    
    Returns:
        List of dicts with 'timestamp' and 'value' keys
    """
    try:
        # For now, the history endpoint doesn't seem to be available
        # We'll fetch the current NAV and return it as a single point
        # This can be updated when the history endpoint is available
        
        current_nav = fetch_nav_from_api(ticker)
        if current_nav:
            return [{
                "timestamp": datetime.now(timezone.utc),
                "value": current_nav
            }]
        
        logger.warning(f"Could not fetch NAV history for {ticker} - history endpoint may not be available")
        return []
        
    except Exception as e:
        logger.error(f"Unexpected error fetching NAV history for {ticker}: {str(e)}", exc_info=True)
        return []


def store_metric_if_new(
    db: Session,
    ticker: str,
    metric_type: str,
    value: Optional[float],
    timestamp: datetime,
    is_parent_level: bool = True
) -> bool:
    """
    Store a metric if it doesn't already exist for that timestamp.
    
    Args:
        db: Database session
        ticker: Ticker symbol
        metric_type: Type of metric (e.g., "nav", "btc_holdings", "market_cap", "btc_nav", "mnav")
        value: Metric value (None values are skipped)
        timestamp: Timestamp for the metric
        is_parent_level: Whether this is a parent-level metric
    
    Returns:
        True if metric was created, False if skipped or already exists
    """
    if value is None:
        return False
    
    try:
        # Ensure timezone-aware
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        
        # Check if metric already exists for this timestamp
        existing = db.query(AssetMetrics).filter(
            AssetMetrics.ticker == ticker,
            AssetMetrics.metric_type == metric_type,
            AssetMetrics.is_parent_level == is_parent_level,
            AssetMetrics.timestamp == timestamp
        ).first()
        
        if existing:
            return False
        
        metric = AssetMetrics(
            ticker=ticker,
            metric_type=metric_type,
            value=Decimal(str(value)),
            timestamp=timestamp,
            is_parent_level=is_parent_level
        )
        db.add(metric)
        return True
        
    except Exception as e:
        logger.error(f"Error storing metric {metric_type} for {ticker}: {str(e)}", exc_info=True)
        return False


def store_parent_metrics_from_company_data(
    db: Session,
    parent_ticker: str,
    company_data: Dict,
    timestamp: Optional[datetime] = None
) -> int:
    """
    Store all parent company metrics from company data dictionary.
    
    Args:
        db: Database session
        parent_ticker: Parent ticker symbol
        company_data: Company data dictionary from API
        timestamp: Timestamp for metrics (defaults to now)
    
    Returns:
        Number of metrics created
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    
    created_count = 0
    
    # Extract and store mNav
    mnav = company_data.get("mNav")
    if mnav is not None:
        try:
            mnav_float = float(mnav)
            if store_metric_if_new(db, parent_ticker, "mnav", mnav_float, timestamp, True):
                created_count += 1
        except (ValueError, TypeError):
            pass
    
    # Extract and store btcHoldings
    btc_holdings = company_data.get("btcHoldings")
    if btc_holdings is not None:
        try:
            btc_holdings_float = float(btc_holdings)
            if store_metric_if_new(db, parent_ticker, "btc_holdings", btc_holdings_float, timestamp, True):
                created_count += 1
        except (ValueError, TypeError):
            pass
    
    # Extract and store marketCap
    market_cap = company_data.get("marketCap")
    if market_cap is not None:
        try:
            market_cap_float = float(market_cap)
            if store_metric_if_new(db, parent_ticker, "market_cap", market_cap_float, timestamp, True):
                created_count += 1
        except (ValueError, TypeError):
            pass
    
    # Extract and store btcNav
    btc_nav = company_data.get("btcNav")
    if btc_nav is not None:
        try:
            btc_nav_float = float(btc_nav)
            if store_metric_if_new(db, parent_ticker, "btc_nav", btc_nav_float, timestamp, True):
                created_count += 1
        except (ValueError, TypeError):
            pass
    
    return created_count


def ensure_nav_data_for_parent(
    db: Session,
    parent_ticker: str,
    fetch_history: bool = True
) -> int:
    """
    Ensure NAV data exists for a parent ticker.
    Fetches current NAV and optionally historical NAV if not already in database.
    Also fetches and stores btcHoldings, marketCap, btcNav, and mNav.
    
    Args:
        db: Database session
        parent_ticker: Parent ticker symbol
        fetch_history: Whether to fetch historical NAV (default True)
    
    Returns:
        Number of metrics created
    """
    created_count = 0
    
    try:
        # Fetch company data (includes all metrics)
        company_data = fetch_company_data_from_api(parent_ticker)
        if not company_data:
            logger.warning(f"Could not fetch company data for {parent_ticker}")
            return created_count
        
        # Store all metrics from current company data
        now = datetime.now(timezone.utc)
        created_count += store_parent_metrics_from_company_data(db, parent_ticker, company_data, now)
        
        # Fetch historical NAV if requested and we don't have much data
        if fetch_history:
            existing_count = db.query(AssetMetrics).filter(
                AssetMetrics.ticker == parent_ticker,
                AssetMetrics.metric_type == "nav",
                AssetMetrics.is_parent_level == True
            ).count()
            
            # Only fetch history if we have less than 30 days of data
            if existing_count < 30:
                end_date = datetime.now(timezone.utc)
                start_date = end_date - timedelta(days=365)  # Last year
                
                nav_history = fetch_nav_history_from_api(parent_ticker, start_date, end_date)
                
                for nav_point in nav_history:
                    timestamp = nav_point.get("timestamp")
                    value = nav_point.get("value")
                    
                    if not timestamp or value is None:
                        continue
                    
                    # Ensure timezone-aware
                    if timestamp.tzinfo is None:
                        timestamp = timestamp.replace(tzinfo=timezone.utc)
                    
                    # Check if metric already exists
                    existing = db.query(AssetMetrics).filter(
                        AssetMetrics.ticker == parent_ticker,
                        AssetMetrics.metric_type == "nav",
                        AssetMetrics.is_parent_level == True,
                        AssetMetrics.timestamp == timestamp
                    ).first()
                    
                    if not existing:
                        metric = AssetMetrics(
                            ticker=parent_ticker,
                            metric_type="nav",
                            value=Decimal(str(value)),
                            timestamp=timestamp,
                            is_parent_level=True
                        )
                        db.add(metric)
                        created_count += 1
        
        return created_count
        
    except Exception as e:
        logger.error(f"Error ensuring NAV data for {parent_ticker}: {str(e)}", exc_info=True)
        return created_count


def ensure_nav_for_new_position(
    db: Session,
    ticker: str
) -> None:
    """
    Ensure NAV data exists for the parent company of a newly added position.
    Called automatically when a new position is created.
    
    Args:
        db: Database session
        ticker: Asset ticker (e.g., "STRC") - will look up parent
    """
    parent_ticker = get_parent_ticker(ticker)
    if parent_ticker:
        try:
            created = ensure_nav_data_for_parent(db, parent_ticker, fetch_history=True)
            if created > 0:
                db.commit()
                logger.info(f"Fetched {created} NAV metrics for parent {parent_ticker} (triggered by new position {ticker})")
        except Exception as e:
            logger.warning(f"Failed to fetch NAV for parent {parent_ticker}: {str(e)}")
            # Don't fail the position creation if NAV fetch fails
            db.rollback()

