# Accessibility audit — WCAG 2.1 AA (core flows)

**Date:** 2026-10-18
**Scope:** landing page, navigation, referral landing page, invite-friends
page, puzzle roadmap, error/404 pages, and the shared search, pagination and
status-state components.
**Target:** WCAG 2.1 Level AA.

## How this was audited

1. Manual source audit of the pages and shared components above against the
   WCAG 2.1 AA success criteria (perceivable, operable, understandable,
   robust).
2. Keyboard walkthrough of each core flow: skip link, tab order, mobile-menu
   toggle, menu dismissal, search field, pagination, retry actions.
3. Automated semantic/keyboard assertions in
   `frontend/tests/accessibility.test.jsx` (10 tests, run with
   `npm --prefix frontend test`).
4. The CI pipeline enforces the automated baselines:
   - `axe` against the production build (`@axe-core/cli`, fails on any
     violation),
   - Lighthouse accessibility ≥ 0.90, read from
     `frontend/a11y-baseline.json` by
     `frontend/scripts/check-a11y-baseline.js`,
   - both reports uploaded as the `accessibility-audit-reports` artifact.

The Lighthouse/axe steps require Chrome. They run in CI; in an environment
without Chrome, the local equivalent is the component test suite plus
`npm --prefix frontend run build` (see "Known limitations").

## Findings and fixes

| # | Issue | WCAG criterion | Fix |
| --- | --- | --- | --- |
| 1 | No way to bypass the navigation; tabs started at the logo | 2.4.1 Bypass Blocks, 2.4.3 Focus Order | Added a "Skip to main content" link as the first focusable element, visible on focus, targeting `#main-content`. |
| 2 | Home, invite-friends and referral pages had no `<main>` landmark; some pages had more than one | 1.3.1 Info and Relationships, 2.4.1 | Every core page now renders exactly one `<main id="main-content" tabIndex={-1}>`; it is the skip-link target and receives programmatic focus. |
| 3 | Mobile menu button was an unlabelled icon with no state | 4.1.2 Name, Role, Value, 2.1.1 Keyboard | Added `aria-label` ("Open/Close navigation menu"), `aria-expanded`, `aria-controls`, `type="button"`; Escape closes the menu and returns focus to the toggle. |
| 4 | A `<Link>` was nested inside `<button>` (Connect Wallet) | 4.1.2, 2.1.1 | Button renders as its link child via `asChild` (Radix Slot), producing one interactive element with a single accessible name. |
| 5 | Navigation text was `text-gray-300` on a 20%-opaque black bar over a white page (~1.2:1) | 1.4.3 Contrast (Minimum) | Navbar background is now `bg-slate-950/90` (mobile menu `95%`), restoring ≥ 10:1 against the light navigation text. |
| 6 | Search input had only a placeholder | 1.3.1, 3.3.2 Labels or Instructions, 4.1.2 | Input now has `type="search"`, a `name`, and an `aria-label` (configurable via the `label` prop). |
| 7 | Pagination used `role="list"` on a `div` with buttons as direct children | 1.3.1 | Replaced with `<ul>`/`<li>` list semantics; current page keeps `aria-current="page"`; page changes are announced with `aria-live="polite"`. |
| 8 | Loading state was purely visual; error state was not announced | 4.1.3 Status Messages | Spinner has `role="status"` with visually hidden text; error state has `role="alert"`; retry button is `type="button"` with an accessible name. |
| 9 | Decorative Lucide icons were exposed to screen readers | 1.1.1 Non-text Content | Navigation, status, referral and error-page icons are `aria-hidden="true"` (and `focusable="false"` in the navbar). |
| 10 | Referral link input had no accessible name; copy success was silent | 1.3.1, 4.1.3 | Added `aria-label="Your referral link"` and a polite live region announcing "Referral link copied to clipboard". |
| 11 | `global-error` document had no language | 3.1.1 Language of Page | Added `lang="en"`. |
| 12 | Focus indicator was absent on some custom controls | 2.4.7 Focus Visible | Existing global `:focus-visible` ring retained; all new controls inherit it, and the skip link has its own high-contrast focus style. |

Existing behaviour retained: reduced-motion support, visible focus ring on all
interactive elements, image `alt` text in `PuzzleCard`, `NftCard` and the
mint-success view, and Radix Dialog's focus trap/Escape handling in the admin
review modal.

## Keyboard-only walkthrough

| Flow | Expected result |
| --- | --- |
| Page load | First `Tab` focuses "Skip to main content"; `Enter` moves focus to main content. |
| Navigation | Second `Tab` reaches the logo; subsequent tabs visit Play Now, Leaderboard, Learn, Invite Friends, Connect Wallet. |
| Mobile menu | `Enter`/`Space` on the menu button expands it and sets `aria-expanded="true"`; `Escape` closes it and returns focus to the button. |
| Search | The field is reachable and announced as "Search"; typing filters without a pointer. |
| Pagination | `Tab` reaches Previous, page numbers, Next; `Enter` activates; the current page is announced. |
| Error retry | `Tab` reaches "Try again"; `Enter` retries. |

## Verification

```bash
# Component-level keyboard and semantics tests
npm --prefix frontend test -- tests/accessibility.test.jsx

# Full frontend suite (see known limitations for pre-existing failures)
npm --prefix frontend test

# Production audit (requires Chrome, as used by CI)
npm --prefix frontend run build
npx --yes @axe-core/cli@4.10.2 http://127.0.0.1:3000 --exit
npx --yes lighthouse@12.8.2 http://127.0.0.1:3000 \
  --only-categories=accessibility --output=json \
  --output-path=/tmp/lighthouse-a11y.json --quiet
node frontend/scripts/check-a11y-baseline.js /tmp/lighthouse-a11y.json
```

## Known limitations

- Admin screens (`/admin/*`) are outside the core-flow scope of this audit.
  `AdminLayout` renders a `<main>` and the puzzle-submission page renders a
  second one; that pre-existing double landmark should be collapsed to a
  single `<main>` in a follow-up.
- Lighthouse cannot be executed in an environment without Chrome; the
  checked-in CI job is the authoritative source for the ≥ 0.90 score.
- The frontend test suite has pre-existing failures unrelated to
  accessibility (wallet hook/jsdom environment, some route-mocking tests).
  `tests/accessibility.test.jsx` passes independently and is included in
  `npm test`.
- Colour contrast is enforced for the audited pages only; new components
  should be checked against 1.4.3 before merge.
