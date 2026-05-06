# @cyberismo/node-clingo

Node.js bindings for the [Clingo](https://potassco.org/clingo/) answer set
solver (ASP). ESM-only. AGPL-3.0.

## Installation

```sh
npm install @cyberismo/node-clingo
# or: pnpm add @cyberismo/node-clingo
```

Prebuilt native binaries are delivered via platform-specific optional
dependencies -- no compiler or toolchain needed.

## Supported platforms

| Platform | Architecture | libc         |
| -------- | ------------ | ------------ |
| Linux    | x64          | glibc + musl |
| Linux    | arm64        | glibc + musl |
| macOS    | x64          | -            |
| macOS    | arm64        | -            |
| Windows  | x64          | -            |

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

- `solve(program, categories?)` -- ground and solve `program`, optionally
  prepended with stored programs whose `key` (or assigned category)
  appears in `categories`. Returns `{ answers, stats }`.
- `setProgram(key, program, categories?)` -- store `program` under `key`,
  optionally tagging it with one or more categories so `solve` can pull
  it in by category instead of by key.
- `removeProgram(key)` -- remove one stored program. Returns `true` if it was
  there.
- `removeAllPrograms()` -- remove every stored program in this context.
- `buildProgram(program, categories?)` -- assemble the combined program text
  without solving. Useful for debugging.

A module-level `clearCache()` clears the solve-result cache shared across all
contexts.

When a program fails to parse or solve, `solve` throws a `ClingoError` whose
`details` field carries the raw `errors`, `warnings`, and (for syntax errors)
the offending program text.

## Development

Most contributors don't need to build the native side at all. A normal
`pnpm install` pulls the published native sub-package for your platform, and
the rest of the monorepo's tests run against it.

If you _are_ working on the C++ binding, you'll need:

- CMake 3.x
- A C++20 compiler (GCC 14+, recent Clang, or MSVC)
- Python 3 (used by node-gyp)
- Node.js 22

Clingo is built from the bundled git submodule. After cloning:

```sh
git submodule update --init --recursive
```

Then:

```sh
pnpm --filter @cyberismo/node-clingo run build:native
pnpm --filter @cyberismo/node-clingo test
pnpm --filter @cyberismo/node-clingo run clean
```

## License

This package is licensed under [AGPL-3.0](./LICENSE.md). The bundled Clingo
distribution and other vendored libraries carry their own licenses; see
[`THIRD-PARTY.txt`](./THIRD-PARTY.txt) for the full list.
