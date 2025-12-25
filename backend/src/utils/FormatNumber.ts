export function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2) + 'B' // Billion
  } else if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M' // Million
  } else if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K' // Thousand
  } else {
    return num.toFixed(2) // Keep small numbers precise
  }
}
