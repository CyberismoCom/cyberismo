# cyberismo-dev

A development tool for trying out a pull request without checking it out and
building it. CI compiles the CLI of every pull request into a single binary
with [Bun](https://bun.sh); `cyberismo-dev` is that binary. It is not released
or published, and it never shadows an npm-installed `cyberismo`.

## Install

Needs an authenticated [GitHub CLI](https://cli.github.com) (`gh auth login`),
`curl` and `unzip`. Linux x86_64 and macOS arm64 are built.

First time, with the number of any open pull request:

```sh
gh api repos/CyberismoCom/cyberismo/contents/tools/cli-bin/install.sh \
  -H 'Accept: application/vnd.github.raw' | sh -s -- 1234
```

After that, to switch to another pull request or to its newest commit:

```sh
cyberismo-dev self install 1234
```

The binary is installed as `~/.local/bin/cyberismo-dev` (set
`CYBERISMO_DEV_BIN_DIR` to change the directory) and replaced on each install.
`cyberismo-dev --version` shows which build it is, as `pr-<number>-<commit>`.

The install takes the build of the pull request's newest commit. If that build
has not finished, has failed, or has expired (after 14 days), it says so
instead of installing an older one.

## Build locally

```sh
pnpm build
pnpm --filter @cyberismo/cli-bin build:bin   # needs bun; writes dist-bin/cyberismo-dev
```

## Differences from the npm CLI

- `CYBERISMO_EGRESS_PROXY` is not supported; the binary refuses to start when
  it is set.
- Directory listings are not sorted under Bun, so the order of some exported
  content can differ.
- Mermaid (`mmdc`) and PDF (`asciidoctor-pdf`) still need those tools on PATH.
