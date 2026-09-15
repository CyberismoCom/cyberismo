/**
 * Demo: convert a document that exercises most AsciiDoc node types and write
 * root/main.typ. See README.md.
 *
 *   node proto.mjs "$PWD" "$(base64 -w0 some.png)"
 */
import { writeFileSync } from 'node:fs';
import { makeRenderer } from './render.mjs';

const S = process.argv[2] ?? process.cwd();
const PNG = process.argv[3] ?? '';

const doc = `= Demo report
:doctype: book
:toc: macro
:numbered:
:revnumber: 1.4.0
:revdate: 2026-09-15
:revremark: evaluation build
:!chapter-signifier:
:toclevels: 5

toc::[]

== Section "one" with \\ backslash

[.cyberismo-meta-wrapper]
--
[.cyberismo-meta]
[cols="1,1"]
[frame=none]
[grid=none]
|===
|Card key|DEMO_1
|Status|Draft
|Card type|base/cardTypes/page
|Labels|alpha, beta
|===
--

A paragraph with *bold*, _em_, \`code\`, #mark#, ^sup^, ~sub~, a https://example.org[link],
a footnote.footnote:[The note body with *bold*.], kbd:[Ctrl+C], btn:[OK], menu:File[Save As],
and hostile text: #read("/etc/passwd") ] #import "@preview/x:1.0.0": * #eval("1+1")
\\#include "x.typ" -- and "curly" quotes, (C) (R) (TM), -> => <- <=, ellipsis...

[[inline-anchor]]An anchored paragraph. See <<inline-anchor>> and <<_section_two,Section Two>>
and <<does-not-exist>>.

NOTE: An admonition with *nested* #strong[code].

WARNING: Second admonition.

.A titled list
* item one
* item two with a nested list
** nested a
** nested b

[start=3]
. numbered three
. numbered four

* [x] checked task
* [ ] unchecked task

Term 1:: Definition one
Term 2:: Definition two with *bold*

.Listing with a title
[source,ruby]
----
puts "hi" #read("x")
----

....
literal block #read("/etc/hostname")
....

[quote,Anon,Somewhere]
____
A quote block.
____

[verse]
____
Line one
Line two
____

.A table
[cols="1,2",options="header"]
|===
| Key | Value
| Card key | DEMO_1
| Status \\| escaped | Draft #read("x")
|===

****
A sidebar block.
****

====
An example block.
====

'''

<<<

include::/etc/hostname[]

image::../outside/pic.png[]

image::data:image/png;base64,${PNG}[Demo image]

Inline image: image:data:image/png;base64,${PNG}[alt text]

== Section two

Done.
`;

const r = makeRenderer(`${S}/root`);
const out = await r.render(doc);
writeFileSync(`${S}/root/main.typ`, out);
console.log(`wrote ${S}/root/main.typ (${out.length} bytes)`);
if (r.unhandled.size) console.log('unhandled:', Object.fromEntries(r.unhandled));
