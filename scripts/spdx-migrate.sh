#!/bin/bash

# SPDX-FileCopyrightText: Cyberismo Ltd and contributors
# SPDX-License-Identifier: AGPL-3.0-only

# Replaces the legacy AGPL header blocks with the two-line SPDX header and adds
# the header to every commentable authored file that lacks one. Idempotent:
# run it from the repository root; a second run changes nothing. Needs pnpm
# dependencies installed and uv (for reuse).

set -euo pipefail

# 1. TS/JS in packages: the ESLint rule's fixer.
pnpm -r run lint --fix

# 2. Drop the legacy AGPL block where lint does not reach (C++, configs).
git ls-files -z '*.cc' '*.h' '*.js' '*.mjs' '*.ts' '*.tsx' \
    ':!:tools/node-clingo/external' \
  | xargs -0 perl -0pi -e 's{\A/\*\*\n  Cyberismo\n.*?\*/\n}{}s'

# 3. Everything `reuse lint` still reports as unannotated, in the comment
#    style of its type.
uvx --from reuse==6.2.0 reuse lint --json | python3 -c '
import json, os, subprocess, sys

d = json.load(sys.stdin)["non_compliant"]
files = sorted(set(d["missing_copyright_info"]) | set(d["missing_licensing_info"]))

def style(f):
    with open(f, errors="replace") as fh:
        first = fh.readline()
    name = os.path.basename(f)
    if f.endswith((".cc", ".h")) or (first.startswith("#!") and "node" in first):
        return "cppsingle"
    if f.endswith(".lp"):
        return "tex"
    if f.endswith(".html"):
        return "html"
    if (
        f.endswith((".gyp", ".cmake", ".sh", ".yml", ".yaml", ".example"))
        or name in ("Dockerfile", ".clang-format", ".gitmodules", "CODEOWNERS")
        or name.startswith(".") and name.endswith("ignore")
        or name.endswith("-revs")
        or first.startswith("#!")
    ):
        return "python"
    return None  # reuse picks the style from the extension

groups = {}
for f in files:
    groups.setdefault(style(f), []).append(f)
for s, fs in groups.items():
    cmd = ["uvx", "--from", "reuse==6.2.0", "reuse", "annotate",
           "--template", "cyberismo", "--exclude-year",
           "--copyright", "Cyberismo Ltd and contributors",
           "--license", "AGPL-3.0-only"]
    if s:
        cmd += ["--style", s]
    subprocess.run(cmd + fs, check=True)
'
