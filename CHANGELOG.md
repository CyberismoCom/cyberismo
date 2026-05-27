# Changelog

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
