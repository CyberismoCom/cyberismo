#!/bin/sh
# SPDX-FileCopyrightText: Cyberismo Ltd and contributors
# SPDX-License-Identifier: AGPL-3.0-only

# Installs the `cyberismo-dev` binary that CI built for a pull request:
#
#   install.sh 1234
#
# The binary is an artifact of the "Binary" workflow run for the pull
# request's newest commit. It replaces $CYBERISMO_DEV_BIN_DIR/cyberismo-dev
# (default ~/.local/bin). `cyberismo-dev self install 1234` runs this script.

set -eu

REPO="CyberismoCom/cyberismo"
BIN_DIR="${CYBERISMO_DEV_BIN_DIR:-$HOME/.local/bin}"

die() {
  echo "cyberismo-dev install: $*" >&2
  exit 1
}

pr="${1:-}"
case "$pr" in
  "" | *[!0-9]*) die "usage: install.sh <pull request number>" ;;
esac

# 1. Tools. Actions artifacts cannot be downloaded anonymously, so the GitHub
#    CLI provides the login.
for tool in gh curl unzip; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is required"
done
gh auth status >/dev/null 2>&1 || die "log in to GitHub first: gh auth login"

# 2. Platform.
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) artifact="cyberismo-dev-linux-x64" ;;
  Darwin-arm64) artifact="cyberismo-dev-darwin-arm64" ;;
  *) die "no build for $(uname -s) $(uname -m) (only Linux x86_64 and macOS arm64)" ;;
esac

# 3. The build of the pull request's newest commit.
sha=$(gh pr view "$pr" -R "$REPO" --json headRefOid -q .headRefOid) ||
  die "pull request $pr not found in $REPO"
short=$(printf '%s' "$sha" | cut -c1-9)
runs() {
  gh run list -R "$REPO" --workflow binary.yml --commit "$sha" --limit 1 \
    --json databaseId,status "$@" -q '.[0] | select(.) | "\(.databaseId) \(.status)"'
}
run=$(runs --status success)
run=${run%% *}
if [ -z "$run" ]; then
  latest=$(runs)
  case "$latest" in
    "") die "no build of pull request $pr at $short yet; it starts within a minute of a push" ;;
    *" completed") die "the build of pull request $pr at $short failed: gh run view ${latest%% *} -R $REPO" ;;
    *) die "the build of pull request $pr at $short is still running: gh run watch ${latest%% *} -R $REPO" ;;
  esac
fi
artifact_id=$(gh api "repos/$REPO/actions/runs/$run/artifacts" \
  -q ".artifacts[] | select(.name == \"$artifact\" and (.expired | not)) | .id")
[ -n "$artifact_id" ] ||
  die "the build of pull request $pr at $short has expired; re-run it: gh run rerun $run -R $REPO"

# 4. Download, next to the destination so the final move is atomic.
mkdir -p "$BIN_DIR"
tmp=$(mktemp -d "$BIN_DIR/.cyberismo-dev.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
echo "Downloading cyberismo-dev for pull request $pr ($short)"
curl -fL --progress-bar -o "$tmp/artifact.zip" \
  -H "Authorization: Bearer $(gh auth token)" \
  "https://api.github.com/repos/$REPO/actions/artifacts/$artifact_id/zip" ||
  die "download failed"
unzip -q "$tmp/artifact.zip" -d "$tmp"

# 5. Check that it runs, then put it in place.
chmod +x "$tmp/cyberismo-dev"
build=$("$tmp/cyberismo-dev" --version | head -n 1) ||
  die "the downloaded binary does not run"
mv -f "$tmp/cyberismo-dev" "$BIN_DIR/cyberismo-dev"
echo "Installed $BIN_DIR/cyberismo-dev (${build#cyberismo-dev build: })"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not on your PATH" ;;
esac
