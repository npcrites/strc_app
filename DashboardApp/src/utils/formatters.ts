/**
 * Utility functions for formatting data
 */

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '$0.00';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '0.00%';
  }
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return '';
  }
  
  // If date-only string (YYYY-MM-DD), parse as local date to avoid timezone issues
  // date-only strings without time are parsed as UTC, which causes off-by-one errors
  // in timezones behind UTC (like EST where 2026-03-16 00:00 UTC = 2026-03-15 19:00 EST)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // Parse as local date (YYYY-MM-DD format)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
  
  // For dates with time/timezone info, parse normally
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateShort(dateString: string | null | undefined): string {
  if (!dateString) {
    return '';
  }
  
  // If date-only string (YYYY-MM-DD), parse as local date to avoid timezone issues
  // date-only strings without time are parsed as UTC, which causes off-by-one errors
  // in timezones behind UTC (like EST where 2026-03-16 00:00 UTC = 2026-03-15 19:00 EST)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // Parse as local date (YYYY-MM-DD format)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
  
  // For dates with time/timezone info, parse normally
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

