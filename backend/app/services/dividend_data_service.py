"""
Dividend Data Service for fetching and syncing dividend data from Alpha Vantage API
"""
import httpx
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, date, timedelta
from decimal import Decimal
from app.models.ex_date import ExDate
from app.models.dividend import Dividend, DividendStatus
from app.models.position import Position
from app.core.config import settings
from app.services.market_hours_service import MarketHoursService
import logging

logger = logging.getLogger(__name__)


class DividendDataService:
    """Service for fetching and syncing dividend data from Alpha Vantage API"""
    
    BASE_URL = "https://www.alphavantage.co"
    
    def __init__(self):
        self.api_key = settings.ALPHA_VANTAGE_API_KEY
        if not self.api_key:
            logger.warning("Alpha Vantage API key not configured")
        self.market_hours_service = MarketHoursService()
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for API requests"""
        return {
            "Accept": "application/json",
        }
    
    def fetch_historical_dividends(self, ticker: str) -> List[Dict]:
        """
        Fetch historical dividend data from Alpha Vantage API
        
        Args:
            ticker: Stock ticker symbol (e.g., "STRC")
            
        Returns:
            List of dividend dictionaries with parsed data
        """
        if not self.api_key:
            logger.error("Alpha Vantage API key not configured")
            return []
        
        try:
            # Alpha Vantage endpoint: /query?function=DIVIDENDS&symbol={ticker}
            url = f"{self.BASE_URL}/query"
            params = {
                "function": "DIVIDENDS",
                "symbol": ticker,
                "apikey": self.api_key
            }
            
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, headers=self._get_headers(), params=params)
                
                if response.status_code == 404:
                    logger.warning(f"Ticker {ticker} not found in Alpha Vantage API")
                    return []
                
                if response.status_code == 403 or response.status_code == 429:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("Error Message", error_data.get("Note", response.text))
                    logger.error(f"Alpha Vantage API access denied for {ticker}: {error_msg}")
                    return []
                
                response.raise_for_status()
                data = response.json()
                
                # Alpha Vantage returns: {"symbol": "STRC", "data": [{"ex_dividend_date": "...", "payment_date": "...", "amount": "..."}, ...]}
                # Or error: {"Error Message": "..."} or {"Note": "..."}
                
                if "Error Message" in data:
                    logger.error(f"Alpha Vantage API error for {ticker}: {data['Error Message']}")
                    return []
                
                if "Note" in data:
                    # Check if this is just an informational message but data still exists
                    note = data.get("Note", "")
                    if "rate limit" in note.lower() or "premium" in note.lower():
                        logger.warning(f"Alpha Vantage rate limit or premium notice for {ticker}: {note}")
                        # If "data" field exists, continue processing; otherwise return empty
                        if "data" not in data:
                            return []
                    else:
                        logger.warning(f"Alpha Vantage API note for {ticker}: {note}")
                        return []
                
                if "Information" in data:
                    # Information field is often just a rate limit warning, but data might still be there
                    info = data.get("Information", "")
                    logger.debug(f"Alpha Vantage information for {ticker}: {info}")
                    # If only Information field exists without data, this is a rate limit
                    if "data" not in data:
                        logger.warning(f"Alpha Vantage rate limit hit for {ticker}. Data not available.")
                        return []
                    # Continue to check for data field if it exists
                
                # Get dividends array - Alpha Vantage uses "data" key
                dividend_list = data.get("data", [])
                
                if not dividend_list:
                    logger.debug(f"No dividend data returned for {ticker}")
                    return []
                
                dividends = []
                for item in dividend_list:
                    # Alpha Vantage uses: ex_dividend_date, payment_date, amount
                    ex_date = None
                    payment_date = None
                    dividend_amount = None
                    
                    # Parse ex_dividend_date
                    ex_date_str = item.get("ex_dividend_date") or item.get("exDividendDate") or item.get("ex_date")
                    if ex_date_str:
                        try:
                            # Alpha Vantage typically uses YYYY-MM-DD format
                            ex_date = datetime.strptime(str(ex_date_str), "%Y-%m-%d").date()
                        except (ValueError, TypeError) as e:
                            logger.debug(f"Error parsing ex_dividend_date '{ex_date_str}' for {ticker}: {e}")
                            continue
                    
                    # Parse payment_date
                    payment_date_str = item.get("payment_date") or item.get("paymentDate") or item.get("pay_date")
                    if payment_date_str:
                        try:
                            payment_date = datetime.strptime(str(payment_date_str), "%Y-%m-%d").date()
                        except (ValueError, TypeError):
                            # Try to parse but don't fail if it doesn't work
                            pass
                    
                    # Parse amount
                    amount_val = item.get("amount") or item.get("dividend") or item.get("dividendAmount")
                    if amount_val is not None:
                        try:
                            dividend_amount = str(float(amount_val))
                        except (ValueError, TypeError):
                            pass
                    
                    # Only add if we have ex_date (required)
                    if ex_date:
                        dividends.append({
                            "ticker": ticker,
                            "ex_date": ex_date,
                            "pay_date": payment_date,
                            "dividend_amount": dividend_amount,
                        })
                    else:
                        logger.debug(f"Skipping dividend record for {ticker} - missing ex_dividend_date: {item}")
                
                logger.info(f"Fetched {len(dividends)} dividends from Alpha Vantage for {ticker}")
                return dividends
                
        except httpx.HTTPStatusError as e:
            logger.error(f"Alpha Vantage API HTTP error for {ticker}: {e.response.status_code} - {e.response.text}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Alpha Vantage API request error for {ticker}: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Error fetching dividends from Alpha Vantage for {ticker}: {str(e)}", exc_info=True)
            return []
    
    def fetch_dividend_calendar(self, from_date: date, to_date: date) -> List[Dict]:
        """
        Fetch dividend data from FMP dividend calendar endpoint (Option C)
        This endpoint can fetch multiple tickers at once for a date range
        
        Args:
            from_date: Start date for the calendar query
            to_date: End date for the calendar query
            
        Returns:
            List of dividend dictionaries with parsed data
        """
        if not self.api_key:
            logger.error("FMP API key not configured")
            return []
        
        try:
            # Use dividend calendar endpoint: /api/v3/stock_dividend_calendar
            url = f"{self.BASE_URL}/api/v3/stock_dividend_calendar"
            params = {
                "from": from_date.strftime("%Y-%m-%d"),
                "to": to_date.strftime("%Y-%m-%d"),
                "apikey": self.api_key
            }
            
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, headers=self._get_headers(), params=params)
                
                if response.status_code == 404:
                    logger.warning(f"No dividend calendar data found for date range {from_date} to {to_date}")
                    return []
                
                if response.status_code == 403 or response.status_code == 402:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("Error Message", response.text)
                    logger.error(f"FMP API access denied for dividend calendar: {error_msg}")
                    return []
                
                response.raise_for_status()
                data = response.json()
                
                # Parse response - calendar endpoint returns a list
                if isinstance(data, list):
                    calendar_list = data
                elif isinstance(data, dict):
                    calendar_list = data.get("calendar", data.get("dividends", []))
                else:
                    logger.warning(f"Unexpected response format for dividend calendar: {type(data)}")
                    return []
                
                dividends = []
                for item in calendar_list:
                    # Parse fields
                    ex_date = None
                    payment_date = None
                    dividend_amount = None
                    ticker = item.get("symbol") or item.get("ticker")
                    
                    if not ticker:
                        continue
                    
                    # Try different possible field names for ex-date
                    for date_field in ["date", "exDividendDate", "ex_date", "exDate", "exDividend", "exDividendDate"]:
                        if date_field in item and item[date_field]:
                            try:
                                date_str = str(item[date_field])
                                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"]:
                                    try:
                                        ex_date = datetime.strptime(date_str, fmt).date()
                                        break
                                    except ValueError:
                                        continue
                                if ex_date:
                                    break
                            except (ValueError, TypeError):
                                continue
                    
                    # Try different possible field names for payment date
                    for pay_field in ["paymentDate", "payDate", "payment_date", "pay_date", "payment"]:
                        if pay_field in item and item[pay_field]:
                            try:
                                date_str = str(item[pay_field])
                                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"]:
                                    try:
                                        payment_date = datetime.strptime(date_str, fmt).date()
                                        break
                                    except ValueError:
                                        continue
                                if payment_date:
                                    break
                            except (ValueError, TypeError):
                                continue
                    
                    # Try different possible field names for dividend amount
                    for div_field in ["dividend", "amount", "dividendAmount", "dividend_amount", "adjDividend", "adjDividendAmount"]:
                        if div_field in item and item[div_field] is not None:
                            try:
                                dividend_amount = str(float(item[div_field]))
                                break
                            except (ValueError, TypeError):
                                continue
                    
                    # Only add if we have at least ex_date and ticker matches our allowed list
                    if ex_date and ticker and ticker.upper() in [t.upper() for t in settings.ALLOWED_TICKERS]:
                        dividends.append({
                            "ticker": ticker.upper(),
                            "ex_date": ex_date,
                            "pay_date": payment_date,
                            "dividend_amount": dividend_amount,
                        })
                
                logger.info(f"Fetched {len(dividends)} dividends from calendar for date range {from_date} to {to_date}")
                return dividends
                
        except httpx.HTTPStatusError as e:
            logger.error(f"FMP API HTTP error for dividend calendar: {e.response.status_code} - {e.response.text}")
            return []
        except httpx.RequestError as e:
            logger.error(f"FMP API request error for dividend calendar: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Error fetching dividend calendar: {str(e)}", exc_info=True)
            return []
    
    def sync_ticker_dividends(self, db: Session, ticker: str) -> Dict:
        """
        Sync dividend data for a specific ticker from Alpha Vantage API.
        
        Behavior:
        - If API response contains an ex-date: Override existing (manual or API) with API data
        - If API response contains new ex-date: Create new entry
        - If manual ex-date NOT in API response: Preserve manual entry (don't touch)
        
        Args:
            db: Database session
            ticker: Stock ticker symbol
            
        Returns:
            Dictionary with sync statistics
        """
        stats = {
            "ticker": ticker,
            "fetched": 0,
            "created": 0,
            "updated": 0,
            "errors": 0
        }
        
        try:
            # Fetch dividends from Alpha Vantage
            dividends = self.fetch_historical_dividends(ticker)
            stats["fetched"] = len(dividends)
            
            if not dividends:
                return stats
            
            # Upsert each dividend record from API response
            for div_data in dividends:
                try:
                    if not div_data.get("ex_date"):
                        continue  # Skip records without ex_date
                    
                    # Check if record exists
                    existing = db.query(ExDate).filter(
                        and_(
                            ExDate.ticker == ticker,
                            ExDate.ex_date == div_data["ex_date"]
                        )
                    ).first()
                    
                    if existing:
                        # API contains this ex-date: Override existing (manual or API) with API data
                        updated = False
                        if div_data.get("pay_date"):
                            # Override pay_date if API provides it (even if manual entry has one)
                            if existing.pay_date != div_data["pay_date"]:
                                existing.pay_date = div_data["pay_date"]
                                updated = True
                        if div_data.get("dividend_amount"):
                            # Override dividend_amount if API provides it (even if manual entry has one)
                            if existing.dividend_amount != div_data["dividend_amount"]:
                                existing.dividend_amount = div_data["dividend_amount"]
                                updated = True
                        # Always update source to alpha_vantage_api when API provides the data
                        if existing.source != "alpha_vantage_api":
                            existing.source = "alpha_vantage_api"
                            updated = True
                        
                        # Recalculate invest_by_date (business day before ex_date)
                        invest_by_date = self.market_hours_service.get_business_day_before(existing.ex_date)
                        if existing.invest_by_date != invest_by_date:
                            existing.invest_by_date = invest_by_date
                            updated = True
                        
                        if updated:
                            existing.updated_at = datetime.utcnow()
                            stats["updated"] += 1
                    else:
                        # Calculate invest_by_date (business day before ex_date)
                        invest_by_date = self.market_hours_service.get_business_day_before(div_data["ex_date"])
                        
                        # Create new record for ex-date in API response
                        ex_date = ExDate(
                            ticker=ticker,
                            ex_date=div_data["ex_date"],
                            invest_by_date=invest_by_date,
                            pay_date=div_data.get("pay_date"),
                            dividend_amount=div_data.get("dividend_amount"),
                            source="alpha_vantage_api"
                        )
                        db.add(ex_date)
                        stats["created"] += 1
                    
                except Exception as e:
                    logger.error(f"Error processing dividend record for {ticker}: {str(e)}", exc_info=True)
                    stats["errors"] += 1
            
            # Manual ex-dates NOT in API response are automatically preserved
            # (we only loop through API response items, so we don't touch manual entries)
            
            db.commit()
            logger.info(f"Synced dividends for {ticker}: {stats['created']} created, {stats['updated']} updated")
            return stats
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error syncing dividends for {ticker}: {str(e)}", exc_info=True)
            stats["errors"] += 1
            return stats
    
    def fetch_stable_dividends(self, ticker: str) -> List[Dict]:
        """
        Fetch dividend data from FMP stable endpoint (Option B)
        This endpoint provides recent and upcoming dividends
        
        Args:
            ticker: Stock ticker symbol (e.g., "STRC")
            
        Returns:
            List of dividend dictionaries with parsed data
        """
        if not self.api_key:
            logger.error("FMP API key not configured")
            return []
        
        try:
            # Use the stable endpoint: /stable/dividends?symbol={ticker}
            url = f"{self.BASE_URL}/stable/dividends"
            params = {"symbol": ticker, "apikey": self.api_key}
            
            with httpx.Client(timeout=30.0) as client:
                response = client.get(url, headers=self._get_headers(), params=params)
                
                if response.status_code == 404:
                    logger.warning(f"Ticker {ticker} not found in FMP stable API")
                    return []
                
                if response.status_code == 403:
                    error_data = response.json() if response.text else {}
                    error_msg = error_data.get("Error Message", response.text)
                    logger.error(f"FMP API access denied for {ticker}: {error_msg}")
                    return []
                
                response.raise_for_status()
                data = response.json()
                
                # Parse response - stable endpoint returns a list
                if isinstance(data, list):
                    dividend_list = data
                elif isinstance(data, dict):
                    dividend_list = data.get("dividends", [])
                else:
                    logger.warning(f"Unexpected response format for {ticker}: {type(data)}")
                    return []
                
                dividends = []
                for item in dividend_list:
                    # Parse fields
                    ex_date = None
                    payment_date = None
                    dividend_amount = None
                    
                    # Try different possible field names for ex-date
                    for date_field in ["date", "exDividendDate", "ex_date", "exDate", "exDividend"]:
                        if date_field in item and item[date_field]:
                            try:
                                date_str = str(item[date_field])
                                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"]:
                                    try:
                                        ex_date = datetime.strptime(date_str, fmt).date()
                                        break
                                    except ValueError:
                                        continue
                                if ex_date:
                                    break
                            except (ValueError, TypeError):
                                continue
                    
                    # Try different possible field names for payment date
                    for pay_field in ["paymentDate", "payDate", "payment_date", "pay_date", "payment"]:
                        if pay_field in item and item[pay_field]:
                            try:
                                date_str = str(item[pay_field])
                                for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"]:
                                    try:
                                        payment_date = datetime.strptime(date_str, fmt).date()
                                        break
                                    except ValueError:
                                        continue
                                if payment_date:
                                    break
                            except (ValueError, TypeError):
                                continue
                    
                    # Try different possible field names for dividend amount
                    for div_field in ["dividend", "amount", "dividendAmount", "dividend_amount", "adjDividend", "adjDividendAmount"]:
                        if div_field in item and item[div_field] is not None:
                            try:
                                dividend_amount = str(float(item[div_field]))
                                break
                            except (ValueError, TypeError):
                                continue
                    
                    # Only add if we have at least ex_date
                    if ex_date:
                        dividends.append({
                            "ticker": ticker,
                            "ex_date": ex_date,
                            "pay_date": payment_date,
                            "dividend_amount": dividend_amount,
                        })
                
                logger.info(f"Fetched {len(dividends)} dividends from stable endpoint for {ticker}")
                return dividends
                
        except httpx.HTTPStatusError as e:
            logger.error(f"FMP API HTTP error for {ticker}: {e.response.status_code} - {e.response.text}")
            return []
        except httpx.RequestError as e:
            logger.error(f"FMP API request error for {ticker}: {str(e)}")
            return []
        except Exception as e:
            logger.error(f"Error fetching stable dividends for {ticker}: {str(e)}", exc_info=True)
            return []
    
    def sync_all_allowed_tickers(self, db: Session) -> Dict:
        """
        Sync dividend data for all allowed tickers
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with overall sync statistics
        """
        overall_stats = {
            "tickers_processed": 0,
            "total_fetched": 0,
            "total_created": 0,
            "total_updated": 0,
            "total_errors": 0,
            "ticker_stats": []
        }
        
        for ticker in settings.ALLOWED_TICKERS:
            stats = self.sync_ticker_dividends(db, ticker)
            overall_stats["tickers_processed"] += 1
            overall_stats["total_fetched"] += stats["fetched"]
            overall_stats["total_created"] += stats["created"]
            overall_stats["total_updated"] += stats["updated"]
            overall_stats["total_errors"] += stats["errors"]
            overall_stats["ticker_stats"].append(stats)
            
            # Small delay to respect Alpha Vantage rate limits (5 calls per minute for free tier)
            # Use 15 seconds delay to be safe
            import time
            time.sleep(15)
        
        logger.info(
            f"Synced dividends for {overall_stats['tickers_processed']} tickers: "
            f"{overall_stats['total_created']} created, {overall_stats['total_updated']} updated"
        )
        return overall_stats
    
    def create_user_dividends_from_exdates(self, db: Session, ticker: str) -> int:
        """
        Create or update Dividend records for users who own positions in a ticker,
        based on ALL ExDate records (both historical and upcoming)
        
        Args:
            db: Database session
            ticker: Stock ticker symbol
            
        Returns:
            Number of dividend records created/updated
        """
        count = 0
        today = date.today()
        
        try:
            # Find ALL ex-dates for this ticker (not just upcoming)
            ex_dates = db.query(ExDate).filter(
                ExDate.ticker == ticker
            ).order_by(ExDate.ex_date).all()
            
            if not ex_dates:
                return count
            
            # Find all users with positions in this ticker
            positions = db.query(Position).filter(
                and_(
                    Position.ticker == ticker,
                    Position.shares > 0
                )
            ).all()
            
            if not positions:
                return count
            
            # Create/update dividend records for each user position
            for ex_date_record in ex_dates:
                for position in positions:
                    try:
                        # Check if dividend record already exists
                        existing_dividend = db.query(Dividend).filter(
                            and_(
                                Dividend.user_id == position.user_id,
                                Dividend.position_id == position.id,
                                Dividend.ticker == ticker,
                                Dividend.ex_date == ex_date_record.ex_date
                            )
                        ).first()
                        
                        # Calculate dividend per share and total amount
                        dividend_per_share = None
                        if ex_date_record.dividend_amount:
                            try:
                                dividend_per_share = Decimal(ex_date_record.dividend_amount)
                            except (ValueError, TypeError):
                                pass
                        
                        shares = Decimal(str(position.shares))
                        amount = dividend_per_share * shares if dividend_per_share else Decimal("0")
                        
                        # Determine status: PAID if pay_date has passed, otherwise UPCOMING
                        # If no pay_date, use ex_date as fallback
                        status_date = ex_date_record.pay_date if ex_date_record.pay_date else ex_date_record.ex_date
                        dividend_status = DividendStatus.PAID if status_date < today else DividendStatus.UPCOMING
                        
                        # Calculate adjusted dates
                        # Use ex_date_record.invest_by_date if already calculated, otherwise calculate it
                        if ex_date_record.invest_by_date:
                            invest_by_date = ex_date_record.invest_by_date
                        else:
                            invest_by_date = self.market_hours_service.get_business_day_before(ex_date_record.ex_date)
                        
                        if existing_dividend:
                            # Update existing dividend record
                            updated = False
                            if ex_date_record.pay_date and not existing_dividend.pay_date:
                                existing_dividend.pay_date = ex_date_record.pay_date
                                # Calculate pay_date_adjusted (next business day on or after pay_date)
                                if ex_date_record.pay_date:
                                    existing_dividend.pay_date_adjusted = self.market_hours_service.get_next_business_day_on_or_after(ex_date_record.pay_date)
                                # Update status based on new pay_date
                                if ex_date_record.pay_date < today:
                                    existing_dividend.status = DividendStatus.PAID
                                updated = True
                            if dividend_per_share and (
                                not existing_dividend.dividend_per_share or
                                existing_dividend.dividend_per_share != dividend_per_share
                            ):
                                existing_dividend.dividend_per_share = dividend_per_share
                                existing_dividend.amount = amount
                                updated = True
                            if shares != existing_dividend.shares_at_ex_date:
                                existing_dividend.shares_at_ex_date = shares
                                existing_dividend.amount = amount if dividend_per_share else existing_dividend.amount
                                updated = True
                            # Update status to PAID if pay_date has passed
                            if existing_dividend.pay_date and existing_dividend.pay_date < today:
                                if existing_dividend.status != DividendStatus.PAID:
                                    existing_dividend.status = DividendStatus.PAID
                                    updated = True
                            if not existing_dividend.source or existing_dividend.source != "alpha_vantage_api":
                                existing_dividend.source = "alpha_vantage_api"
                                updated = True
                            
                            # Update invest_by_date (last business day on or before ex_date)
                            if existing_dividend.invest_by_date != invest_by_date:
                                existing_dividend.invest_by_date = invest_by_date
                                updated = True
                            
                            # Update pay_date_adjusted if pay_date exists
                            if existing_dividend.pay_date:
                                pay_date_adjusted = self.market_hours_service.get_next_business_day_on_or_after(existing_dividend.pay_date)
                                if existing_dividend.pay_date_adjusted != pay_date_adjusted:
                                    existing_dividend.pay_date_adjusted = pay_date_adjusted
                                    updated = True
                            
                            if updated:
                                existing_dividend.updated_at = datetime.utcnow()
                                count += 1
                        else:
                            # Create new dividend record
                            # Use ex_date as fallback for pay_date if not provided
                            pay_date_value = ex_date_record.pay_date if ex_date_record.pay_date else ex_date_record.ex_date
                            
                            # Calculate pay_date_adjusted (next business day on or after pay_date)
                            pay_date_adjusted = None
                            if pay_date_value:
                                pay_date_adjusted = self.market_hours_service.get_next_business_day_on_or_after(pay_date_value)
                            
                            dividend = Dividend(
                                user_id=position.user_id,
                                position_id=position.id,
                                ticker=ticker,
                                ex_date=ex_date_record.ex_date,
                                invest_by_date=invest_by_date,
                                pay_date=pay_date_value,
                                pay_date_adjusted=pay_date_adjusted,
                                dividend_per_share=dividend_per_share,
                                shares_at_ex_date=shares,
                                amount=amount,
                                status=dividend_status,
                                source="alpha_vantage_api"
                            )
                            db.add(dividend)
                            count += 1
                    
                    except Exception as e:
                        logger.error(
                            f"Error creating dividend for user {position.user_id}, "
                            f"ticker {ticker}, ex_date {ex_date_record.ex_date}: {str(e)}",
                            exc_info=True
                        )
            
            db.commit()
            logger.info(f"Created/updated {count} dividend records for ticker {ticker}")
            return count
            
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating user dividends from exdates for {ticker}: {str(e)}", exc_info=True)
            return count
    
    def backfill_historical(self, db: Session, tickers: Optional[List[str]] = None) -> Dict:
        """
        Backfill historical dividend data for specified tickers (or all allowed tickers)
        
        Args:
            db: Database session
            tickers: List of tickers to backfill (None = all allowed tickers)
            
        Returns:
            Dictionary with backfill statistics
        """
        if tickers is None:
            tickers = settings.ALLOWED_TICKERS
        
        logger.info(f"Starting historical dividend backfill for {len(tickers)} tickers")
        
        stats = {
            "tickers_processed": 0,
            "total_fetched": 0,
            "total_created": 0,
            "total_updated": 0,
            "total_errors": 0,
            "ticker_stats": []
        }
        
        for ticker in tickers:
            ticker_stats = self.sync_ticker_dividends(db, ticker)
            stats["tickers_processed"] += 1
            stats["total_fetched"] += ticker_stats["fetched"]
            stats["total_created"] += ticker_stats["created"]
            stats["total_updated"] += ticker_stats["updated"]
            stats["total_errors"] += ticker_stats["errors"]
            stats["ticker_stats"].append(ticker_stats)
            
            # Small delay to respect Alpha Vantage rate limits (5 calls per minute for free tier)
            # Use 15 seconds delay to be safe
            import time
            time.sleep(15)
        
        logger.info(
            f"Historical backfill completed: {stats['total_created']} created, "
            f"{stats['total_updated']} updated across {stats['tickers_processed']} tickers"
        )
        
        return stats

