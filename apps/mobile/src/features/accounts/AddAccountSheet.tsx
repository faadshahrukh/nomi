import type { CurrencyCode } from '@nomi/core';
import { BottomSheet } from '@/components/ui';
import { AccountForm } from './AccountForm';

export function AddAccountSheet({ visible, currency, onClose }: { visible: boolean; currency: CurrencyCode; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add an account">
      <AccountForm currency={currency} onAdded={onClose} />
    </BottomSheet>
  );
}
