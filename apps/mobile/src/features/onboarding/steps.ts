export type StepId = 'welcome' | 'about' | 'auth' | 'goals' | 'account' | 'confirm' | 'budget' | 'try';

/** Only the account step blocks progress: nothing can be recorded without somewhere for the money to live. */
export const SKIPPABLE: Record<StepId, boolean> = { welcome: false, about: false, auth: true, goals: true, account: false, confirm: false, budget: true, try: true };

/** The sign-in step is left out when the build has no backend or the user is already signed in. */
export function stepsFor(opts: { backendConfigured: boolean; signedIn: boolean }): StepId[] {
  const all: StepId[] = ['welcome', 'about', 'auth', 'goals', 'account', 'confirm', 'budget', 'try'];
  return all.filter((s) => s !== 'auth' || (opts.backendConfigured && !opts.signedIn));
}

export const stepProgress = (steps: StepId[], current: StepId) => ({ index: Math.max(0, steps.indexOf(current)) + 1, total: steps.length });
