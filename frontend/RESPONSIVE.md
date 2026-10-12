# Responsive layouts

Existing pages and exercise behavior share the same themes and data. Layout changes use available viewport space, not device detection.

- Below 1280px, navigation opens over the page in a drawer. Exercise routes use their own back/progress controls and hide the global header and drawer.
- At 1280px and above, the app sidebar is persistent. Write, Spell, and Test results can display their progress beside the exercise.
- At 768px, recent modules use two columns and search fits into the header row. Study-mode links use two columns on phones and tablets; answer choices use two columns from 640px.
- The editor stacks term and definition fields below 1280px. Below 640px, its own toolbar replaces global navigation. Term, title, and definition fields wrap and grow up to 192px; longer content scrolls inside the field. Below 368px, the image action moves below the definition. Values retain the existing single-line data format. Tablet/desktop fields remain inputs.
- Dictcards size against the dynamic viewport height. Long card content scrolls inside the card, keeping rating controls outside it.
- Below 640px, the existing account menu opens as a bottom sheet with backdrop/close dismissal. Exercise headers use compact spacing, card ratings stay centered, and the Write answer field keeps a 48px minimum height.
- Import content scrolls independently of its action footer. Touch devices have larger icon targets and inputs of at least 16px.

Run `npm run test:e2e:responsive` from `frontend/`. This starts an isolated read-only fixture API on port 3101 and a Next development server on port 3100; it does not use real account data. Stop another local Next development process in this checkout first, because Next shares its development output directory.

The suite covers 320px and 390px phones, 768px portrait and 1024px landscape tablets, 1440px desktop, 820px iPad WebKit, 430px iPhone WebKit, and 844 × 390 phone landscape. It checks all existing page types, long content, navigation, editor scrolling/import, card interactions, mixed test questions/results, resizing without losing study state, wrapped editor values/dictionary selection, account-sheet dismissal, and password toggle touch targets. Screenshots are written to ignored `test-results/` directories.

Browser emulation does not reproduce an actual iPad software keyboard or browser toolbar; physical-device testing is still useful for those behaviors.
