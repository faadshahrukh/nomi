import { CURRENCIES, type CurrencyCode } from './money';

export interface Region {
  code: string; name: string; currency: CurrencyCode;
  /** Default IANA timezone when the device does not say otherwise. */
  timezone: string;
  /** Default input language for understanding messages. */
  locale: 'en' | 'bn' | 'mixed';
}

/** Where the product is set up for. Each region fixes the currency and number style; the user can change neither silently. */
export const REGIONS: Region[] = [
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', timezone: 'Asia/Dhaka', locale: 'mixed' },
  { code: 'IN', name: 'India', currency: 'INR', timezone: 'Asia/Kolkata', locale: 'en' },
  { code: 'US', name: 'United States', currency: 'USD', timezone: 'America/New_York', locale: 'en' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London', locale: 'en' },
  { code: 'EU', name: 'Eurozone', currency: 'EUR', timezone: 'Europe/Berlin', locale: 'en' },
];

export const findRegion = (code: string): Region | undefined => REGIONS.find((r) => r.code === code);

/** Best guess from the device's timezone; Bangladesh when nothing matches (the primary market). */
export function regionForTimezone(timezone: string): Region {
  const exact = REGIONS.find((r) => r.timezone === timezone);
  if (exact) return exact;
  if (/^Europe\//.test(timezone) && timezone !== 'Europe/London') return findRegion('EU')!;
  if (/^America\//.test(timezone)) return findRegion('US')!;
  return findRegion('BD')!;
}

export const hasSupportedCurrency = (r: Region): boolean => r.currency in CURRENCIES;
