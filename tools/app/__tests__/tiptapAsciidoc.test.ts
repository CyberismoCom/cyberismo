/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect } from 'vitest';
import { parseAsciidoc } from '../src/lib/tiptap/asciidocParser';
import { serializeAsciidoc } from '../src/lib/tiptap/asciidocSerializer';

describe('AsciiDoc Parser', () => {
  describe('Cyberismo Macros', () => {
    it('should parse and preserve report macro exactly', () => {
      const input = `{{#report}}
query: *
format: table
{{/report}}`;

      const doc = parseAsciidoc(input);

      // Find the macro block
      const macroBlock = doc.content?.find(node => node.type === 'macroBlock');
      expect(macroBlock).toBeDefined();
      expect(macroBlock?.attrs?.macroName).toBe('report');
      expect(macroBlock?.attrs?.source).toBe(input);
    });

    it('should serialize report macro without modification', () => {
      const input = `{{#report}}
query: *
format: table
{{/report}}`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output.trim()).toBe(input);
    });

    it('should parse and preserve graph macro exactly', () => {
      const input = `{{#graph}}
view: dependency-graph
model: default
{{/graph}}`;

      const doc = parseAsciidoc(input);
      const macroBlock = doc.content?.find(node => node.type === 'macroBlock');
      expect(macroBlock).toBeDefined();
      expect(macroBlock?.attrs?.macroName).toBe('graph');
      expect(macroBlock?.attrs?.source).toBe(input);
    });

    it('should serialize graph macro without modification', () => {
      const input = `{{#graph}}
view: dependency-graph
model: default
{{/graph}}`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output.trim()).toBe(input);
    });

    it('should preserve macros with complex content', () => {
      const input = `{{#createCards}}
template: card/requirement
buttonLabel: Create Requirement
{{/createCards}}`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output.trim()).toBe(input);
    });

    it('should handle multiple macros in document', () => {
      const input = `= Document Title

Some intro text.

{{#report}}
query: *
{{/report}}

More text between macros.

{{#graph}}
view: my-view
{{/graph}}

Final paragraph.`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      // Macros should be preserved
      expect(output).toContain('{{#report}}');
      expect(output).toContain('{{/report}}');
      expect(output).toContain('{{#graph}}');
      expect(output).toContain('{{/graph}}');
    });
  });

  describe('Basic AsciiDoc Syntax', () => {
    it('should parse headings', () => {
      const input = `= Level 1 Heading

== Level 2 Heading

=== Level 3 Heading`;

      const doc = parseAsciidoc(input);
      const headings = doc.content?.filter(node => node.type === 'heading');

      expect(headings?.length).toBe(3);
      expect(headings?.[0].attrs?.level).toBe(1);
      expect(headings?.[1].attrs?.level).toBe(2);
      expect(headings?.[2].attrs?.level).toBe(3);
    });

    it('should parse Markdown-style headings', () => {
      const input = `# Level 1 Heading

## Level 2 Heading

### Level 3 Heading`;

      const doc = parseAsciidoc(input);
      const headings = doc.content?.filter(node => node.type === 'heading');

      expect(headings?.length).toBe(3);
      expect(headings?.[0].attrs?.level).toBe(1);
      expect(headings?.[1].attrs?.level).toBe(2);
      expect(headings?.[2].attrs?.level).toBe(3);
    });

    it('should serialize headings with correct syntax', () => {
      const input = `= Level 1 Heading

== Level 2 Heading`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('= Level 1 Heading');
      expect(output).toContain('== Level 2 Heading');
    });

    it('should parse unordered lists', () => {
      const input = `* Item 1
* Item 2
* Item 3`;

      const doc = parseAsciidoc(input);
      const list = doc.content?.find(node => node.type === 'bulletList');

      expect(list).toBeDefined();
      expect(list?.content?.length).toBe(3);
    });

    it('should serialize unordered lists', () => {
      const input = `* Item 1
* Item 2`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('* Item 1');
      expect(output).toContain('* Item 2');
    });

    it('should parse ordered lists', () => {
      const input = `. First item
. Second item
. Third item`;

      const doc = parseAsciidoc(input);
      const list = doc.content?.find(node => node.type === 'orderedList');

      expect(list).toBeDefined();
      expect(list?.content?.length).toBe(3);
    });

    it('should serialize ordered lists', () => {
      const input = `. First item
. Second item`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('. First item');
      expect(output).toContain('. Second item');
    });

    it('should parse bold text', () => {
      const input = `This is *bold* text.`;

      const doc = parseAsciidoc(input);
      const paragraph = doc.content?.find(node => node.type === 'paragraph');
      const boldText = paragraph?.content?.find(
        node => node.marks?.some(m => m.type === 'bold')
      );

      expect(boldText).toBeDefined();
      expect(boldText?.text).toBe('bold');
    });

    it('should serialize bold text', () => {
      const input = `This is *bold* text.`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('*bold*');
    });

    it('should parse italic text', () => {
      const input = `This is _italic_ text.`;

      const doc = parseAsciidoc(input);
      const paragraph = doc.content?.find(node => node.type === 'paragraph');
      const italicText = paragraph?.content?.find(
        node => node.marks?.some(m => m.type === 'italic')
      );

      expect(italicText).toBeDefined();
      expect(italicText?.text).toBe('italic');
    });

    it('should serialize italic text', () => {
      const input = `This is _italic_ text.`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('_italic_');
    });

    it('should parse code blocks', () => {
      const input = `[source,javascript]
----
const foo = 'bar';
console.log(foo);
----`;

      const doc = parseAsciidoc(input);
      const codeBlock = doc.content?.find(node => node.type === 'codeBlock');

      expect(codeBlock).toBeDefined();
      expect(codeBlock?.attrs?.language).toBe('javascript');
    });

    it('should parse xref links', () => {
      const input = `See xref:other-card.adoc[Other Card] for details.`;

      const doc = parseAsciidoc(input);
      const paragraph = doc.content?.find(node => node.type === 'paragraph');
      const link = paragraph?.content?.find(
        node => node.marks?.some(m => m.type === 'link')
      );

      expect(link).toBeDefined();
      expect(link?.marks?.[0].attrs?.href).toBe('xref:other-card.adoc');
    });

    it('should serialize xref links correctly', () => {
      const input = `See xref:other-card.adoc[Other Card] for details.`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain('xref:other-card.adoc[Other Card]');
    });

    it('should roundtrip xref links exactly', () => {
      const input = `See xref:other-card.adoc[Other Card] for details.`;

      const doc = parseAsciidoc(input);
      console.log('Parsed doc:', JSON.stringify(doc, null, 2));
      const output = serializeAsciidoc(doc);
      console.log('Output:', output);

      expect(output.trim()).toBe(input);
    });

    it('should parse horizontal rules', () => {
      const input = `Before rule

'''

After rule`;

      const doc = parseAsciidoc(input);
      const hr = doc.content?.find(node => node.type === 'horizontalRule');

      expect(hr).toBeDefined();
    });

    it('should serialize horizontal rules', () => {
      const input = `Before rule

'''

After rule`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      expect(output).toContain("'''");
    });
  });

  describe('Roundtrip Integrity', () => {
    it('should roundtrip a complex document preserving macros', () => {
      const input = `= My Document

This is the introduction with *bold* and _italic_ text.

== Section 1

Here's a list:

* Item one
* Item two
* Item three

{{#report}}
query: state = "open"
format: table
{{/report}}

== Section 2

. First step
. Second step
. Third step

See xref:related-card.adoc[Related Card] for more info.

{{#graph}}
view: architecture
model: system
{{/graph}}

=== Subsection

Final thoughts go here.`;

      const doc = parseAsciidoc(input);
      const output = serializeAsciidoc(doc);

      // Key elements should be preserved
      expect(output).toContain('= My Document');
      expect(output).toContain('== Section 1');
      expect(output).toContain('== Section 2');
      expect(output).toContain('=== Subsection');
      expect(output).toContain('*bold*');
      expect(output).toContain('_italic_');
      expect(output).toContain('* Item one');
      expect(output).toContain('. First step');

      // CRITICAL: Macros must be exactly preserved
      expect(output).toContain(`{{#report}}
query: state = "open"
format: table
{{/report}}`);
      expect(output).toContain(`{{#graph}}
view: architecture
model: system
{{/graph}}`);
    });
  });
});
