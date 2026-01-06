/**
 * Market hours utility for frontend
 * Market hours: 9:30 AM - 4:00 PM Eastern Time
 */

export type TradingHoursMode = 'market' | 'extended';

/**
 * Convert UTC timestamp to Eastern Time
 */
function toEasternTime(timestamp: number): Date {
  const date = new Date(timestamp);
  // Convert to ET using toLocaleString
  const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(etString);
}

/**
 * Check if a date is a weekday (Monday-Friday)
 */
function isWeekday(date: Date): boolean {
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday = 1, Friday = 5
}

/**
 * Check if market is open at given timestamp
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 * 
 * Note: This is a simplified check that doesn't account for market holidays.
 * For production, consider fetching holidays from backend or using a library.
 */
export function isMarketHours(timestamp: number): boolean {
  const etDate = toEasternTime(timestamp);
  
  // Check if weekday
  if (!isWeekday(etDate)) {
    return false;
  }
  
  const hour = etDate.getHours();
  const minute = etDate.getMinutes();
  
  // Check if within market hours (9:30 AM - 4:00 PM ET)
  // Before market open
  if (hour < 9 || (hour === 9 && minute < 30)) {
    return false;
  }
  
  // After market close
  if (hour >= 16) {
    return false;
  }
  
  return true;
}

/**
 * Check if a date is a trading day (weekday)
 * 
 * Note: This doesn't check for market holidays. For production, consider
 * fetching holidays from backend or using a library.
 */
export function isTradingDay(date: Date): boolean {
  return isWeekday(date);
}

/**
 * Filter data points to only include those during market hours
 */
export function filterMarketHoursOnly<T extends { x: number }>(
  data: T[]
): T[] {
  return data.filter(point => isMarketHours(point.x));
}

/**
 * Get trading days in a range (simplified - doesn't account for holidays)
 */
export function getTradingDaysInRange(startDate: Date, endDate: Date): Date[] {
  const tradingDays: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    if (isTradingDay(current)) {
      tradingDays.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return tradingDays;
}

