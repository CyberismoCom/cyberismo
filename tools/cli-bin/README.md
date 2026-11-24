# cyberismo-dev

A development tool for trying out a pull request without checking it out and
building it. CI compiles the CLI of every pull request into a single binary
with [Bun](https://bun.sh); `cyberismo-dev` is that binary. It is not released
or published, and it never shadows an npm-installed `cyberismo`.

## Install

Needs an authenticated [GitHub CLI](https://cli.github.com) (`gh auth login`),
`curl` and `unzip`. Linux x86_64 and macOS arm64 are built.

First time, which installs the newest build of `main`:

```sh
gh api repos/CyberismoCom/cyberismo/contents/tools/cli-bin/install.sh \
  -H 'Accept: application/vnd.github.raw' | sh
```

After that:

```sh
cyberismo-dev self install 1234           # switch to a pull request, or to its newest commit
cyberismo-dev self install                # switch to main, or to its newest build
cyberismo-dev self run 1234 -- validate   # run a downloaded build once, without switching
cyberismo-dev self list                   # downloaded builds
cyberismo-dev self remove 1234            # remove the builds of a pull request
cyberismo-dev self prune                  # remove all builds except the active one
```

`run` and `remove` also take `main` in place of a number.

Builds are kept in `~/.cyberismo-dev/versions`, one per pull request and one
for `main`, and `~/.local/bin/cyberismo-dev` links to the active one. Switching
to a build that is already downloaded is instant. Installing a newer commit of
a pull request, or a newer build of `main`, removes the older one.
`cyberismo-dev --version` shows the active build, as `pr-<number>-<commit>` or
`main-<commit>`.

For a pull request, the install takes the build of its newest commit. If that
build has not finished, has failed, or has expired (after 14 days), it says so
instead of installing an older one. Builds are made for pull requests into
`main` that have no merge conflicts. For `main`, the install takes the newest
finished build.

Installing a pull request means running its code, as checking it out and
building it would. That includes pull requests from forks, and nothing checks
the binary beyond it coming from this repository's CI. Read the pull request
first if you do not know its author.

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
