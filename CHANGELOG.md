# Changelog

## [1.0.0] — 2026-06-15

### Highlights

Role-based permissions now gate the UI — readers and editors see only the actions available to them while admin-only mutations are hidden. Users can also create new projects without the CLI via a "New Project" button in the projects view.

### Breaking changes

- Transition names within a workflow are now validated to be unique; projects with duplicate transition names will fail `cyberismo validate`. Rename duplicate transitions in your workflow files to resolve. (#1437)

### Features

- Role-based permissions gate card and config UI by role — readers/editors can view configuration while mutations stay admin-only (#1312)
- New "New Project" button in the projects view lets you initialize or clone a project without the CLI (#1431)
- Project description and category are now editable from the configuration view (#1451)
- Template card metadata fields are now editable (#1448)

### Fixes

- Fix graph macro duplicating SVG controls on the screen (#1456)
- Fix broken xref macro warning rendering in the middle of text (#1455)
- Show a clear validation error when a `shortText` value exceeds the length limit (#1450)
- Remove the "Status: " prefix from workflow transition buttons (#1449)
- Fix attachment upload bug (#1442)
- Fix null Boolean field incorrectly shown as "No" (#1436)
- Fix outdated facts displayed in the card logic program view (#1435)
- Fix template card creation from the Create menu (#1434)

### Internal

- Enable ccache in devcontainer for faster builds (#1440)
- Install Playwright browsers in devcontainer post-create (#1438)
- Pin third-party GitHub Actions to commit hashes (#1433)
- Fix useless conditional identified by code scanning alert #248 (#1432)

## [0.0.27] — 2026-06-04

### Highlights

This release adds the first version of `git push` directly from the CLI, includes workflow state in PDF exports, and fixes several UI layout issues on narrow screens and mobile.

### Features

- Add first version of git push functionality (#1397)
- Add workflow state to PDF export (#1395)
- Improve TOC and notifications & checks responsivity (#1425)
- Improve SVG viewer controls on mobile (#1383)

### Fixes

- Fix image overlay buttons overlap (#1430)
- Hide export project option in exported static site (#1393)
- Pre-render workflow graphs for static site export (#1391)
- Prevent card content edit button overlap on narrow screens (#1378)

### Dependencies

- Security: update `tar` to patch CVE-2026-29786 (hardlink path traversal, high severity) (#1369)
- 8 dependency updates (#1334, #1399, #1419, #1421, #1422, #1426, #1427, #1428)

### Internal

- Replace Cypress with Playwright for E2E tests (#1398)
- Add CODEOWNERS file (#1394)
- Skip Docker build if already published (#1384)
- Improve Dependabot grouping (#1418)
- Add descriptions for docs project resources (#1396)
- Update docs to application version 0.0.26 (#1388, #1389)

## [0.0.26] — 2026-05-28

### Highlights

Fixes native AsciiDoc cross-reference link resolution across card rendering, PDF export, and the MCP server.

### Fixes

- Fix native AsciiDoc xref links in card rendering, PDF export, and MCP render (#1380).

## [0.0.25] — 2026-05-27

### Highlights

Inline editing for card metadata, links, and content transforms the card editing experience, while full multi-project support now lets you work across multiple projects in a single application instance. Node.js 22 is now the minimum required version.

### Breaking changes

- Node.js >=22 is now required by all published packages. Upgrade to Node.js 22 LTS before updating (#1377).

### Features

- Inline editing for card metadata, links, and content — edit fields, links, and markdown directly in the card view without opening a separate editor (#1355).
- Multi-project support: project selection modal, per-project navigation, and multi-project API and MCP server (#1352).
- Allow autocommit for SaaS deployments (#1381).
- Make static sites usable on mobile (#1367).
- Allow template card moves (#1356).
- Set `lastupdated` and `labels` as the default always-visible card fields (#1361).

### Fixes

- Fix HTML injection vulnerability in Mermaid `classDef` (upgrade to 11.15.0) (#1376).
- Fix postcss XSS vulnerability in Vite (upgrade to 8.0.14, GHSA-qx2v-qp2m-jg93) (#1374).
- Fix prototype pollution vulnerability in axios (upgrade to v1.16.1) (#1368).
- Fix application becoming unresponsive (jam) (#1360).
- Fix static API paths to support multiproject (#1359).
- Remove presence indicator from local environment (#1362).

### Dependencies

- Bump `hono` from 4.12.14 to 4.12.18 (#1366).

### Internal

- Move docs under main repo (#1365).
- Update docs installation guide (#1379).
- Remove vega-selections override and rely on standard resolution (#1370).
- Scope card logic program helper to results for improved Clingo grounder performance (#1358).
- Simplify enum and list definitions in the query language for improved performance (#1357).
- Fix GitHub release job missing repo context (#1350).

## [0.0.24] — 2026-05-07

### Highlights

Module system rewrite with semver-based version pinning and a new `cyberismo check-updates` command for discovering available module updates. The workflow editor now renders state-machine diagrams, card content supports Mermaid, and project/card-level PDF export ships.

### Breaking changes

- `cardsConfig.json`: `modules[].branch` is removed; use `modules[].version` (semver version or range, e.g. `"1.0.0"`, `"^1.0.0"`). Omit to accept any version. A v4 migration converts existing configs automatically (#1308, #1347).
- `cardsConfig.json`: `modules[].name` is now validated as `^[a-z]+$`, length 3–10 (#1308).
- `cyberismo import module`: the positional `[branch]` argument is removed. Pass `source@version` instead, e.g. `my-module@main` or `my-module@^1.0.0` (#1308).

### Features

- New `cyberismo check-updates [moduleName]` command queries each installed module's remote source and prints a per-module `installed → latest` table, with interactive prompts to apply auto-updatable updates (#1308).
- New `cyberismo show modules` and `cyberismo show module <name>` commands; `cyberismo show project` now lists installed modules with their versions (#1308).
- Workflow editor renders the workflow as a state-machine diagram (#1316).
- Mermaid diagram support in card content (#1288).
- Project- and card-level PDF export with persistent progress notifications (#1294).
- TreeMenu UX and drag-and-drop reliability improvements (#1068).

### Fixes

- Prevent path traversal when deleting an attachment (#1310).
- Stay in the configuration editor after deleting a template card (#1318).
- Name the parent module in errors when removing, updating, or checking transitive-only modules (#1348).

### Dependencies

- 19 dependency updates, including TypeScript 5.9 → 6.0 (#1342), esbuild 0.27 → 0.28 (#1327), `@vitejs/plugin-react` 5 → 6 (#1325), and bumps for `hono`, `react-router`, `react-hook-form`, `dompurify`, `jose`, `i18next`, `@modelcontextprotocol/sdk`, `@inquirer/confirm`, `simple-git`, `@codemirror/view`, `@viz-js/viz`, `rollup-plugin-license`, `@uiw/codemirror-theme-vscode`, `@hono/node-server`, `prettier`, and grouped React deps (#1313, #1314, #1315, #1323, #1326, #1328, #1329, #1330, #1333, #1335, #1336, #1337, #1338, #1339, #1340, #1341).

### Internal

- New unified `publish.yml` release pipeline: PRs touching `tools/cli/package.json` dry-run against Verdaccio; pushes to `main` publish to npm and Docker Hub, tag, and create a GitHub release. Switched to native arm runners (#1346).
- `@cyberismo/node-clingo` now ships as per-platform npm packages instead of postinstall-downloaded prebuilds; native binaries install automatically via optional deps (#1320).
- Add `cyberismo` CLI setup to devcontainer post-create (#1307).
- Pre-build Clingo before CodeQL init so the submodule isn't analyzed (#1305).
- Skip a flaky test (#1344).
- Revert "Remove npm install from publish.yml" (#1302).
