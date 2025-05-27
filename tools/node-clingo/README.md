# @cyberismocom/node-clingo

Node.js native bindings for the [Clingo](https://potassco.org/clingo/) answer set solver (ASP).

---

## Installation

To install, run `pnpm install`:

- On install, a script attempts to download the correct prebuilt binary for your platform from GitHub Releases.
- If no prebuild is available, it will attempt a local build (requires Clingo and build tools).

---

## Usage

```js
import { solve, setBaseProgram, clearBaseProgram } from '@cyberismo/node-clingo';

// Solve a simple logic program
const result = await solve('a. b. c(1). c(2).');
console.log(result.answers); // [ 'a b c(1) c(2)' ]

// Set a base program (persisted across solves)
setBaseProgram('base(1).');
const result2 = await solve('derived :- base(X).');
console.log(result2.answers); // [ 'base(1) derived' ]

// Named base programs
setBaseProgram('type(query).', 'query');
setBaseProgram('type(graph).', 'graph');
const result3 = await solve('valid :- type(query).', 'query');

// Combine multiple base programs
setBaseProgram('color(red).', 'colors');
setBaseProgram('shape(circle).', 'shapes');
setBaseProgram('size(large).', 'sizes');
const result4 = await solve('valid :- color(X), shape(Y), size(Z).', [
  'colors', 'shapes', 'sizes',
]);

// Clear base programs
default: clearBaseProgram(); // clears all
clearBaseProgram('query'); // clears named
```

---

## API

### `async solve(program: string, basePrograms?: string | string[]): Promise<{ answers: string[], executionTime: number }>`

Solves a logic program, optionally combining with one or more base programs. Returns all answer sets and execution time (μs).

### `setBaseProgram(program: string, key?: string)`

Stores a base program under a key (default: 'default'). Used in subsequent solves.

### `clearBaseProgram(key?: string)`

Removes a named base program, or all if no key is given.

---

## Prebuilds & Supported Platforms

Prebuilt binaries are provided for:

- **Linux x64** (glibc & musl/Alpine)
- **Linux arm64** (glibc & musl/Alpine)
- **macOS x64**
- **macOS arm64**
- **Windows x64**

Prebuilds are downloaded automatically on install. If a prebuild is not available, a local build is attempted (requires Clingo and build tools).

### Prebuild details

- Prebuilds are stored in `prebuilds/{platform}-{arch}/`.
- Linux glibc and musl (Alpine) builds are distinguished by `.glibc.node` and `.musl.node` suffixes.
- See `.github/workflows/prebuild.yml` for the full CI build matrix and packaging logic.

---

## Building Locally

If you need to build from source (e.g., for unsupported platforms):

### Prerequisites

- Node.js 22
- Clingo (must be installed and available in your system path)
- C++20 compiler (GCC 14+ recommended), should also support older versions
- Python 3, make, and build tools

### Tips for building

**Windows**:
Make sure you installed the build tools when you installed nodeJS.
Install clingo using conda with the environment.yml available at the root of this repo

```
conda env create -f environment.yml

```

**MacOS**:
XCode tools should contain all requirements. Install clingo using homebrew:
`brew install clingo`

**Linux**:
sudo apt install build-essentials make python3 gringo

### Build steps

```sh
pnpm install
pnpm run build-prebuildify
```

#### Alpine/musl builds

See `alpine.Dockerfile` for the musl/Alpine build process (used in CI for static builds).

---

## CI/CD & Prebuild Workflow

- See `.github/workflows/prebuild.yml` for the full automation:
  - Detects version changes
  - Builds prebuilds for all platforms (including musl via Docker)
  - Uploads prebuilds as GitHub release assets
  - Installs prebuilds automatically on `pnpm install` via `scripts/download-prebuild.js`

---
