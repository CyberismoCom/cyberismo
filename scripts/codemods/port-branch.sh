#!/bin/bash

# Usage: port-branch.sh <feature-worktree> <last-pre-landing-main-commit>
#
# Ports an in-flight feature branch across the A1/A2 vocabulary rename:
#   1. merges <last-pre-landing-main-commit> into the branch checked out in
#      <feature-worktree> (its declarations still use the old names, so the
#      codemods can resolve them);
#   2. runs the A1 codemod, then the A2 codemod if one is available, with
#      <feature-worktree> as the target root, then prettier;
#   3. commits the result. Then merge or rebase the branch onto main.
#
# Codemods are taken from this script's directory; when absent (after A33
# deleted scripts/codemods/) from refs/archive/api/a1 and refs/archive/api/a2:
#   git fetch origin 'refs/archive/api/*:refs/archive/api/*'
#   git show refs/archive/api/a1:scripts/codemods/port-branch.sh > $TMPDIR/port.sh
#   bash $TMPDIR/port.sh <feature-worktree> <commit>
# The A2 step is skipped, with a notice, when neither place has a2-model.cjs.
#
# Needs: ts-morph outside the repo (see the a1-vocabulary.cjs header; set
# CODEMOD_NODE_PATH if not ~/cyberismo/.codemod-tools/node_modules) and an
# installed <feature-worktree> (pnpm install), whose types the codemods read.
# If the merge conflicts, resolve and commit it, then run this again.

set -euo pipefail

if [ $# -ne 2 ]; then
  sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

WT=$(cd "$1" && pwd)
BASE=$2
HERE=$(cd "$(dirname "$0")" && pwd)
export NODE_PATH=${CODEMOD_NODE_PATH:-$HOME/cyberismo/.codemod-tools/node_modules}

if [ -n "$(git -C "$WT" status --porcelain)" ]; then
  echo "port-branch: $WT has uncommitted changes" >&2
  exit 1
fi
if [ ! -d "$WT/node_modules" ]; then
  echo "port-branch: run pnpm install in $WT first" >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# fetch_codemod <file> <archive ref>: copies the codemod to $TMP; fails if
# neither this directory nor the archive ref has it.
fetch_codemod() {
  if [ -f "$HERE/$1" ]; then
    cp "$HERE/$1" "$TMP/$1"
  elif git -C "$WT" rev-parse -q --verify "$2" > /dev/null; then
    git -C "$WT" show "$2:scripts/codemods/$1" > "$TMP/$1" 2> /dev/null ||
      { rm -f "$TMP/$1"; return 1; }
  else
    return 1
  fi
}

fetch_codemod a1-vocabulary.cjs refs/archive/api/a1 || {
  echo "port-branch: no a1-vocabulary.cjs here or in refs/archive/api/a1" >&2
  exit 1
}
HAVE_A2=yes
fetch_codemod a2-model.cjs refs/archive/api/a2 || HAVE_A2=

git -C "$WT" merge --no-edit "$BASE"

node "$TMP/a1-vocabulary.cjs" "$WT"
if [ -n "$HAVE_A2" ]; then
  node "$TMP/a2-model.cjs" "$WT"
else
  echo "port-branch: no a2-model.cjs here or in refs/archive/api/a2; A2 skipped"
fi
# Not `pnpm exec`: with A2's new tools/model package missing from the
# lockfile, it would install and rewrite pnpm-lock.yaml.
(cd "$WT" && ./node_modules/.bin/prettier --write tools/ --log-level warn)

git -C "$WT" add -A tools/
if git -C "$WT" diff --cached --quiet; then
  echo "port-branch: nothing to port"
  exit 0
fi
git -C "$WT" commit -q -m "Port to the A1/A2 vocabulary (generated)

Merged $BASE, then ran the A1${HAVE_A2:+/A2} codemods and prettier."
git -C "$WT" log --oneline -1
