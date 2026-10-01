# Design system

Status: **tokens, theme and base components are implemented** in `apps/mobile/src/design` and `apps/mobile/src/components/ui`. Everything below the "Implemented" section is direction for screens not built yet.

## Implemented

The visual direction is the product owner's own Home design (forest green, mint and peach), adapted to real data and kept calm.

- **Colour** (semantic tokens, light and dark): `bg, surface, surfaceSunken, ink, inkMuted, border`; one brand colour `accent` (deep green; bright mint in dark) with `accentSoft` (mint); `forest` for the dark hero card (`onForest`, `onForestMuted`, `forestPositive`); `positive`, `caution` (burnt orange, used for the Nomi Signal and "watch" states), `negative`, each with a soft background; six pastel icon tiles (`tileMint, tileLav, tileSky, tilePeach, tileSand, tileRose` with matching `onTile…`). `tokens.test.ts` asserts WCAG contrast for every text/surface pair in both palettes. The orange in the supplied mock-up was too light to read on peach, so the shipped orange is a darker shade of the same hue.
- **Type**: Manrope for Latin (chosen by the product owner), with Noto Sans Bengali bundled. Manrope lacks the taka sign, so `Text` draws ৳ in the Bengali face to match digit size. Scale: hero 44, display 32, title 24, heading 18, body 16, callout 14, caption 12, overline 11. Money uses tabular figures; text respects system font scaling.
- **Surfaces**: `raised` (white card), `mint` (soft mint-to-white gradient: capture, Safe to Spend), `forest` (Money Pulse), `peach` (Nomi Signal), plus `accent`, `sunken`, `outlined`. Large radii (24 to 32). `Tile` is the pastel category icon square; `lib/glyphs.ts` maps a category (most specific first) or a transaction type to an icon and tone. Presentation only.
- **Home (kept short on purpose)**: header (sun or moon, "Good morning, Alex", date, a small "Demo data" pill when relevant, avatar, bell), capture card (NOMI label, headline, input with the microphone inside it, send, example chips and "Enter manually"), Money Pulse (balance, change versus the same day last month when a full month of history exists, Spent / Income / Budget left), Safe to Spend (the per-day amount leads; the three deductions are listed; tapping shows the full calculation and the estimate note), Nomi Signal (only when a category is at least 10% above its usual pace, with the real numbers; absent otherwise), Upcoming (3 rows), Recent Activity (4 rows). Everything else is one tap away through "View details" and "View all".
- **Navigation**: Home, Transactions, Insights, Planning, Profile (the spec's "More" became "Profile" to follow the design; settings, privacy and developer tools live there).
- **Left out of the mock-up on purpose, and why**: the monthly bar sparkline and the fourth stat (savings progress already lives in Planning; Home stays uncluttered); the red notification dot (no notifications exist yet, so a dot would be false); the example "Rahim owes me 1,200" (an IOU with no cash movement belongs to Money Circle; the chip says "Lent Rahim 1,200", which the app understands today); the profile photo (initials are used until photos exist).
- **Accessibility**: icon-only controls require a label; status is never colour alone; state uses `aria-*` props so it works on web and native; skeletons stop pulsing under reduce-motion; touch targets are at least 44 pt.
- **States**: `AsyncBoundary` (loading, empty, error, ready), `OfflineBanner`, `ErrorState`, `ErrorBoundary` (it caught a real bug during this work), not-found, toasts. All can be previewed in Profile, Developer, Component gallery.
- **Known gaps**: no custom app icon or splash artwork yet; Bangla UI strings are not translated yet; theme choice is not persisted yet; the text-input placeholder shows the taka sign in the fallback font.

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
