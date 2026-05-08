# Changelog

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
