# cyberismo-dev (experimental)

A single-binary build of the Cyberismo CLI, compiled with [Bun](https://bun.sh)
from the `@cyberismo/cli` package. It is a test channel next to the npm
release: it is not published, and installs as `cyberismo-dev` so it never
shadows an npm-installed `cyberismo`.

## Install

Binaries are GitHub Actions artifacts of the `Binary` workflow, so an
authenticated [GitHub CLI](https://cli.github.com) is required.

```sh
gh api repos/CyberismoCom/cyberismo/contents/tools/cli-bin/install.sh \
  -H 'Accept: application/vnd.github.raw' | sh
```

Builds are kept side by side in `~/.cyberismo-dev/versions`; the active one is
linked from `~/.local/bin/cyberismo-dev`.

## Switch builds

```sh
cyberismo-dev self install               # latest build of main
cyberismo-dev self install --branch name # latest build of a branch
cyberismo-dev self install --pr 1234     # latest build of a pull request
cyberismo-dev self install --run 987654  # a specific workflow run
```

The workflow runs on pushes to `main` and on manual dispatch
(`gh workflow run binary.yml --ref <branch>`).

## Build locally

```sh
pnpm build
pnpm --filter @cyberismo/cli-bin build:bin   # needs bun; writes dist-bin/cyberismo-dev
```

## Known differences from the npm CLI

- `CYBERISMO_EGRESS_PROXY` is not supported; the binary refuses to start when
  it is set.
- Directory listings are not sorted under Bun, so the order of some exported
  content can differ.
- Mermaid (`mmdc`) and PDF (`asciidoctor-pdf`) still need those tools on PATH.
