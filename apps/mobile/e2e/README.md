# Browser checks

Scripted checks that drive the web build in a real browser. They are not part of `npm test` because they need a browser and a built bundle; run them before a release and after changes to screens.

```bash
npm i -D playwright axe-core                      # once, in a scratch location or the repo
cd apps/mobile
EXPO_PUBLIC_TODAY_OVERRIDE=2025-03-15 EXPO_PUBLIC_DATA_MODE=demo EXPO_PUBLIC_DEV_TOOLS=1 npx expo export -p web -c
node e2e/serve.mjs &                              # serves dist on http://localhost:8099
node e2e/a11y.cjs            # axe-core, WCAG 2.1 A/AA, every main screen, light and dark. Expect 0 violations
node e2e/qa-targets.cjs      # every tappable thing is at least 44 x 44. Expect 0
node e2e/qa-more.cjs         # 200% zoom has no sideways scroll; offline capture works; keyboard-only capture and save
node e2e/m8-e2e.cjs ...      # feature flows: transactions, budgets, recurring and Radar, privacy, goals
```

The feature flows assume the demo data and the fixed date above. The web build keeps data in memory, so a page reload resets it: the scripts navigate with the app's own buttons.
These checks cover what automation can: they do not replace trying the app with a screen reader (VoiceOver, TalkBack) on a phone.
