# app architecture

The React 19 + Vite + MUI Joy single-page frontend. It talks to the backend over
HTTP (SWR for fetching, Redux Toolkit for local state) and imports only
browser-safe types and code from `@cyberismo/model`. `@/*` maps to `src/*`.

## Structure

| Folder                        | What it is                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pages/`                      | Route-level screens; routes are declared in `routes.ts`.                                                 |
| `components/`                 | UI grouped by feature (`card/`, `config-editors/`, `macros/`, `modals/`, ...); generic ones at the root. |
| `lib/api/`                    | SWR hooks and mutations per backend resource, plus `actions/`.                                           |
| `lib/slices/`, `store.ts`     | Redux slices for cross-screen client state.                                                              |
| `lib/hooks/`, `lib/auth/`     | Reusable hooks; roles and permission gating (`usePermissions`, `Gate`).                                  |
| `lib/contexts/`, `providers/` | React contexts and providers (event stream, modals, store).                                              |
| `lib/` root, `locales/`       | Pure helpers; i18n strings (`en/translation.json`).                                                      |

## Dependencies

- May use `@cyberismo/model` only. Never `@cyberismo/data-handler` or any other `@cyberismo/*`; the backend is reached over HTTP.
- Inside: `pages/` -> `components/` -> `lib/`, `providers/`; `lib/` imports no component or page.
- Enforced: `package.json` declares only `@cyberismo/model`, so pnpm resolves no other workspace package. An ESLint ban also catches relative paths into data-handler. Layer direction is checked in review.

## Key concepts and invariants

- The app renders and requests; project rules live in data-handler behind a backend endpoint.
- Server data comes through `lib/api/` hooks (SWR); Redux holds client state only.
- Permission-gated UI uses `lib/auth/`; the backend still enforces the role.
- User-visible strings live in `locales/`; e2e reads them from there.
- e2e (Playwright, `e2e/tests/`) covers user journeys; `__tests__/` (Vitest) covers units and non-trivial component logic.

## Design system

The look is MUI Joy with the overrides in `theme.ts`. Follow these rules:

- One corner: every rectangle uses `radius.sm` (`borderRadius: 'sm'`). Use `50%` only for circles. Cards, dialogs, and the buttons in cards get the corner from `theme.ts`.
- Spacing uses the 8px steps of Joy (`0.5`, `1`, `1.5`, `2`, `3`, `4`), never pixel strings. A nudge of 1 or 2px that aligns the contents of a control has a comment that says why.
- Forms: fields 24px apart (`Stack spacing={3}`), at most `FORM_FIELD_MAX_WIDTH` wide, with controls of size md. Section headings are `h4`, with 32px above and 16px below. Size sm is for dense rows: toolbars, tables, list rows, and the tree.
- Shadows only on what floats: menus, popovers, and dialogs.
- Colour comes from palette tokens, and workflow state from `getStateColor`. Set type with `level`, not `fontSize`.
- A change to what the app renders shows before and after screenshots in its pull request.

## Known debt

- `components/` root mixes generic and feature components; components call `lib/api/` directly; `lib/api/` also writes Redux state.
- `lib/utils.ts` and `lib/hooks/utils.ts` are catch-alls; state has three homes (`slices`, `contexts`/`providers`, `hooks/redux.ts`).
- Some components still set font sizes by hand. The workflow state colours and the primary button in the dark theme miss contrast targets.
