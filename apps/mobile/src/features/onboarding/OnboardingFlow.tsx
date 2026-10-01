import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRIMARY_GOALS, REGIONS, buildProfile, formatMoney, parseOpeningBalance, regionForTimezone, regionOrDefault } from '@nomi/core';
import { fontFamily, gutter, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import { appNow } from '@/data/clock';
import { useLedger } from '@/data/LedgerProvider';
import { AuthPanel } from '@/features/auth/AuthPanel';
import { AccountForm } from '@/features/accounts/AccountForm';
import { CaptureFlow } from '@/features/capture/CaptureFlow';
import { Button, Chip, Icon, ProgressBar, Surface, Text, useToast } from '@/components/ui';
import { stepProgress, stepsFor, type StepId } from './steps';


const TITLES: Record<StepId, { title: string; sub?: string }> = {
  welcome: { title: 'Just tell Nomi what happened.', sub: 'Type or say "lunch 250 bKash". Nomi works out the rest, and you confirm before anything is saved.' },
  about: { title: 'A little about you', sub: 'This sets your currency and how numbers look.' },
  auth: { title: 'Create your account', sub: 'Optional. It lets Nomi understand messages with AI and keep a backup. Skip it and everything stays on this device.' },
  goals: { title: 'What would help most?', sub: 'Pick any. This only shapes what Nomi shows you first.' },
  account: { title: 'Where is your money?', sub: 'One account is enough to start. You can add more any time.' },
  confirm: { title: 'How careful should Nomi be?', sub: 'You can change this later in Profile.' },
  budget: { title: 'A monthly budget?', sub: 'Optional. One number for the whole month. Safe to Spend uses it.' },
  try: { title: 'Try it now', sub: 'Type something you spent today, like "tea 30". Nothing is saved until you confirm.' },
};

/**
 * First-run setup, in the spec's order. Only the account is required, and the flow ends at a first capture so the product
 * proves itself within a minute. Each choice is saved as soon as it is made, so leaving halfway loses nothing.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const auth = useAuth();
  const { state, updateProfile, setOverallBudget } = useLedger();
  const steps = useMemo(() => stepsFor({ backendConfigured: config.backendConfigured, signedIn: auth.status === 'signedIn' }), [auth.status]);
  const [step, setStep] = useState<StepId>('welcome');
  const [name, setName] = useState('');
  const [regionCode, setRegionCode] = useState(() => regionForTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone).code);
  const [goals, setGoals] = useState<string[]>([]);
  const [budgetText, setBudgetText] = useState('');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (state.status !== 'ready') return null;
  const { snapshot, summary } = state;
  const profile = snapshot.profile;
  const hasAccounts = snapshot.accounts.length > 0;
  const idx = steps.indexOf(step);
  const prog = stepProgress(steps, step);
  const next = () => setStep(steps[Math.min(steps.length - 1, idx + 1)]!);
  const back = () => { if (idx > 0) setStep(steps[idx - 1]!); };
  const fail = () => toast.show({ message: "Couldn't save that. Try again.", tone: 'error' });
  const input = { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.medium, fontSize: 16 } as const;

  async function saveAbout() {
    setBusy(true);
    try {
      const region = regionOrDefault(regionCode);
      // The currency cannot change once accounts exist, because their balances are in it.
      const base = hasAccounts ? profile : buildProfile(profile.userId, region, { displayName: name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || region.timezone }, profile);
      await updateProfile({ ...base, displayName: name.trim().slice(0, 60) || null });
      next();
    } catch { fail(); } finally { setBusy(false); }
  }
  async function saveGoals() { setBusy(true); try { await updateProfile({ primaryGoals: goals }); next(); } catch { fail(); } finally { setBusy(false); } }
  async function saveBudget() {
    setBudgetError(null);
    if (!budgetText.trim()) { next(); return; }
    const minor = parseOpeningBalance(budgetText, profile.currency);
    if (minor === null || minor <= 0) { setBudgetError('Enter a number above zero, like 30000 or 30k.'); return; }
    setBusy(true);
    try { await setOverallBudget(minor); next(); } catch { fail(); } finally { setBusy(false); }
  }
  async function finish() {
    setBusy(true);
    try { await updateProfile({ onboardedAt: appNow().toISOString() }); onDone(); } catch { fail(); setBusy(false); }
  }
  const t = TITLES[step];
  const saved = snapshot.transactions.length > 0;

  const choice = (selected: boolean, label: string, hint: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" aria-selected={selected} accessibilityLabel={`${label}. ${hint}`} onPress={onPress}
      style={{ minHeight: 64, borderRadius: radius.lg, padding: space.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1 }}><Text variant="bodyStrong" style={selected ? { color: colors.onAccentSoft } : undefined}>{label}</Text><Text variant="callout" tone="muted">{hint}</Text></View>
      {selected ? <Icon name="check" size={22} color={colors.accent} /> : null}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: gutter, paddingBottom: space.huge * 2, gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 }}>
            {idx > 0 ? <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} /> : <View style={{ flex: 1 }} />}
            {idx > 0 ? <View style={{ flex: 1 }} /> : null}
            <Text variant="caption" tone="muted" accessibilityLabel={`Step ${prog.index} of ${prog.total}`}>{prog.index} / {prog.total}</Text>
          </View>
          <ProgressBar value={prog.index / prog.total} label="Setup progress" />
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="display" accessibilityRole="header">{t.title}</Text>
          {t.sub ? <Text variant="body" tone="muted">{t.sub}</Text> : null}
        </View>

        {step === 'welcome' ? (
          <View style={{ gap: space.lg }}>
            <Surface variant="mint" padding="xl" rounded="xl" style={{ gap: space.md }}>
              <Text variant="bodyStrong">"Biryani 350 from bKash"</Text>
              <Text variant="callout" tone="muted">Nomi: ৳350, Food, bKash, today. Save?</Text>
            </Surface>
            {['AI never changes your balances. Your device does the maths.', 'You confirm before anything is saved.', 'Your data stays on this device unless you sign in.'].map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}><Icon name="check" size={20} color={colors.accent} /><Text variant="callout" style={{ flex: 1 }}>{p}</Text></View>
            ))}
            <Button label="Get started" size="lg" fullWidth onPress={next} />
          </View>
        ) : null}

        {step === 'about' ? (
          <View style={{ gap: space.lg }}>
            <View style={{ gap: space.xs }}>
              <Text variant="callout" weight="semibold">What should Nomi call you? (optional)</Text>
              <TextInput accessibilityLabel="Your name" value={name} onChangeText={setName} maxLength={60} placeholder="Your first name" placeholderTextColor={colors.inkMuted} style={input} />
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="callout" weight="semibold">Country and currency</Text>
              {hasAccounts ? <Text variant="caption" tone="muted">Locked because you already have accounts in {profile.currency}.</Text> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {REGIONS.map((r) => <Chip key={r.code} label={`${r.name} · ${r.currency}`} selected={(hasAccounts ? profile.country : regionCode) === r.code} onPress={hasAccounts ? undefined : () => setRegionCode(r.code)} />)}
              </View>
            </View>
            <Button label="Continue" size="lg" fullWidth loading={busy} onPress={saveAbout} />
          </View>
        ) : null}

        {step === 'auth' ? <AuthPanel initialMode="signUp" onSignedIn={next} onSkip={next} /> : null}

        {step === 'goals' ? (
          <View style={{ gap: space.md }}>
            {PRIMARY_GOALS.map((g) => choice(goals.includes(g.key), g.label, g.hint, () => setGoals((c) => (c.includes(g.key) ? c.filter((x) => x !== g.key) : [...c, g.key]))))}
            <Button label="Continue" size="lg" fullWidth loading={busy} onPress={saveGoals} />
          </View>
        ) : null}

        {step === 'account' ? (
          <View style={{ gap: space.lg }}>
            {hasAccounts ? (
              <Surface padding="lg" style={{ gap: space.sm }}>
                {summary.accountBalances.map(({ account, balanceMinor }) => (
                  <View key={account.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong">{account.name}</Text><Text variant="body" numeric>{formatMoney(balanceMinor, account.currency)}</Text>
                  </View>
                ))}
              </Surface>
            ) : null}
            <AccountForm currency={profile.currency} submitLabel={hasAccounts ? 'Add another account' : 'Add account'} onAdded={() => { if (!hasAccounts) next(); }} />
            {hasAccounts ? <Button label="Continue" variant="secondary" size="lg" fullWidth onPress={next} /> : null}
          </View>
        ) : null}

        {step === 'confirm' ? (
          <View style={{ gap: space.md }}>
            {choice(profile.confirmationPref === 'always_confirm', 'Always ask me first', 'Recommended. You see and confirm every entry.', () => { void updateProfile({ confirmationPref: 'always_confirm' }).catch(fail); })}
            {choice(profile.confirmationPref === 'auto_save_high_confidence', 'Save clear ones automatically', 'Large or unclear amounts still need your confirmation.', () => { void updateProfile({ confirmationPref: 'auto_save_high_confidence' }).catch(fail); })}
            <Text variant="caption" tone="muted">Voice entries always ask for a confirmation tap.</Text>
            <Button label="Continue" size="lg" fullWidth onPress={next} />
          </View>
        ) : null}

        {step === 'budget' ? (
          <View style={{ gap: space.lg }}>
            <View style={{ gap: space.xs }}>
              <Text variant="callout" weight="semibold">Monthly budget ({profile.currency})</Text>
              <TextInput accessibilityLabel="Monthly budget" value={budgetText} onChangeText={setBudgetText} keyboardType="numbers-and-punctuation" placeholder="e.g. 30000" placeholderTextColor={colors.inkMuted} style={input} />
              {budgetError ? <Text variant="callout" tone="negative" accessibilityRole="alert">{budgetError}</Text> : null}
            </View>
            <Button label={budgetText.trim() ? 'Set budget' : 'Continue'} size="lg" fullWidth loading={busy} onPress={saveBudget} />
          </View>
        ) : null}

        {step === 'try' ? (
          <View style={{ gap: space.lg }}>
            <CaptureFlow />
            {saved ? <Text variant="callout" tone="positive" accessibilityRole="alert">Nice, that's your first entry. It's now part of your balance and Safe to Spend.</Text> : null}
          </View>
        ) : null}

        {step === 'try' ? (
          <Button label={saved ? 'Finish' : 'Skip and finish'} variant={saved ? 'primary' : 'secondary'} size="lg" fullWidth loading={busy} onPress={finish} />
        ) : null}
      </ScrollView>
    </View>
  );
}
