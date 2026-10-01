# Design system

Status: **tokens, theme and base components are implemented** in `apps/mobile/src/design` and `apps/mobile/src/components/ui`. Everything below the "Implemented" section is direction for screens not built yet.

## Implemented

- **Colour** (semantic tokens, light and dark): `bg, surface, surfaceSunken, ink, inkMuted, border, accent, onAccent, accentSoft, onAccentSoft, positive/caution/negative (+Soft), scrim`. One brand accent (cobalt blue; lighter periwinkle in dark). Blue was chosen so the accent never collides with the green/red used for meaning. `tokens.test.ts` asserts WCAG contrast for every text/surface pair in both palettes (body text at least 4.5:1, primary ink at least 7:1, accent UI at least 3:1).
- **Type**: Plus Jakarta Sans for Latin, with Noto Sans Bengali bundled. The Latin face lacks the taka sign, so `Text` draws ৳ in the Bengali face to match digit size. Scale: hero 44, display 32, title 24, heading 18, body 16, callout 14, caption 12, overline 11. Money uses tabular figures. Text respects system font scaling (capped at 1.2x for hero and display sizes, 1.6x otherwise).
- **Spacing and shape**: 4pt grid, radii 10/16/24/32, 20pt screen gutter, minimum touch target 44.
- **Components**: see the list in `ARCHITECTURE.md`. Icon-only controls require an accessibility label. Status is never colour alone (`Badge` carries an icon or text). State is exposed with `aria-*` props so it works on web and native. Skeletons stop pulsing under reduce-motion.
- **States**: `AsyncBoundary` (loading, empty, error, ready), `OfflineBanner`, `ErrorState`, `ErrorBoundary`, not-found screen, toasts with optional action. All can be previewed in More → Developer → Component gallery, including a "simulate offline" switch.
- **Known gaps**: no custom app icon or splash artwork yet; Bangla UI strings are not translated yet (the font stack supports them); theme choice is not persisted yet; the text-input placeholder shows the taka sign in the fallback font.

## Intent (from the spec)

Modern fintech + calm intelligence. The app is a companion, not a banking dashboard.

Do: neutral light base, deep ink type, one strong accent, semantic success/warning/error colours, large readable money figures, soft cards with restrained borders, generous spacing, minimal meaningful charts, a rounded capture surface, subtle motion, dark mode from semantic tokens, accessible touch targets.

Avoid: dense tables and spreadsheet screens, noisy charts, heavy gradients, constant chat bubbles, guilt or fear wording, heavy red/green.

## Rules

1. All colour goes through semantic tokens (`surface`, `surfaceRaised`, `ink`, `inkMuted`, `accent`, `positive`, `caution`, `negative`, `border`). Screens never use literals. Dark mode swaps the token values.
2. Meaning never relies on colour alone: state is also shown with an icon or label (over budget, owed to you, saved).
3. Money uses tabular figures, the largest sizes on Home, and the user's numbering (lakh grouping, optional Bangla digits).
4. Touch targets are at least 44 pt. Text scales with the system setting. Every control has an accessibility label. Voice always has a typed alternative. Motion respects reduce-motion.
5. Tone: neutral and factual. "You've spent more than usual on Dining", never "you overspent".

## Home hierarchy

Header → Conversational Capture (headline "What happened with your money?", "Type or speak naturally", large microphone) → AI interpretation / confirmation → Money Pulse → Safe to Spend (with its reasoning) → Financial Radar → Upcoming → Recent Activity → bottom navigation (Home, Transactions, Insights, Planning, More).

## Voice states

Idle (large mic) · Listening (waveform, label, Stop) · Processing · Understood (amount, category, date, account, merchant) · Ambiguous (one question) · Saved (confirmation + what changed) · Error (keep the transcript, allow retry or edit).

## Components to build first

App shell and navigation, capture input, voice recorder and waveform, interpretation card with field-level edit, confirmation card, Money Pulse, Safe to Spend, Radar item, transaction row and detail, account and category selectors, budget/goal progress, bottom sheet, toast, skeleton, empty and error states.

Every component ships with loading, empty, error and offline variants where they apply.
