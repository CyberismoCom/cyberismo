// Fuzz harness theme: same exported names as theme.typ, but a very wide page so
// that long unbreakable tokens cannot overflow the page box and be clipped by
// the PDF viewer. This isolates the escaper from layout behaviour.

#let brand = rgb("#ff530f")
#let raw-inline(body) = text(font: ("DejaVu Sans Mono",), body)
#let cy-deadxref(body) = body
#let xref(id, body) = body
#let cy-dropped(what) = [[#what omitted]]
#let cy-admonition(label, body) = block(width: 100%)[#label #body]
#let cy-meta(..rows) = table(columns: (auto, 1fr), stroke: none, ..rows)

#let cyberismo(title: "", revnumber: "", revdate: "", revremark: "", numbered: false, book: false, logo: none, body) = {
  set page(width: 400cm, height: 60cm, margin: 1cm, numbering: none)
  set text(font: ("Plus Jakarta Sans", "Libertinus Serif"), size: 9pt, hyphenate: false)
  set par(justify: false)
  set heading(numbering: none)
  show heading: it => block(above: 0.6em, below: 0.4em)[#text(size: 11pt, weight: "bold")[#it]]
  title
  body
}
