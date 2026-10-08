/**
 * Pure integer-based financial formatting utilities.
 * Ensures zero floating-point arithmetic drift for all currency displays.
 */

export function formatMinorUnits(
  amount: string | bigint | number,
  currency = 'USD',
  showPlus = false
): string {
  try {
    let raw: bigint;
    if (typeof amount === 'bigint') {
      raw = amount;
    } else if (typeof amount === 'number') {
      raw = BigInt(Math.trunc(amount));
    } else {
      raw = BigInt(amount || '0');
    }

    const isNegative = raw < 0n;
    const abs = isNegative ? -raw : raw;
    const whole = abs / 100n;
    const frac = abs % 100n;
    const fracStr = frac.toString().padStart(2, '0');
    const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    let symbol = '$';
    if (currency === 'EUR') symbol = '€';
    else if (currency === 'GBP') symbol = '£';
    else if (currency !== 'USD') symbol = `${currency} `;

    if (isNegative) {
      return `-${symbol}${wholeStr}.${fracStr}`;
    }
    if (showPlus && raw > 0n) {
      return `+${symbol}${wholeStr}.${fracStr}`;
    }
    return `${symbol}${wholeStr}.${fracStr}`;
  } catch {
    return `${currency} 0.00`;
  }
}

export function formatDateTime(dateStr: string | Date): string {
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(dateStr);
  }
}

export function formatDateOnly(dateStr: string | Date): string {
  try {
    const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return d.toISOString().split('T')[0];
  } catch {
    return String(dateStr);
  }
}
