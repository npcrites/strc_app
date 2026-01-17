/**
 * Utility functions for asset-related operations
 */

/**
 * Get the parent ticker for a given ticker symbol.
 * 
 * Maps child tickers to their parent company tickers.
 * Returns null if the ticker is a standalone asset (no parent).
 * 
 * @param ticker - Ticker symbol (e.g., "STRC", "MSTR-A", "SATA")
 * @returns Parent ticker if applicable, null otherwise
 * 
 * @example
 * getParentTicker("STRC") -> "MSTR"
 * getParentTicker("STRD") -> "MSTR"
 * getParentTicker("SATA") -> "ASST"
 * getParentTicker("AAPL") -> null
 */
export function getParentTicker(ticker: string): string | null {
  const tickerUpper = ticker.toUpperCase();
  
  // Parent ticker mappings
  // Strive Asset Management products (credit products) -> MicroStrategy
  if (["STRC", "STRD", "STRF", "STRK"].includes(tickerUpper)) {
    return "MSTR";
  }
  
  // SATA -> ASST
  if (tickerUpper === "SATA") {
    return "ASST";
  }
  
  // Handle tickers with suffixes like "MSTR-A" -> "MSTR"
  // This pattern matches preferred stock or other child securities
  if (tickerUpper.includes("-")) {
    const baseTicker = tickerUpper.split("-")[0];
    // Only return parent if base ticker is a known parent
    // For now, we only know MSTR is a parent, but this can be extended
    if (baseTicker === "MSTR") {
      return baseTicker;
    }
  }
  
  // No parent for this ticker
  return null;
}

/**
 * Check if a ticker has MSTR as its parent
 * 
 * @param ticker - Ticker symbol
 * @returns true if ticker has MSTR as parent, false otherwise
 */
export function hasMSTRParent(ticker: string): boolean {
  return getParentTicker(ticker) === "MSTR";
}

/**
 * Check if a ticker has ASST as its parent
 * 
 * @param ticker - Ticker symbol
 * @returns true if ticker has ASST as parent, false otherwise
 */
export function hasASTTParent(ticker: string): boolean {
  return getParentTicker(ticker) === "ASST";
}

