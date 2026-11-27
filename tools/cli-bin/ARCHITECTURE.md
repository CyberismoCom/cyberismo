# cli-bin architecture

A development tool, not a product: it compiles `@cyberismo/cli` into the
single `cyberismo-dev` binary with Bun, so a pull request can be tried without
checking it out. It is private and never published. See `README.md` for use.

## Structure

| File                | What it is                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/build.ts`      | The build script (`build:bin`). Its plugins patch the few dependencies that read files by path at run time.       |
| `src/gen-assets.ts` | Generates `embedded-assets.gen.ts`, which embeds the assets' static files and the built frontend.                 |
| `src/main.ts`       | Entry point of the binary: extracts the embedded files, then runs the CLI program with the `self` commands added. |
| `src/self.ts`       | `self install`, `run`, `list`, `remove`, `prune`.                                                                 |
| `install.sh`        | Downloads a pull request's binary from CI. Also embedded in the binary and run by `self install`.                 |

## Dependencies

- May use `@cyberismo/cli` (its default export, the Commander program) and nothing else from the workspace.
- No package depends on this one. `pnpm build` and `pnpm test` do not need Bun; only `build:bin` does.

## Key concepts and invariants

- The CLI is not forked: the binary runs the same program object as `cyberismo`. Behaviour belongs in `tools/cli`, not here.
- Code that reads files by path cannot see inside the binary. The two places that do get a directory through an internal environment variable that `main.ts` sets: `CYBERISMO_STATIC_DIR` (`@cyberismo/assets`) and `CYBERISMO_PUBLIC_DIR` (`@cyberismo/backend`). They are not a public interface, and `self run` leaves them out so the build it starts uses its own files.
- The extracted files live next to the binary, so removing a build removes them.
- `install.sh` and `self.ts` share one layout: `~/.cyberismo-dev/versions/<build>/cyberismo-dev`, where `<build>` is `pr-<number>-<commit>` or `main-<commit>`.
- Built by `.github/workflows/binary.yml`; its smoke test is the only automated check.
