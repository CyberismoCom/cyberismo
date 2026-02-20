#!/usr/bin/env bash
set -euo pipefail

# Doc-Agent: Analyze a merged PR and propose documentation updates to cyberismo-docs.
#
# Usage:
#   ./scripts/doc-agent.sh <PR_NUMBER> [--push]
#
# By default runs in dry-run mode (shows diff only). Pass --push to create branch and PR.
# Requires: gh CLI authenticated, opencode on PATH (authenticated via GH Copilot).

REPO="CyberismoCom/cyberismo"
DOCS_REPO="CyberismoCom/cyberismo-docs"
DOCS_DIR=".tmp/cyberismo-docs"

# --- Parse arguments ---

PR_NUMBER=""
PUSH=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=true ;;
    --dry-run) PUSH=false ;;
    *)
      if [[ -z "$PR_NUMBER" && "$arg" =~ ^[0-9]+$ ]]; then
        PR_NUMBER="$arg"
      else
        echo "Unknown argument: $arg" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <PR_NUMBER> [--push|--dry-run]" >&2
  exit 1
fi

echo "==> Fetching PR #${PR_NUMBER} context..."

# --- Gather PR context ---

PR_JSON=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" --jq '{
  title: .title,
  body: .body,
  state: .state,
  merged: .merged,
  base_ref: .base.ref,
  head_ref: .head.ref
}')

PR_TITLE=$(echo "$PR_JSON" | jq -r '.title')
PR_BODY=$(echo "$PR_JSON" | jq -r '.body // ""')

echo "    Title: ${PR_TITLE}"

CHANGED_FILES=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}/files" --jq '.[].filename' | head -200)

PR_DIFF=$(gh api "repos/${REPO}/pulls/${PR_NUMBER}" \
  -H "Accept: application/vnd.github.v3.diff" | head -3000)

# --- Helper: extract text from opencode JSON output ---
# opencode --format json emits newline-delimited JSON events.
# Text content is in events with .type=="text" and text in .part.text
extract_opencode_text() {
  jq -rsc '[.[] | select(.type == "text") | .part.text] | join("")'
}

# --- Phase 1: Decision ---

echo "==> Phase 1: Deciding if documentation update is needed..."

DECISION_MESSAGE="You are a documentation triage agent for the Cyberismo project.

Cyberismo is an open-source tool for managing structured content using \"cards\" — each card is a directory with an index.adoc (AsciiDoc content) and index.json (metadata). The project includes a CLI (cyberismo), a web-based UI, and a data model built around card types, workflows, field types, link types, and templates.

The cyberismo-docs repository contains user-facing documentation covering:
- CLI commands and usage
- Card types, workflows, field types, link types
- Templates and project configuration
- Macros (Handlebars helpers used in card content)
- Calculations and computed fields
- Import/export functionality
- Configuration files (cardsConfig.json, etc.)

Changes that SHOULD trigger a documentation update:
- New or modified CLI commands, flags, or options
- New or changed card types, field types, link types, or workflows
- New or modified macros / Handlebars helpers
- Changes to configuration file formats or schemas
- Changes to card structure or content conventions
- New features or significant behavior changes visible to users
- Changes to import/export behavior

Changes that SHOULD NOT trigger a documentation update:
- Internal refactoring with no user-visible effect
- Test-only changes
- CI/CD pipeline changes
- Dependency bumps
- Code style / formatting changes
- Performance optimizations with no API changes
- Bug fixes that don't change documented behavior

Analyze the following PR and decide whether cyberismo-docs needs updating.

Respond with ONLY a JSON object (no markdown fences):
{ \"update_needed\": true/false, \"reasoning\": \"brief explanation\", \"areas\": [\"affected doc areas\"] }

PR #${PR_NUMBER}: ${PR_TITLE}

PR Description:
${PR_BODY}

Changed files:
${CHANGED_FILES}

Diff (truncated):
${PR_DIFF}"

DECISION_TEXT=$(opencode run --model github-copilot/claude-opus-4.6 --format json "$DECISION_MESSAGE" 2>/dev/null | extract_opencode_text) || true

# Try to extract JSON from the response (it might be wrapped in text)
DECISION_JSON=$(echo "$DECISION_TEXT" | grep -oP '\{[^{}]*"update_needed"[^{}]*\}' | head -1) || true

if [[ -z "$DECISION_JSON" ]]; then
  echo "    Could not parse decision JSON; defaulting to no update needed."
  echo "    Raw output: ${DECISION_TEXT:0:500}"
  exit 0
fi

UPDATE_NEEDED=$(echo "$DECISION_JSON" | jq -r '.update_needed // false')
REASONING=$(echo "$DECISION_JSON" | jq -r '.reasoning // "no reasoning"')
AREAS=$(echo "$DECISION_JSON" | jq -r '.areas // [] | join(", ")')

echo "    Update needed: ${UPDATE_NEEDED}"
echo "    Reasoning: ${REASONING}"
echo "    Areas: ${AREAS}"

if [[ "$UPDATE_NEEDED" != "true" ]]; then
  echo "==> No documentation update needed. Done."
  exit 0
fi

# --- Phase 2: Action ---

echo "==> Phase 2: Applying documentation changes..."

# Ensure cyberismo-docs is checked out
if [[ -d "${DOCS_DIR}/.git" ]]; then
  echo "    Using existing checkout at ${DOCS_DIR}"
  git -C "$DOCS_DIR" checkout main
  git -C "$DOCS_DIR" pull --ff-only
else
  echo "    Cloning cyberismo-docs to ${DOCS_DIR}..."
  mkdir -p "$(dirname "$DOCS_DIR")"
  gh repo clone "$DOCS_REPO" "$DOCS_DIR" -- --depth=50
fi

ACTION_MESSAGE="You are a documentation writer for the Cyberismo project. Your task is to update the cyberismo-docs repository based on a merged PR.

Repository structure:
The docs repo is a Cyberismo cards project. The documentation lives under cardRoot/ in a tree structure. Each card is a directory containing:
- index.json — metadata (summary, labels, etc.). Do NOT modify these files.
- index.adoc — AsciiDoc content. This is what you should edit.
- Subdirectories for child cards.

Other important files (do NOT modify):
- cardsConfig.json — project configuration
- .cards/ — card type definitions, workflows, templates

Rules:
1. ONLY modify index.adoc files — never touch JSON, config, or template files.
2. Preserve all existing Handlebars macros (e.g., {{#card ...}}, {{name}}, etc.) — do not remove or alter them.
3. Keep changes minimal and focused — only update what is needed for the PR changes.
4. Match the existing writing style and AsciiDoc conventions used in the repo.
5. If you are unsure about a change, err on the side of NOT making it.
6. Do not add new cards/directories — only modify existing content.

Make the necessary documentation changes now based on the PR information below.

Source PR #${PR_NUMBER}: ${PR_TITLE}

PR Description:
${PR_BODY}

Decision reasoning: ${REASONING}
Areas to update: ${AREAS}

Diff (truncated):
${PR_DIFF}"

# Run opencode in the docs directory
(cd "$DOCS_DIR" && opencode run --model github-copilot/claude-opus-4.6 "$ACTION_MESSAGE")

# --- Check for changes ---

DIFF_OUTPUT=$(git -C "$DOCS_DIR" diff)

if [[ -z "$DIFF_OUTPUT" ]]; then
  echo "==> opencode made no changes. Nothing to do."
  exit 0
fi

echo ""
echo "==> Proposed changes:"
echo "----"
git -C "$DOCS_DIR" diff --stat
echo "----"
echo "$DIFF_OUTPUT"
echo "----"

if [[ "$PUSH" != "true" ]]; then
  echo ""
  echo "==> Dry run complete. Pass --push to create a PR."
  exit 0
fi

# --- Create PR ---

echo "==> Creating PR in cyberismo-docs..."

BRANCH="doc-agent/pr-${PR_NUMBER}"

git -C "$DOCS_DIR" config user.name "github-actions[bot]"
git -C "$DOCS_DIR" config user.email "github-actions[bot]@users.noreply.github.com"

git -C "$DOCS_DIR" checkout -B "$BRANCH"
git -C "$DOCS_DIR" add -A
git -C "$DOCS_DIR" commit -m "docs: update based on ${REPO}#${PR_NUMBER}

${PR_TITLE}

Auto-generated by doc-agent."

git -C "$DOCS_DIR" push --force-with-lease origin "$BRANCH"

PR_URL=$(gh pr create \
  --repo "$DOCS_REPO" \
  --base main \
  --head "$BRANCH" \
  --title "docs: update for ${REPO}#${PR_NUMBER} — ${PR_TITLE}" \
  --body "$(cat <<EOF
## Auto-generated documentation update

Source PR: https://github.com/${REPO}/pull/${PR_NUMBER}

**Reasoning:** ${REASONING}

**Areas:** ${AREAS}

---
Generated by doc-agent from merged PR.
EOF
)")

echo "==> PR created: ${PR_URL}"
