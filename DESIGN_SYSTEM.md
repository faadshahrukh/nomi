# Design system

Status: **direction only. No UI code or tokens exist yet.** This file will be updated with the real token values when the Expo app shell is built.

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
