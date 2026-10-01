import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { CaptureCard } from '@/features/home/CaptureCard';
import { FailedCard, ProcessingCard, SavedCard } from './ResultCards';
import { ReviewCard } from './ReviewCard';
import { useCapture } from './useCapture';
import type { EditorContext } from './FieldEditorSheet';

/**
 * The conversational capture experience: the text/voice box, then whichever of
 * processing, review (with questions and corrections), failure or saved confirmation applies.
 */
export function CaptureFlow({ onMic }: { onMic: () => void }) {
  const { state: ledger } = useLedger();
  const cap = useCapture();
  const [text, setText] = useState('');
  const { state } = cap;

  useEffect(() => { if (state.phase === 'saved') setText(''); }, [state.phase]);

  const ready = ledger.status === 'ready';
  const hasAccounts = ready && ledger.summary.hasAccounts;
  const busy = state.phase === 'processing' || (state.phase === 'review' && state.items.some((i) => i.saving));

  const ctx: EditorContext | null = useMemo(() => (cap.snapshot && ledger.status === 'ready'
    ? { accounts: cap.snapshot.accounts, categories: cap.snapshot.categories, people: cap.snapshot.people, goals: cap.snapshot.goals, today: ledger.summary.today, currency: cap.snapshot.profile.currency }
    : null), [cap.snapshot, ledger]);

  return (
    <View style={{ gap: space.lg }}>
      <CaptureCard value={text} onChange={setText} onSubmitText={(t) => void cap.submit(t)} onMic={onMic}
        onManual={ready && hasAccounts ? cap.startManual : undefined} disabled={!ready || !hasAccounts || busy}
        hint={ready && !hasAccounts ? 'Add an account first, then tell Nomi what happened.' : undefined} />

      {state.phase === 'processing' ? <ProcessingCard text={state.text} /> : null}

      {state.phase === 'failed' ? (
        <FailedCard reason={state.reason} onRetry={() => void cap.submit(state.text)} onManual={cap.startManual} onDismiss={cap.reset} />
      ) : null}

      {state.phase === 'review' && ctx && cap.data
        ? state.items.map((item) => (
          <ReviewCard key={item.key} item={item} data={cap.data!} userId={cap.userId} ctx={ctx} showCount={state.items.length} interpretedBy={state.interpretedBy}
            onEdit={cap.edit} onSave={(i) => void cap.save(i)} onSaveAnyway={(i) => void cap.saveAnyway(i)} onDiscard={(i) => cap.discard(i.key)} />
        ))
        : null}

      {state.phase === 'saved' ? <SavedCard saved={state} onUndo={() => void cap.undo()} onDone={cap.reset} /> : null}
    </View>
  );
}
