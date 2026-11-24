#!/bin/sh
# SPDX-FileCopyrightText: Cyberismo Ltd and contributors
# SPDX-License-Identifier: AGPL-3.0-only

# Installs the `cyberismo-dev` binary that CI built for a pull request, or
# for main:
#
#   install.sh 1234
#   install.sh          (or: install.sh main)
#
# The binary is an artifact of the "Binary" workflow run for the pull
# request's newest commit, or of its newest finished run on main. Builds are
# kept in ~/.cyberismo-dev/versions, one directory per pull request and one
# for main, and ~/.local/bin/cyberismo-dev links to the active one.
# `cyberismo-dev self install 1234` runs this script.

set -eu

REPO="CyberismoCom/cyberismo"
VERSIONS_DIR="${CYBERISMO_DEV_HOME:-$HOME/.cyberismo-dev}/versions"
BIN_DIR="${CYBERISMO_DEV_BIN_DIR:-$HOME/.local/bin}"

die() {
  echo "cyberismo-dev install: $*" >&2
  exit 1
}

target="${1:-main}"
case "$target" in
  main) name="main" what="main" ;;
  *[!0-9]*) die "usage: install.sh [<pull request number> | main]" ;;
  *) name="pr-$target" what="pull request $target" ;;
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

# 3. The commit to install, and whether its build is already here. For a pull
#    request it is the newest commit; for main, the newest one CI has built.
if [ "$target" = main ]; then
  sha=$(gh run list -R "$REPO" --workflow binary.yml --branch main --event push \
    --status completed --limit 1 --json headSha -q '.[0].headSha // empty')
  [ -n "$sha" ] || die "no build of main yet"
else
  sha=$(gh pr view "$target" -R "$REPO" --json headRefOid -q .headRefOid) ||
    die "pull request $target not found in $REPO"
fi
short=$(printf '%s' "$sha" | cut -c1-9)
build="$name-$short"
dest="$VERSIONS_DIR/$build"

if [ -x "$dest/cyberismo-dev" ]; then
  echo "$build is already downloaded"
else
  # 4. The CI run for that commit, and this platform's binary from it. A run
  #    can fail on the other platform and still have the binary for this one.
  runs() {
    gh run list -R "$REPO" --workflow binary.yml --commit "$sha" --limit 1 \
      --json databaseId "$@" -q '.[0].databaseId // empty'
  }
  run=$(runs --status completed)
  if [ -z "$run" ]; then
    run=$(runs)
    [ -z "$run" ] ||
      die "the build of $what at $short is still running: gh run watch $run -R $REPO"
    die "no build of $what at $short. One starts within a minute of a push, but only for pull requests into main that have no merge conflicts"
  fi
  artifact_id=$(gh api "repos/$REPO/actions/runs/$run/artifacts" \
    -q ".artifacts[] | select(.name == \"$artifact\" and (.expired | not)) | .id")
  [ -n "$artifact_id" ] ||
    die "the build of $what at $short failed or has expired: gh run view $run -R $REPO"

  # 5. Download it and check that it runs.
  mkdir -p "$VERSIONS_DIR"
  tmp=$(mktemp -d "$VERSIONS_DIR/.tmp.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT
  echo "Downloading $build"
  curl -fL --progress-bar -o "$tmp/artifact.zip" \
    -H "Authorization: Bearer $(gh auth token)" \
    "https://api.github.com/repos/$REPO/actions/artifacts/$artifact_id/zip" ||
    die "download failed"
  unzip -q "$tmp/artifact.zip" -d "$tmp"
  rm "$tmp/artifact.zip"
  chmod +x "$tmp/cyberismo-dev"
  "$tmp/cyberismo-dev" --version >/dev/null || die "the downloaded binary does not run"
  mv "$tmp" "$dest"
fi

# 6. Make it the active build, and drop older builds of the same pull request (or of main).
mkdir -p "$BIN_DIR"
ln -sfn "$dest/cyberismo-dev" "$BIN_DIR/cyberismo-dev"
for old in "$VERSIONS_DIR/$name-"*; do
  [ "$old" = "$dest" ] || rm -rf "$old"
done
echo "cyberismo-dev is now $build"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Note: $BIN_DIR is not on your PATH" ;;
esac
