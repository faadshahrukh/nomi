/**
 * Money is always an integer count of minor units (BDT poisha, USD cents). Floats never touch balances.
 */
export type CurrencyCode = string;

export interface CurrencyInfo { minorUnit: number; symbol: string; grouping: 'indian' | 'western' }

export const CURRENCIES: Record<string, CurrencyInfo> = {
  BDT: { minorUnit: 2, symbol: '৳', grouping: 'indian' },
  INR: { minorUnit: 2, symbol: '₹', grouping: 'indian' },
  USD: { minorUnit: 2, symbol: '$', grouping: 'western' },
  EUR: { minorUnit: 2, symbol: '€', grouping: 'western' },
  GBP: { minorUnit: 2, symbol: '£', grouping: 'western' },
};

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) throw new RangeError(`Unsupported currency: ${code}`);
  return info;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBanglaDigits = (s: string): string => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]!);
export const fromBanglaDigits = (s: string): string => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

/** Converts a decimal string/number in major units to minor units without float multiplication. */
export function toMinor(major: string | number, currency: CurrencyCode): number {
  const { minorUnit } = currencyInfo(currency);
  const s = String(major).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`Invalid amount: ${s}`);
  const neg = s.startsWith('-');
  const [whole = '0', frac = ''] = s.replace('-', '').split('.');
  const fracPadded = (frac + '0'.repeat(minorUnit)).slice(0, minorUnit);
  const rounded = frac.length > minorUnit && Number(frac[minorUnit]) >= 5 ? 1 : 0;
  const minor = Number(whole) * 10 ** minorUnit + Number(fracPadded || '0') + rounded;
  return neg ? -minor : minor;
}

function group(intPart: string, style: 'indian' | 'western'): string {
  if (style === 'western' || intPart.length <= 3) return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export interface FormatOptions { locale?: 'en' | 'bn'; symbol?: boolean; signed?: boolean }

/** Formats minor units, e.g. 12000000 BDT -> "৳1,20,000". Fraction shown only when non-zero. */
export function formatMoney(minor: number, currency: CurrencyCode, opts: FormatOptions = {}): string {
  const info = currencyInfo(currency);
  const abs = Math.abs(minor);
  const base = 10 ** info.minorUnit;
  const whole = Math.floor(abs / base);
  const frac = abs % base;
  let out = group(String(whole), info.grouping);
  if (frac) out += '.' + String(frac).padStart(info.minorUnit, '0');
  if (opts.locale === 'bn') out = toBanglaDigits(out);
  const sym = opts.symbol === false ? '' : info.symbol;
  const sign = minor < 0 ? '-' : opts.signed && minor > 0 ? '+' : '';
  return `${sign}${sym}${out}`;
}

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/^(?:k|thousand|হাজার)$/i, 1e3],
  [/^(?:lakhs?|lacs?|লাখ)$/i, 1e5],
  [/^(?:crores?|কোটি)$/i, 1e7],
];

const AMOUNT_RE = /(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|lacs?|crores?|হাজার|লাখ|কোটি)(?!\p{L}))?/giu;

/**
 * Finds every numeric amount in free text (English or Bangla digits; "5k", "1.5 lakh", "১২০০",
 * "1,20,000") and returns them in minor units. Used both to parse model output and as the guard
 * that rejects amounts the user never typed.
 */
export function extractAmounts(text: string, currency: CurrencyCode): number[] {
  const normalized = fromBanglaDigits(text);
  const out: number[] = [];
  for (const m of normalized.matchAll(AMOUNT_RE)) {
    const num = Number((m[1] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    const word = m[2];
    const mult = word ? (MULTIPLIERS.find(([re]) => re.test(word))?.[1] ?? 1) : 1;
    out.push(toMinor(String(Math.round(num * mult * 100) / 100), currency));
  }
  return out;
}

/** Parses an amount string that must contain exactly one amount; otherwise null. */
export function parseAmountText(text: string, currency: CurrencyCode): number | null {
  const all = extractAmounts(text, currency);
  return all.length === 1 && all[0]! > 0 ? all[0]! : null;
}

/** Splits `total` across `parties` as evenly as possible; remainder minor units go to the first parties. Sum is exact. */
export function equalSplit(totalMinor: number, parties: string[]): Array<{ personId: string; amountMinor: number }> {
  if (!parties.length) throw new RangeError('equalSplit needs at least one party');
  const base = Math.floor(totalMinor / parties.length);
  const rem = totalMinor - base * parties.length;
  return parties.map((personId, i) => ({ personId, amountMinor: base + (i < rem ? 1 : 0) }));
}
