import { formatMoney, type CurrencyCode } from '@nomi/core';
import type { TypeVariant } from '@/design/tokens';
import { Text, type Tone } from './Text';

const SIZE: Record<'hero' | 'large' | 'medium' | 'small', TypeVariant> = { hero: 'hero', large: 'display', medium: 'heading', small: 'body' };
const NAME: Record<string, string> = { BDT: 'taka', USD: 'US dollars', INR: 'rupees', EUR: 'euros', GBP: 'pounds' };

export interface MoneyProps {
  minor: number; currency: CurrencyCode;
  size?: keyof typeof SIZE; tone?: Tone; signed?: boolean; locale?: 'en' | 'bn';
}

/** Renders integer minor units. All formatting goes through the core so the UI never does money maths. */
export function Money({ minor, currency, size = 'medium', tone = 'ink', signed, locale = 'en' }: MoneyProps) {
  const label = `${formatMoney(minor, currency, { symbol: false, signed, locale })} ${NAME[currency] ?? currency}`;
  return (
    <Text variant={SIZE[size]} tone={tone} numeric accessibilityLabel={label} adjustsFontSizeToFit numberOfLines={1}>
      {formatMoney(minor, currency, { signed, locale })}
    </Text>
  );
}
