# Typst PDF backend — proof of concept

**What this is.** Today `cyberismo export pdf` builds one big AsciiDoc string (report
template + card bodies + macro output) and hands it to Ruby `asciidoctor-pdf`. Every layout
wish beyond the theme's knobs means generating more markup for that adapter to re-parse.
This POC keeps AsciiDoc as the *content* format and replaces the *output* layer: the same
`@asciidoctor/core` the app already ships parses each card, a ~600-line converter walks the
AST and emits deliberately dumb Typst — every character of card text inside a `#text("…")`
string literal, a dozen Typst functions in total — and `typst` (one static binary, or the
`@myriaddreamin/typst-ts-*` npm bindings, native or WASM) lays it out with a template
function (`root/theme.typ`) that plays the role of `cyberismo-theme.yml`.

Measured on 2026-09-15: all 3 158 real card files in the nine content repos convert and
compile with zero errors; 6 000 metacharacter-heavy fuzz strings with live `#eval`/`#read`/
`#import` canaries produced no escape (and a deliberately broken escaper is caught by the
harness); the cyberismo-docs export renders in ~1 s. Typst additionally jails all file reads
to `--root`. Side-by-side PDFs against the current pipeline exist outside this repo; ask Samu.

Evaluation code. Not production code, no copyright headers, not wired into the repo.
Paths are resolved relative to this directory inside the monorepo (`tools/assets` for the
logo and fonts, `tools/app/node_modules` for `@asciidoctor/core`).

## Layout

| file | what it is |
| --- | --- |
| `typst-converter.mjs` | the converter. `tstr()` (the Typst string-literal escaper) is the security boundary; `typst()` re-parses Asciidoctor's substituted inline string through sentinel markers; `resolveXrefs()` degrades dangling/duplicate xrefs to plain text. |
| `render.mjs` | driver: sanitize → strip Cyberismo macros → `convert({backend:'typst', safe:'secure'})` → resolve xrefs. Also the image sink (data-URI images only) and the logo copy. |
| `root/theme.typ` | the Typst equivalent of `cyberismo-theme.yml`. **Trusted code** — never derived from card content. |
| `root/fuzz-theme.typ` | same exported names, 400 cm-wide page, so the fuzz harness measures escaping rather than page-overflow clipping. |
| `proto.mjs` | demo document exercising most node types → `root/main.typ`. |
| `corpus.mjs` | convert every card `index.adoc` in the content repos, one `.typ` per card. |
| `batch.mjs` | concatenate the whole corpus into one document, the shape `cyberismo export pdf` produces. |
| `fuzz.mjs` | ≥5 000 random metacharacter-heavy strings through paragraph/heading/list/table/link/admonition; compiles and checks every emitted literal survives into the PDF. |
| `negative-control.mjs` | proves the fuzz harness detects a broken escaper (unescaped interpolation). |
| `patho.mjs` | pathological inputs: 10k-row table, 5 MB paragraph, 200-deep lists, 500 images. |

## Setup

```bash
pnpm install                                   # at the repo root, once
cd docs/poc/typst-pdf
ln -sfn ../../../tools/app/node_modules node_modules   # for @asciidoctor/core 4.0.11
export F=$PWD/../../../tools/assets/src/static/pdf-themes/fonts
```

Needs Node 24 and `typst` 0.14.x on `PATH`. The theme uses Liberation Mono as the stand-in
for asciidoctor-pdf's Courier and Liberation Sans as glyph fallback; add a second
`--font-path` pointing at them (Fedora: `/usr/share/fonts/liberation-*-fonts`, Debian:
`/usr/share/fonts/truetype/liberation`) or let Typst fall back to its bundled fonts.

## Run

```bash
# demo
node proto.mjs "$PWD" "$(base64 -w0 some.png)"
cd root && typst compile -f pdf --ignore-system-fonts --root "$PWD" --font-path $F main.typ out.pdf
pdftotext -layout out.pdf - | head -40

# corpus (write the .typ somewhere outside the docs tree)
node corpus.mjs /tmp/typst-corpus ~/cyberismo/isms ~/cyberismo/cyberismo-docs ...
cd /tmp/typst-corpus/typ && for f in c*.typ; do
  typst compile -f pdf --no-pdf-tags --ignore-system-fonts --root "$PWD" --font-path $F "$f" /dev/null || echo "FAIL $f"
done

# whole corpus as one document
node batch.mjs /tmp/typst-batch ~/cyberismo/isms ...
cd /tmp/typst-batch && typst compile -f pdf --ignore-system-fonts --root "$PWD" --font-path $F corpus.typ corpus.pdf

# fuzz (add `unshare -n -r` in front to prove no package fetch happens)
node fuzz.mjs /tmp/typst-fuzz 6000 250
node negative-control.mjs /tmp/typst-neg

# pathological
node patho.mjs /tmp/typst-patho table10k     # then compile /tmp/typst-patho/table10k.typ
```

## What it covers

All 38 `convert_*` node types of the core's HTML5 converter have a method. Fidelity
varies — see the inventory table in the evaluation. Known gaps:

* `stem` (asciimath/latexmath) renders the equation source verbatim in a grey box.
* `pass` (raw backend markup) is dropped.
* `audio`/`video` render a placeholder.
* Images are embedded **only** from `data:` URIs, which is what Cyberismo's macro
  layer produces in static/PDF mode. Anything else becomes a visible placeholder.
* List nesting is not capped, so >31 levels hits Typst's show-rule depth limit.
* Table column widths use `colpcwidth`; `autowidth`, `stripes`, `valign`, per-cell
  background colour and the `frame`/`grid` variants are approximated.

## Preprocessing the driver applies

1. `sanitizeSource()` — strips U+E000..U+E002 (the marker sentinels) and stray C0
   controls. Robustness, not the last line of defence.
2. `stripMacros()` — removes `{{#x}}…{{/x}}` and `{{x}}`. These are **not** AsciiDoc:
   in production the macro layer evaluates them in Node before Asciidoctor runs.
   For the corpus run over raw card sources a regex stands in for that layer.
   46 % of corpus cards contain them; they are 13.6 % of corpus bytes.
