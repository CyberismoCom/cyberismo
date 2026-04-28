# @cyberismo/node-clingo

Node.js bindings for the [Clingo](https://potassco.org/clingo/) answer set
solver (ASP). ESM-only. AGPL-3.0.

## Installation

```sh
npm install @cyberismo/node-clingo
# or: pnpm add @cyberismo/node-clingo
```

The umbrella package is a thin JavaScript shim. The native binary ships in a
platform-specific sub-package, and your package manager picks the right one
automatically via `os` / `cpu` / `libc` filters on `optionalDependencies`.

There is **no postinstall step**, no compile, and no toolchain required on
the install machine.

## Supported platforms

| Platform | Architecture | libc         |
| -------- | ------------ | ------------ |
| Linux    | x64          | glibc + musl |
| Linux    | arm64        | glibc + musl |
| macOS    | x64          | —            |
| macOS    | arm64        | —            |
| Windows  | x64          | —            |

The `libc` filter that distinguishes glibc from musl on Linux requires
**npm 10+, pnpm 8+, or Yarn Berry**. Yarn Classic ignores the filter and may
install a non-deterministic Linux variant; if you're on Yarn Classic and run
into ABI errors on Alpine, upgrade your package manager.

## Usage

```ts
import { ClingoContext } from '@cyberismo/node-clingo';

const ctx = new ClingoContext();

// Solve a one-shot program.
const result = await ctx.solve('a. b :- a.');
console.log(result.answers); // [ 'a\nb' ]

// Stash a reusable program under a key, then reference it from later solves.
ctx.setProgram('facts', 'person(alice). person(bob).');
const friends = await ctx.solve(
  'friend(X,Y) :- person(X), person(Y), X != Y.',
  ['facts'],
);

// Drop a stored program when you're done with it.
ctx.removeProgram('facts');
```

`ClingoContext` exposes:

- `solve(program, categories?)` — ground and solve `program`, optionally
  prepended with stored programs whose `key` (or assigned category)
  appears in `categories`. Returns `{ answers, stats }`.
- `setProgram(key, program, categories?)` — store `program` under `key`,
  optionally tagging it with one or more categories so `solve` can pull
  it in by category instead of by key.
- `removeProgram(key)` — remove one stored program. Returns `true` if it was
  there.
- `removeAllPrograms()` — remove every stored program in this context.
- `buildProgram(program, categories?)` — assemble the combined program text
  without solving. Useful for debugging.

A module-level `clearCache()` clears the solve-result cache shared across all
contexts.

When a program fails to parse or solve, `solve` throws a `ClingoError` whose
`details` field carries the raw `errors`, `warnings`, and (for syntax errors)
the offending program text.

## How the binary is loaded

`lib/index.ts` resolves the native binary the first time the module is
imported, in this order:

1. **`build/Release/node-clingo.node`** relative to the package root, if it
   exists. This is the development path: when you're working in this
   monorepo and run `pnpm build:native`, the freshly compiled binary is
   picked up automatically.
2. The matching **optional-dependency sub-package**
   (`@cyberismo/node-clingo-<platform>-<arch>[-<libc>]`). This is the path
   end users hit — `build/` is gitignored and never shipped in the published
   package.

If neither is present, the loader throws an error that begins:

```
@cyberismo/node-clingo: no prebuilt binary installed for <platform>-<arch>.
Tried: <list of candidate package names>.
```

The most common cause is installing with `--no-optional` or
`--omit=optional`, which skips the native sub-package entirely — reinstall
without that flag. If your platform isn't in the supported matrix above,
please [open an issue](https://github.com/CyberismoCom/cyberismo/issues).

## Development

Most contributors don't need to build the native side at all. A normal
`pnpm install` pulls the published native sub-package for your platform, and
the rest of the monorepo's tests run against it.

If you _are_ working on the C++ binding, you'll need:

- CMake 3.x
- A C++20 compiler (GCC 14+, recent Clang, or MSVC via the Node.js installer
  on Windows)
- Python 3 (used by node-gyp)
- Node.js 22

Clingo itself is built from the bundled git submodule — no system Clingo
required. After cloning, initialize the submodule:

```sh
git submodule update --init --recursive
```

Then, from the repo root:

```sh
# Compile the bundled clingo and link the addon. Produces
# tools/node-clingo/build/Release/node-clingo.node, which the loader prefers.
pnpm --filter @cyberismo/node-clingo run build:native

# Run the test suite against the local build.
pnpm --filter @cyberismo/node-clingo test

# Wipe build outputs.
pnpm --filter @cyberismo/node-clingo run clean
```

Platform-specific notes:

- **Linux**: `sudo apt install build-essential cmake python3` covers the
  basics on Debian/Ubuntu.
- **macOS**: install Xcode Command Line Tools, then `brew install cmake`.
- **Windows**: install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
  with the "Desktop development with C++" workload (provides MSVC), plus
  [CMake](https://cmake.org/download/).

## License

This package is licensed under [AGPL-3.0](./LICENSE.md). The bundled Clingo
distribution and other vendored libraries carry their own licenses; see
[`THIRD-PARTY.txt`](./THIRD-PARTY.txt) for the full list.
