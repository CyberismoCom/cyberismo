---
name: ui-screenshots
description: Take before and after screenshots of the app for a pull request that changes what tools/app renders, and write the screenshot table for the pull request. Use it when you prepare or update a pull request with visible UI changes.
---

# Before and after screenshots for a UI pull request

Each pull request that changes how the app looks shows the affected screens before and after the change, in light and dark. The script `tools/app/scripts/screenshots.js` takes the screenshots from a running app. This skill runs the script on the base branch and on the branch of the pull request.

## 1. Select a project and the screens

- Use a project with content that shows the change. The e2e project works for most screens. The command `node tools/app/scripts/setup-e2e.js` creates it at `.tmp/cyberismo-bat`, with the prefix `bat`. The command needs a built CLI (`pnpm build`).
- List the screens as `<name>=<path>` pairs. Each path is relative to `/projects/<prefix>`, for example `card=/cards/<key>`, `general=/configuration/general`, or `cardtype=/configuration/<module>/cardTypes/<name>`. List only the screens that the change affects, usually two to five.
- If the change needs the UI in a state, such as an open dialog or a field in edit mode, say so in the pull request. Do not script it. Or take that screenshot by hand.

## 2. Start the app

From the root of the repository, in two background shells:

```sh
npm_config_project_path=$PWD/.tmp/cyberismo-bat pnpm --filter backend dev
pnpm --filter app dev
```

Vite serves the app on http://localhost:5173 and sends `/api` to the backend on port 3000. A project on an older schema version does not load. Run `pnpm cyberismo migrate -p <path>` on a copy of the project. Never migrate a project that is in the repository.

## 3. Take the screenshots on the base branch, then on the branch of the pull request

The working tree must be clean. Vite reloads after each switch. If the pull request changes the backend or `data-handler`, restart the backend after each switch.

```sh
git switch main
node tools/app/scripts/screenshots.js --project bat --label before <name>=<path> ...
git switch -
node tools/app/scripts/screenshots.js --project bat --label after <name>=<path> ...
```

The script writes the files to `.tmp/screenshots/<name>-<scheme>-<label>.png`. Look at each pair before you use it. A blank page, a spinner, or "not found" means that the route or the project is wrong.

## 4. Write the table

GitHub has no API to attach images to a pull request. The person drags the files into the description of the pull request in the browser, and GitHub turns each file into a link. Give the person the folder and a table to paste, with one row for each screen and scheme. Each cell names the file that goes there:

```markdown
| Screen            | Before                | After                |
| ----------------- | --------------------- | -------------------- |
| Card page (light) | card-light-before.png | card-light-after.png |
```

Do not commit the screenshots.
