#!/bin/sh
# SPDX-FileCopyrightText: Cyberismo Ltd and contributors
# SPDX-License-Identifier: AGPL-3.0-only

# Installs the experimental `cyberismo-dev` binary from a GitHub Actions
# artifact of the "Binary" workflow. Builds are kept side by side under
# $CYBERISMO_DEV_HOME/versions and one is linked into $CYBERISMO_DEV_BIN_DIR.
#
#   install.sh                 latest successful build of main
#   install.sh --pr 1234       latest successful build of that pull request
#   install.sh --branch name   latest successful build of that branch
#   install.sh --run 987654    that workflow run
#
# Needs an authenticated GitHub CLI (`gh auth login`): Actions artifacts are
# not downloadable anonymously.

set -eu

REPO="${CYBERISMO_DEV_REPO:-CyberismoCom/cyberismo}"
WORKFLOW="binary.yml"
HOME_DIR="${CYBERISMO_DEV_HOME:-$HOME/.cyberismo-dev}"
BIN_DIR="${CYBERISMO_DEV_BIN_DIR:-$HOME/.local/bin}"

die() {
  echo "cyberismo-dev install: $*" >&2
  exit 1
}

pr="" branch="" run="" selectors=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pr) pr="${2:?--pr needs a number}" ;;
    --branch) branch="${2:?--branch needs a name}" ;;
    --run) run="${2:?--run needs a run id}" ;;
    *) die "unknown argument: $1 (expected --pr N, --branch NAME or --run ID)" ;;
  esac
  selectors=$((selectors + 1))
  shift 2
done
[ "$selectors" -le 1 ] || die "use only one of --pr, --branch, --run"

command -v gh >/dev/null 2>&1 || die "the GitHub CLI (gh) is required: https://cli.github.com"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) die "unsupported OS: $(uname -s)" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac
artifact="cyberismo-dev-$os-$arch"

if [ -n "$run" ]; then
  label="run-$run"
  sha=$(gh run view "$run" -R "$REPO" --json headSha -q .headSha) ||
    die "run $run not found in $REPO"
else
  if [ -n "$pr" ]; then
    label="pr-$pr"
    branch=$(gh pr view "$pr" -R "$REPO" --json headRefName -q .headRefName) ||
      die "pull request $pr not found in $REPO"
  elif [ -n "$branch" ]; then
    label=$(printf '%s' "$branch" | tr -c 'A-Za-z0-9._-' '-')
  else
    label="main"
    branch="main"
  fi
  found=$(gh run list -R "$REPO" --workflow "$WORKFLOW" --branch "$branch" \
    --status success --limit 1 --json databaseId,headSha \
    -q '.[0] | select(.) | "\(.databaseId) \(.headSha)"')
  [ -n "$found" ] || die "no successful $WORKFLOW run for branch '$branch' in $REPO"
  run=${found%% *}
  sha=${found#* }
fi

id="$label-$(printf '%s' "$sha" | cut -c1-9)"
dest="$HOME_DIR/versions/$id"

if [ -x "$dest/cyberismo-dev" ]; then
  echo "$id is already downloaded"
else
  tmp="$HOME_DIR/versions/.tmp-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  trap 'rm -rf "$tmp"' EXIT
  echo "Downloading $artifact from run $run ($id)"
  gh run download "$run" -R "$REPO" -n "$artifact" -D "$tmp" ||
    die "run $run has no artifact $artifact (expired, or this platform is not built)"
  [ -f "$tmp/cyberismo-dev" ] || die "artifact $artifact does not contain cyberismo-dev"
  chmod +x "$tmp/cyberismo-dev"
  "$tmp/cyberismo-dev" --version >/dev/null || die "downloaded binary does not run"
  rm -rf "$dest"
  mv "$tmp" "$dest"
fi

mkdir -p "$BIN_DIR"
ln -sfn "$dest/cyberismo-dev" "$BIN_DIR/cyberismo-dev"
echo "cyberismo-dev -> $id"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not on your PATH" ;;
esac
