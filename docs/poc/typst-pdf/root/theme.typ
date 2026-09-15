// Cyberismo Typst theme — proof of concept.
//
// This file is the Typst equivalent of tools/assets/src/static/pdf-themes/cyberismo-theme.yml.
// It is TRUSTED code: it is shipped with the product, never derived from card content.
// Everything that comes from a card reaches this file only as string literals.
//
// Metrics follow asciidoctor-pdf's default theme, which cyberismo-theme.yml extends:
// A4, margins 0.5in top / 0.67in sides and bottom, 10.5pt base, justified, #333 text,
// h2 22pt / h3 18pt / h4 13pt (doctype book: adoc `==` is Typst level 1), numbering
// with a trailing dot ("1.", "1.1."), code in Courier at ceil(10.5) = 11pt.
//
// Font files, mirroring the yml's font catalog:
//   normal      -> PlusJakartaSans-Medium   (the yml maps "normal" to the 500 cut)
//   italic      -> PlusJakartaSans-Italic   (the 400 italic, not MediumItalic)
//   bold        -> PlusJakartaSans-Bold
//   bold_italic -> PlusJakartaSans-BoldItalic
//   code        -> Liberation Mono (metric-compatible stand-in for the PDF base-14 Courier)
//   fallback    -> Liberation Sans, DejaVu Sans (glyphs Plus Jakarta lacks; SVG text)

#let brand = rgb("#ff530f")
#let ink = rgb("#333333")
#let body-font = ("Plus Jakarta Sans", "Liberation Sans")
#let mono-font = ("Liberation Mono", "DejaVu Sans Mono")
#let codespan-color = rgb("#b12146")

// ── helpers used by the converter ────────────────────────────────────────────

#let raw-inline(body) = text(font: mono-font, weight: "regular", fill: codespan-color, body)

// Replaced by resolveXrefs() with #link(label(..)) when the target exists.
#let cy-deadxref(body) = body
#let xref(id, body) = body

#let cy-dropped(what) = text(fill: rgb("#b00000"), weight: "regular", style: "italic")[[#what omitted]]

// Admonition: asciidoctor-pdf's label-column layout with the brand accent — a
// shaded card, orange left bar and label, rule between label and body. Kept on
// one page so the label cannot strand.
#let cy-admonition(label, body) = block(
  width: 100%,
  breakable: false,
  above: 1.2em,
  below: 1.2em,
  fill: luma(246),
  radius: (right: 3pt),
  stroke: (left: 3pt + brand),
)[
  #grid(
    columns: (5.5em, 1fr),
    column-gutter: 0pt,
    align: (center + horizon, left + horizon),
    stroke: (x, y) => if x == 0 { (right: 0.5pt + brand.lighten(40%)) } else { none },
    inset: (x: 0.9em, y: 0.7em),
    text(weight: "bold", size: 0.85em, fill: brand)[#upper(label)],
    body,
  )
]

// The `.cyberismo-meta` metadata table: a borderless two-column key/value grid.
#let cy-meta(..rows) = block(width: 100%, above: 0.6em, below: 1.2em)[
  #table(
    columns: (auto, 1fr),
    stroke: none,
    inset: (x: 4pt, y: 3pt),
    ..rows
  )
]

// ── document template ────────────────────────────────────────────────────────

#let cyberismo(
  title: "",
  author: "",
  revnumber: "",
  revdate: "",
  revremark: "",
  numbered: false,
  book: false,
  logo: none,
  body,
) = {
  set document(title: title, author: if author == "" { () } else { (author,) })
  // Medium body at a 14.7pt line pitch, as asciidoctor-pdf renders it.
  set text(font: body-font, size: 10.5pt, weight: "medium", fill: ink, hyphenate: false, lang: "en")
  set par(justify: true, leading: 0.65em, spacing: 1.2em)
  // strong/emph are rendered directly so weights map to the catalog's four files
  // instead of Typst's relative +300 (which would reach ExtraBold from a 500 base).
  show strong: it => text(weight: "bold", it.body)
  show emph: it => context {
    let w = text.weight
    let bold = w == "bold" or (type(w) == int and w >= 700)
    text(weight: if bold { "bold" } else { "regular" }, style: "italic", it.body)
  }
  // chapter-signifier off: plain "1.", "1.1.", no "Chapter" prefix.
  set heading(numbering: if numbered { "1.1.1.1.1." } else { none })
  show heading: it => {
    let size = (22pt, 18pt, 13pt, 10.5pt, 9pt, 9pt).at(calc.min(it.level, 6) - 1)
    block(above: if it.level == 1 { 0.6em } else { 1.4em }, below: 0.9em)[
      #set par(justify: false)
      #set text(font: body-font, weight: "bold", size: size)
      #if it.numbering != none [#counter(heading).display(it.numbering)#h(0.5em)]#it.body
    ]
  }
  show raw: set text(font: mono-font, weight: "regular")
  show raw.where(block: true): it => block(
    width: 100%,
    fill: rgb("#f5f5f5"),
    inset: 11pt,
    radius: 4pt,
    stroke: 0.75pt + rgb("#cccccc"),
  )[
    #set par(leading: 0.45em)
    #set text(size: 11pt, fill: ink)
    #it
  ]
  show raw.where(block: false): set text(fill: codespan-color)
  show link: it => text(fill: rgb("#0b62c4"), it)
  // doctype=book: each card (level-1 section) starts on a new page, matching
  // asciidoctor-pdf's chapter break.
  show heading.where(level: 1): it => { if book { pagebreak(weak: true) }; it }

  // ── title page: logo top right, title block right-aligned in the lower half,
  //    no running content, no page number (title-page.align: right in the yml) ──
  page(paper: "a4", margin: (top: 1.27cm, bottom: 1.7cm, x: 1.7cm), header: none, footer: none, numbering: none)[
    #v(2.2cm)
    #if logo != none { align(right)[#image(logo, width: 6.35cm)] }
    #v(1fr)
    #align(right)[
      #text(size: 27pt, weight: "bold", fill: brand)[#title]
      #if author != "" [#v(0.2em) #text(size: 13pt)[#author]]
      #if revnumber != "" or revdate != "" or revremark != "" [
        #v(0.1em)
        #text(size: 9pt, fill: luma(80))[
          #if revnumber != "" [Version #revnumber]
          #if revnumber != "" and revdate != "" [, ]
          #if revdate != "" [#revdate]
          #if revremark != "" [: #revremark]
        ]
      ]
    ]
    #v(1.4fr)
  ]

  // ── body: running content starts here (yml: running-content.start-at: toc) ──
  set page(
    paper: "a4",
    margin: (top: 2.1cm, bottom: 2.0cm, x: 1.7cm),
    header-ascent: 25%,
    footer-descent: 30%,
    numbering: "1",
    header: if logo != none { image(logo, width: 1.7cm) } else { text(size: 8pt, fill: luma(110))[Cyberismo] },
    footer: {
      line(length: 100%, stroke: 0.25pt + luma(190))
      v(-4pt)
      context align(center)[#text(size: 8.5pt, fill: luma(110))[#counter(page).display("1")]]
    },
  )
  counter(page).update(1)
  body
}
