import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { fontFamily, MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useAuth } from '@/auth/AuthProvider';
import { AUTH_MESSAGES, AuthError, type AuthErrorCode } from '@/auth/types';
import { mapAuthError } from '@/auth/mapAuthError';
import { PASSWORD_MESSAGES, isEmail, passwordProblem } from '@/auth/validation';
import { Button, Icon, Text } from '@/components/ui';

type Mode = 'signIn' | 'signUp' | 'reset' | 'checkEmail' | 'resetSent';

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="callout" weight="semibold">{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkMuted} {...props}
        style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.medium, fontSize: 16 }} />
    </View>
  );
}

/**
 * Email and Google sign-in, sign-up and password reset. Messages come only from the fixed set in AUTH_MESSAGES, so nothing the
 * server says (which can echo an email address) is ever shown. Sign-in is always optional: the app works fully on this device.
 */
export function AuthPanel({ initialMode = 'signUp', onSignedIn, onSkip }: { initialMode?: 'signIn' | 'signUp'; onSignedIn: () => void; onSkip?: () => void }) {
  const { colors } = useTheme();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<null | 'email' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  if (!auth.configured) {
    return (
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: space.lg }}>
          <Icon name="shield" size={22} color={colors.onAccentSoft} />
          <Text variant="callout" style={{ flex: 1, color: colors.onAccentSoft }}>Sign-in isn't set up in this version of the app. That's fine: everything works on this device, and your data stays here.</Text>
        </View>
        {onSkip ? <Button label="Continue without an account" fullWidth size="lg" onPress={onSkip} /> : null}
      </View>
    );
  }

  const emailBad = touched && !isEmail(email);
  const pwProblem = mode === 'signUp' ? passwordProblem(password) : password.length === 0 ? 'too_short' : null;
  const pwBad = touched && pwProblem !== null;
  const fail = (e: unknown) => { setError(AUTH_MESSAGES[(e instanceof AuthError ? e : mapAuthError(e)).code as AuthErrorCode]); };

  async function submit() {
    setTouched(true); setError(null);
    if (!isEmail(email)) return;
    if (mode === 'reset') {
      setBusy('email');
      try { await auth.service.sendPasswordReset(email); setMode('resetSent'); } catch (e) { fail(e); } finally { setBusy(null); }
      return;
    }
    if (pwProblem) return;
    setBusy('email');
    try {
      if (mode === 'signUp') {
        const r = await auth.service.signUpWithEmail(email, password);
        if (r.needsEmailConfirmation) setMode('checkEmail'); else onSignedIn();
      } else {
        await auth.service.signInWithEmail(email, password);
        onSignedIn();
      }
    } catch (e) { fail(e); } finally { setBusy(null); }
  }

  async function google() {
    setError(null); setBusy('google');
    try { await auth.service.signInWithGoogle(); onSignedIn(); }
    catch (e) { if (!(e instanceof AuthError && e.code === 'cancelled')) fail(e); }
    finally { setBusy(null); }
  }

  if (mode === 'checkEmail' || mode === 'resetSent') {
    return (
      <View style={{ gap: space.lg }} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: space.lg }}>
          <Icon name="check" size={22} color={colors.onAccentSoft} />
          <Text variant="callout" style={{ flex: 1, color: colors.onAccentSoft }}>
            {mode === 'checkEmail' ? `We sent a confirmation link to ${email.trim()}. Open it on this phone, then come back and sign in.` : 'If an account exists for that email, we have sent a link to reset the password.'}
          </Text>
        </View>
        <Button label="Back to sign in" variant="secondary" fullWidth onPress={() => { setMode('signIn'); setPassword(''); setError(null); }} />
        {onSkip ? <Button label="Continue without an account" variant="ghost" fullWidth onPress={onSkip} /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      {mode !== 'reset' ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" aria-busy={busy === 'google'} disabled={busy !== null} onPress={google}
            style={({ pressed }) => ({ minHeight: 54, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, opacity: busy ? 0.6 : pressed ? 0.85 : 1 })}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" weight="extrabold">G</Text></View>
            <Text variant="bodyStrong">{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /><Text variant="caption" tone="muted">or with email</Text><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>
        </>
      ) : <Text variant="callout" tone="muted">Enter your email and we'll send you a link to choose a new password.</Text>}

      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType={mode === 'reset' ? 'send' : 'next'} onSubmitEditing={mode === 'reset' ? submit : undefined} placeholder="you@example.com" />
      {emailBad ? <Text variant="caption" tone="negative" accessibilityRole="alert">Enter a valid email address.</Text> : null}

      {mode !== 'reset' ? (
        <View style={{ gap: space.xs }}>
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} textContentType={mode === 'signUp' ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={submit} placeholder={mode === 'signUp' ? 'At least 8 characters' : 'Your password'} />
          <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow((s) => !s)} style={{ alignSelf: 'flex-start', minHeight: MIN_TOUCH, justifyContent: 'center' }}>
            <Text variant="caption" weight="semibold" tone="accent">{show ? 'Hide password' : 'Show password'}</Text>
          </Pressable>
          {pwBad && pwProblem ? <Text variant="caption" tone="negative" accessibilityRole="alert">{mode === 'signUp' ? PASSWORD_MESSAGES[pwProblem] : 'Enter your password.'}</Text> : null}
        </View>
      ) : null}

      {error ? <Text variant="callout" tone="negative" accessibilityRole="alert">{error}</Text> : null}

      <Button label={mode === 'signUp' ? 'Create account' : mode === 'signIn' ? 'Sign in' : 'Send reset link'} size="lg" fullWidth loading={busy === 'email'} disabled={busy === 'google'} onPress={submit} />

      <View style={{ alignItems: 'center', gap: space.xs }}>
        {mode === 'signIn' ? <Button label="Forgot password?" variant="ghost" onPress={() => { setMode('reset'); setError(null); }} /> : null}
        <Button label={mode === 'signUp' ? 'I already have an account' : mode === 'signIn' ? 'Create an account' : 'Back to sign in'} variant="ghost" onPress={() => { setMode(mode === 'signUp' ? 'signIn' : mode === 'signIn' ? 'signUp' : 'signIn'); setError(null); setTouched(false); }} />
        {onSkip ? <Button label="Skip for now" variant="ghost" onPress={onSkip} /> : null}
      </View>
    </View>
  );
}
