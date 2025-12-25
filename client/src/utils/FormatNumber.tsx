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
