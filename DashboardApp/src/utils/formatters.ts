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
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

