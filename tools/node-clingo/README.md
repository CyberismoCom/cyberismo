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
import {
  solve,
  setProgram,
  removeProgram,
  removeAllPrograms,
} from '@cyberismo/node-clingo';

// Solve a simple logic program
const result = await solve('a. b. c(1). c(2).');
console.log(result.answers); // [ 'a\nb\nc(1)\nc(2)' ]

// Set a base program (persisted across solves)
setProgram('base', 'base(1).');
const result2 = await solve('derived :- base(X).', ['base']);
console.log(result2.answers); // [ 'base(1)\nderived' ]

// Named base programs
setProgram('query', 'type(query).');
setProgram('graph', 'type(graph).');
const result3 = await solve('valid :- type(query).', ['query']);

// Combine multiple base programs
setProgram('colors', 'color(red).');
setProgram('shapes', 'shape(circle).');
setProgram('sizes', 'size(large).');
const result4 = await solve('valid :- color(X), shape(Y), size(Z).', [
  'colors',
  'shapes',
  'sizes',
]);

// Programs with categories for easier management
setProgram('base-facts', 'person(alice). person(bob).', ['facts']);
setProgram('base-rules', 'friend(X,Y) :- person(X), person(Y), X != Y.', [
  'rules',
]);
const result5 = await solve('happy(X) :- friend(X,Y).', ['facts', 'rules']);

// Remove programs
removeProgram('query'); // removes specific program
removeAllPrograms(); // clears all programs
```

---

## API

### `async solve(program: string, categories?: string[]): Promise<ClingoResult>`

Solves a logic program, optionally combining with one or more stored programs referenced by key or category. Returns all answer sets, execution time (μs), and any errors/warnings.

**Returns:** `ClingoResult` object with:

- `answers: string[]` - Array of answer sets (each answer set as a single string with atoms separated by newlines)
- `errors: string[]` - Any error messages from Clingo
- `warnings: string[]` - Any warning messages from Clingo
- `stats: { glue: number; add: number; ground: number; solve: number }` - Microsecond timings for each phase:
  - `glue`: building/expanding referenced base programs
  - `add`: adding parts (base and main) to Clingo
  - `ground`: grounding all parts
  - `solve`: solving and collecting models


### `setProgram(key: string, program: string, categories?: string[])`

Stores a program under a key. Optionally assign categories for easier program management.

**Parameters:**

- `key: string` - Unique identifier for this program
- `program: string` - The logic program content
- `categories?: string[]` - Optional array of category names to associate with this program

### `removeProgram(key: string): boolean`

Removes a stored program by key.

**Returns:** `true` if the program was found and removed, `false` if it didn't exist.

### `removeAllPrograms()`

Removes all stored programs.

### Error Handling

The `solve` function may throw a `ClingoError` when parsing or solving fails. This error contains additional details:

```js
import { solve, ClingoError } from '@cyberismo/node-clingo';

try {
  const result = await solve('invalid syntax here');
} catch (error) {
  if (error instanceof ClingoError) {
    console.log('Clingo error:', error.message);
    console.log('Errors:', error.details.errors);
    console.log('Warnings:', error.details.warnings);
    if (error.details.program) {
      console.log('Failed program:', error.details.program);
    }
  }
}
```

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
