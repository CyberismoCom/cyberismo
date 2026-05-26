#!/usr/bin/env bash
# setup-modules.sh — creates two test module repos for exercising the
# Cyberismo migration-replay flow end-to-end against real GitHub remotes.
#
# Layout it builds:
#   base  v1.0.0   workflow + fieldType "status"
#   base  v1.1.0   breaking: rename status -> state
#   foo   v1.0.0   declares base@^1.0.0; cardType "task" references
#                  foo/fieldTypes/priority AND base/fieldTypes/status
#   foo   v1.1.0   breaking: rename priority -> urgency
#
# When a consumer at foo@1.0.0 / base@1.0.0 later updates to foo@1.1.0, the
# resolver bumps base transitively to 1.1.0 (still in range ^1.0.0). Two
# sealed logs replay against the consumer's cards: foo's 1.1.0 (priority ->
# urgency) and base's 1.1.0 (status -> state).
#
# Prereqs:
#   - cyberismo on $PATH and built from this branch
#   - gh authenticated (`gh auth status`)
#   - git user.name and user.email configured
#
# Env overrides:
#   GH_USER      defaults to the authenticated user
#   REMOTE_NS    defaults to GH_USER — where the repos get created
#   TEST_ROOT    defaults to $HOME/cyb-test — local working dir for the repos
#   DELETE_FIRST if set to 1, will `gh repo delete` any pre-existing
#                repos with these names before recreating them

set -euo pipefail

: "${GH_USER:=$(gh api user --jq .login)}"
: "${TEST_ROOT:=$HOME/cyb-test}"
: "${REMOTE_NS:=$GH_USER}"
: "${DELETE_FIRST:=0}"

BASE_REPO=cyb-test-base
FOO_REPO=cyb-test-foo
BASE_DIR="$TEST_ROOT/$BASE_REPO"
FOO_DIR="$TEST_ROOT/$FOO_REPO"

mkdir -p "$TEST_ROOT"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

maybe_delete_remote() {
  local repo="$1"
  if [ "$DELETE_FIRST" = "1" ] && gh repo view "$REMOTE_NS/$repo" >/dev/null 2>&1; then
    log "Deleting existing $REMOTE_NS/$repo"
    gh repo delete "$REMOTE_NS/$repo" --yes
  fi
}

new_module() {           # $1=dir  $2=prefix  $3=human-name
  rm -rf "$1"
  cyberismo create project "$3" "$2" "$1" --skipModuleImport
  (cd "$1" && git init -q && git add . && git commit -q -m "initial scaffold")
}

seal_and_publish() {     # $1=bump  $2=commit-msg-for-pending-changes
  git add . && git commit -q -m "$2"
  cyberismo create version "$1"
  git add . && git commit -q -m "seal $1 version"
  git push
  cyberismo publish      # creates v<X.Y.Z> annotated tag and pushes
}

# ---------------- base v1.0.0 ----------------
log "Creating base v1.0.0"
maybe_delete_remote "$BASE_REPO"
new_module "$BASE_DIR" "base" "Base"
cd "$BASE_DIR"

cyberismo create workflow simple
cyberismo create fieldType status shortText
cyberismo create cardType note base/workflows/simple
cyberismo update base/cardTypes/note add customFields \
  '{"name":"base/fieldTypes/status"}'

git add . && git commit -q -m "v1.0.0 resources"
cyberismo create version major          # 1.0.0 — seals current log + writes cardsConfig version
git add . && git commit -q -m "seal v1.0.0"
gh repo create "$REMOTE_NS/$BASE_REPO" --public --source=. --remote=origin --push
cyberismo publish                       # pushes tag v1.0.0

# ---------------- foo v1.0.0 (declares base@^1.0.0) ----------------
log "Creating foo v1.0.0"
maybe_delete_remote "$FOO_REPO"
new_module "$FOO_DIR" "foo" "Foo"
cd "$FOO_DIR"

# Only base@1.0.0 exists right now, so ^1.0.0 resolves to 1.0.0.
cyberismo import module \
  "https://github.com/$REMOTE_NS/$BASE_REPO.git@^1.0.0"

cyberismo create workflow flow
cyberismo create fieldType priority shortText
cyberismo create cardType task foo/workflows/flow
cyberismo update foo/cardTypes/task add customFields \
  '{"name":"foo/fieldTypes/priority"}'
cyberismo update foo/cardTypes/task add customFields \
  '{"name":"base/fieldTypes/status"}'

git add . && git commit -q -m "v1.0.0 resources"
cyberismo create version major          # 1.0.0 — seals current log + writes cardsConfig version
git add . && git commit -q -m "seal v1.0.0"
gh repo create "$REMOTE_NS/$FOO_REPO" --public --source=. --remote=origin --push
cyberismo publish                       # pushes tag v1.0.0

# ---------------- base v1.1.0 (breaking) ----------------
log "Publishing base v1.1.0 (rename status -> state)"
cd "$BASE_DIR"
cyberismo update base/fieldTypes/status change name status state
seal_and_publish minor "rename status -> state"

# ---------------- foo v1.1.0 (breaking; does NOT refresh its base) ----
log "Publishing foo v1.1.0 (rename priority -> urgency)"
cd "$FOO_DIR"
cyberismo update foo/fieldTypes/priority change name priority urgency
seal_and_publish minor "rename priority -> urgency"
# Note: foo's installed copy of base in .cards/modules/base stays at 1.0.0.
# Consumers re-resolve base independently against the remote, so this is fine —
# and it keeps foo's sealed log clean of base's rename entries.

cat <<EOF

Done. Modules published:
  base: https://github.com/$REMOTE_NS/$BASE_REPO
  foo:  https://github.com/$REMOTE_NS/$FOO_REPO

Next: set up a consumer project that imports foo@1.0.0, then update it to 1.1.0
to exercise the transitive replay (see consumer commands separately).
EOF
