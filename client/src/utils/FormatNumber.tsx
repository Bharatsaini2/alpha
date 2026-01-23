export function formatNumber(num: number): string {
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  let formatted: string;

  if (absNum >= 1_000_000_000) {
    formatted = (absNum / 1_000_000_000).toFixed(2) + 'B';
  } else if (absNum >= 1_000_000) {
    formatted = (absNum / 1_000_000).toFixed(2) + 'M';
  } else if (absNum >= 1_000) {
    formatted = (absNum / 1_000).toFixed(2) + 'K';
  } else {
    formatted = absNum.toFixed(2);
  }

  return isNegative ? '-' + formatted : formatted;
}

export function formatPrice(num: number): string {
  if (num === 0) return '0.00';

  const absNum = Math.abs(num);

  if (absNum >= 1) {
    return formatNumber(num);
  }

  // For small numbers, show up to 8 decimal places, but remove trailing zeros
  let formatted = absNum.toFixed(8);
  formatted = formatted.replace(/\.?0+$/, "");

  // Ensure at least 2 decimal places for consistency if it's not a round number
  if (!formatted.includes('.') && absNum !== 0) {
    // This case shouldn't really happen for absNum < 1
  } else if (formatted.includes('.')) {
    const parts = formatted.split('.');
    if (parts[1].length < 2) {
      formatted = absNum.toFixed(2);
    }
  }

  return num < 0 ? '-' + formatted : formatted;
}
