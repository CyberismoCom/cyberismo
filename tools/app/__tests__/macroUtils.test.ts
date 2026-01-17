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

import { expect, test, describe } from 'vitest';
import {
  extractMacros,
  replaceMacrosWithPlaceholders,
  restoreMacrosFromPlaceholders,
  getMacroSourceMap,
} from '@/lib/macroUtils';
import { htmlToAsciidoc } from '@/lib/htmlToAsciidoc';

describe('macroUtils', () => {
  describe('extractMacros', () => {
    test('extracts a simple report macro', () => {
      const content = `Some text before
{{#report}}
  "name": "ismsa/reports/dashboard"
{{/report}}
Some text after`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('report');
      expect(macros[0].source).toBe(`{{#report}}
  "name": "ismsa/reports/dashboard"
{{/report}}`);
    });

    test('extracts multiple macros of the same type', () => {
      const content = `{{#report}}
  "name": "report1"
{{/report}}
Some content
{{#report}}
  "name": "report2"
{{/report}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(2);
      expect(macros[0].source).toContain('report1');
      expect(macros[1].source).toContain('report2');
    });

    test('extracts different macro types', () => {
      const content = `{{#report}}
  "name": "my-report"
{{/report}}
{{#createCards}}
  "buttonLabel": "Create",
  "template": "test/templates/myTemplate"
{{/createCards}}
{{#scoreCard}}
  "title": "Score"
{{/scoreCard}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(3);
      expect(macros.find((m) => m.name === 'report')).toBeDefined();
      expect(macros.find((m) => m.name === 'createCards')).toBeDefined();
      expect(macros.find((m) => m.name === 'scoreCard')).toBeDefined();
    });

    test('extracts graph macro', () => {
      const content = `{{#graph}}
  "graphModel": "test/graphModels/myModel",
  "graphView": "test/graphViews/myView"
{{/graph}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('graph');
    });

    test('extracts include macro', () => {
      const content = `{{#include}}
  "card": "test_123"
{{/include}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('include');
    });

    test('extracts xref macro', () => {
      const content = `See {{#xref}}"card": "test_123"{{/xref}} for more details.`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('xref');
    });

    test('extracts vega macro', () => {
      const content = `{{#vega}}
  "spec": { "data": [] }
{{/vega}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].name).toBe('vega');
    });

    test('returns empty array when no macros present', () => {
      const content = 'Just some plain text without any macros.';

      const macros = extractMacros(content);

      expect(macros).toHaveLength(0);
    });

    test('handles macros with complex JSON content', () => {
      const content = `{{#report}}
  "name": "complex/report",
  "options": {
    "nested": {
      "value": true,
      "array": [1, 2, 3]
    }
  }
{{/report}}`;

      const macros = extractMacros(content);

      expect(macros).toHaveLength(1);
      expect(macros[0].source).toContain('"nested"');
      expect(macros[0].source).toContain('"array"');
    });
  });

  describe('replaceMacrosWithPlaceholders', () => {
    test('replaces macro with placeholder', () => {
      const content = `Before
{{#report}}
  "name": "test"
{{/report}}
After`;

      const macros = extractMacros(content);
      const result = replaceMacrosWithPlaceholders(content, macros);

      expect(result).not.toContain('{{#report}}');
      expect(result).not.toContain('{{/report}}');
      expect(result).toContain('[[MACRO:');
      expect(result).toContain('Before');
      expect(result).toContain('After');
    });

    test('replaces multiple macros', () => {
      const content = `{{#report}}"name": "r1"{{/report}}
text
{{#report}}"name": "r2"{{/report}}`;

      const macros = extractMacros(content);
      const result = replaceMacrosWithPlaceholders(content, macros);

      expect(result).not.toContain('{{#report}}');
      expect(result.match(/\[\[MACRO:/g)).toHaveLength(2);
    });
  });

  describe('restoreMacrosFromPlaceholders', () => {
    test('restores original macro from placeholder', () => {
      const originalContent = `Before
{{#report}}
  "name": "test"
{{/report}}
After`;

      const macros = extractMacros(originalContent);
      const withPlaceholders = replaceMacrosWithPlaceholders(
        originalContent,
        macros
      );
      const restored = restoreMacrosFromPlaceholders(withPlaceholders, macros);

      expect(restored).toBe(originalContent);
    });

    test('restores multiple macros correctly', () => {
      const originalContent = `{{#report}}
  "name": "report1"
{{/report}}
Some middle text
{{#createCards}}
  "buttonLabel": "Create"
{{/createCards}}
End text`;

      const macros = extractMacros(originalContent);
      const withPlaceholders = replaceMacrosWithPlaceholders(
        originalContent,
        macros
      );
      const restored = restoreMacrosFromPlaceholders(withPlaceholders, macros);

      expect(restored).toBe(originalContent);
    });

    test('roundtrip preserves exact macro source', () => {
      const macroSource = `{{#report}}
  "name": "ismsa/reports/dashboard"
{{/report}}`;
      const content = `== My Section

Some intro text.

${macroSource}

More text after.`;

      const macros = extractMacros(content);
      expect(macros).toHaveLength(1);
      expect(macros[0].source).toBe(macroSource);

      const withPlaceholders = replaceMacrosWithPlaceholders(content, macros);
      const restored = restoreMacrosFromPlaceholders(withPlaceholders, macros);

      expect(restored).toBe(content);
      expect(restored).toContain(macroSource);
    });
  });

  describe('getMacroSourceMap', () => {
    test('returns map of id to source', () => {
      const content = `{{#report}}"name": "test"{{/report}}`;
      const macros = extractMacros(content);
      const map = getMacroSourceMap(macros);

      expect(map.size).toBe(1);
      expect(map.get(macros[0].id)).toBe(macros[0].source);
    });
  });
});

describe('htmlToAsciidoc', () => {
  describe('macro block handling', () => {
    test('preserves macro source from data attribute', () => {
      const macroSource = `{{#report}}
  "name": "ismsa/reports/dashboard"
{{/report}}`;
      const encodedSource = encodeURIComponent(macroSource);
      const html = `<p>Before</p>
<div class="visual-editor-macro-block" data-macro-source="${encodedSource}">
  <div>Rendered content</div>
</div>
<p>After</p>`;

      const result = htmlToAsciidoc(html);

      expect(result).toContain('{{#report}}');
      expect(result).toContain('"name": "ismsa/reports/dashboard"');
      expect(result).toContain('{{/report}}');
    });

    test('handles macro-placeholder class', () => {
      const html = `<p>Before</p>
<span class="macro-placeholder">[[MACRO:test-123]]</span>
<p>After</p>`;

      const result = htmlToAsciidoc(html);

      expect(result).toContain('[[MACRO:test-123]]');
    });

    test('does not include rendered macro content', () => {
      const macroSource = `{{#report}}"name": "test"{{/report}}`;
      const encodedSource = encodeURIComponent(macroSource);
      const html = `<div class="visual-editor-macro-block" data-macro-source="${encodedSource}">
  <table><tr><td>Rendered report data</td></tr></table>
</div>`;

      const result = htmlToAsciidoc(html);

      expect(result).not.toContain('Rendered report data');
      expect(result).toContain('{{#report}}');
      expect(result).toContain('{{/report}}');
    });
  });

  describe('basic HTML conversion', () => {
    test('converts headings', () => {
      const html = '<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>';
      const result = htmlToAsciidoc(html);

      expect(result).toContain('== Heading 1');
      expect(result).toContain('=== Heading 2');
      expect(result).toContain('==== Heading 3');
    });

    test('converts bold and italic', () => {
      const html = '<p><strong>bold</strong> and <em>italic</em></p>';
      const result = htmlToAsciidoc(html);

      expect(result).toContain('*bold*');
      expect(result).toContain('_italic_');
    });

    test('converts unordered lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = htmlToAsciidoc(html);

      expect(result).toContain('* Item 1');
      expect(result).toContain('* Item 2');
    });

    test('converts ordered lists', () => {
      const html = '<ol><li>First</li><li>Second</li></ol>';
      const result = htmlToAsciidoc(html);

      expect(result).toContain('. First');
      expect(result).toContain('. Second');
    });

    test('converts xref links (internal .html links back to xref:)', () => {
      const html = '<a href="cisms_121.html">5 Organisational controls</a>';
      const result = htmlToAsciidoc(html);

      expect(result).toBe('xref:cisms_121.adoc[5 Organisational controls]');
    });

    test('converts xref links in lists', () => {
      const html = `<ul>
        <li><a href="cisms_121.html">5 Organisational controls</a></li>
        <li><a href="cisms_122.html">6 People controls</a></li>
      </ul>`;
      const result = htmlToAsciidoc(html);

      expect(result).toContain('* xref:cisms_121.adoc[5 Organisational controls]');
      expect(result).toContain('* xref:cisms_122.adoc[6 People controls]');
    });

    test('preserves external links', () => {
      const html = '<a href="https://example.com">Example</a>';
      const result = htmlToAsciidoc(html);

      expect(result).toBe('https://example.com[Example]');
    });

    test('converts anchor links', () => {
      const html = '<a href="#section1">Go to section</a>';
      const result = htmlToAsciidoc(html);

      expect(result).toBe('<<section1,Go to section>>');
    });
  });
});

describe('full roundtrip: macro extraction -> placeholder -> restoration', () => {
  test('report macro survives full editing roundtrip', () => {
    const originalAsciidoc = `== Dashboard

This is our dashboard.

{{#report}}
  "name": "ismsa/reports/dashboard"
{{/report}}

End of section.`;

    // Step 1: Extract macros
    const macros = extractMacros(originalAsciidoc);
    expect(macros).toHaveLength(1);
    expect(macros[0].name).toBe('report');

    // Step 2: Simulate what happens during visual editing
    // The macro source is stored in data attribute
    const encodedSource = encodeURIComponent(macros[0].source);

    // Step 3: Simulate the HTML that would be generated
    // (simplified - in reality this comes from the parsed content)
    const simulatedHtml = `<h2>Dashboard</h2>
<p>This is our dashboard.</p>
<div class="visual-editor-macro-block" data-macro-source="${encodedSource}">
  <div>Report rendered content here</div>
</div>
<p>End of section.</p>`;

    // Step 4: Convert back to AsciiDoc (as handleInput does)
    const convertedAsciidoc = htmlToAsciidoc(simulatedHtml);

    // Step 5: Verify the macro is preserved exactly
    expect(convertedAsciidoc).toContain('{{#report}}');
    expect(convertedAsciidoc).toContain('"name": "ismsa/reports/dashboard"');
    expect(convertedAsciidoc).toContain('{{/report}}');
  });

  test('multiple macros survive roundtrip', () => {
    const originalAsciidoc = `{{#report}}
  "name": "report1"
{{/report}}

Some text in between.

{{#scoreCard}}
  "title": "My Score"
{{/scoreCard}}`;

    const macros = extractMacros(originalAsciidoc);
    expect(macros).toHaveLength(2);

    // Simulate HTML with both macros
    const html = macros
      .map(
        (m) =>
          `<div class="visual-editor-macro-block" data-macro-source="${encodeURIComponent(m.source)}">
        <div>Rendered</div>
      </div>`
      )
      .join('<p>Some text in between.</p>');

    const result = htmlToAsciidoc(html);

    expect(result).toContain('{{#report}}');
    expect(result).toContain('"name": "report1"');
    expect(result).toContain('{{/report}}');
    expect(result).toContain('{{#scoreCard}}');
    expect(result).toContain('"title": "My Score"');
    expect(result).toContain('{{/scoreCard}}');
  });

  test('macro with special characters survives roundtrip', () => {
    const macroSource = `{{#report}}
  "name": "path/to/report",
  "filter": "status == \\"active\\" && count > 0"
{{/report}}`;

    const content = `Text before\n${macroSource}\nText after`;
    const macros = extractMacros(content);

    expect(macros).toHaveLength(1);

    const encodedSource = encodeURIComponent(macros[0].source);
    const html = `<p>Text before</p>
<div class="visual-editor-macro-block" data-macro-source="${encodedSource}">
  <div>Rendered</div>
</div>
<p>Text after</p>`;

    const result = htmlToAsciidoc(html);

    expect(result).toContain('{{#report}}');
    expect(result).toContain('"filter": "status == \\"active\\" && count > 0"');
    expect(result).toContain('{{/report}}');
  });
});

describe('macro-content div handling (backend wrapped macros)', () => {
  // Note: The actual source preservation is handled by matching macro-content divs
  // with extractedMacros from the raw content, not from data attributes.
  // The htmlToAsciidoc function handles visual-editor-macro-block elements
  // which are created by VisualEditor when wrapping macro-content divs.

  test('visual-editor-macro-block preserves exact source format', () => {
    // This is the exact original source - no formatting changes
    const macroSource = `{{#scoreCard}}"title": "Test Score", "value": 42{{/scoreCard}}`;
    const encodedSource = encodeURIComponent(macroSource);

    const html = `<p>Text before</p>
<div class="visual-editor-macro-block" data-macro-source="${encodedSource}">
  <svg>rendered chart</svg>
</div>
<p>Text after</p>`;

    const result = htmlToAsciidoc(html);

    expect(result).toContain('Text before');
    // The exact source should be preserved including spacing
    expect(result).toContain('{{#scoreCard}}"title": "Test Score", "value": 42{{/scoreCard}}');
    expect(result).toContain('Text after');
    // Should NOT contain the SVG rendered content
    expect(result).not.toContain('<svg>');
  });

  test('macro-content div without visual-editor-macro-block is skipped', () => {
    // Bare macro-content divs (without visual-editor-macro-block wrapper)
    // should not output the rendered content to avoid duplication
    const html = `<p>Text</p>
<div class="macro-content" data-macro-name="scoreCard">
  <svg>rendered</svg>
</div>
<p>More text</p>`;

    const result = htmlToAsciidoc(html);

    expect(result).toContain('Text');
    expect(result).toContain('More text');
    // Should NOT contain the rendered content
    expect(result).not.toContain('<svg>');
    expect(result).not.toContain('rendered');
  });

  test('multiple visual-editor-macro-block elements preserve sources', () => {
    const macro1Source = `{{#scoreCard}}"title": "First", "value": 1{{/scoreCard}}`;
    const macro2Source = `{{#percentage}}"title": "Second", "value": 50{{/percentage}}`;
    const encoded1 = encodeURIComponent(macro1Source);
    const encoded2 = encodeURIComponent(macro2Source);

    const html = `<p>Start</p>
<div class="visual-editor-macro-block" data-macro-source="${encoded1}">rendered1</div>
<p>Middle</p>
<div class="visual-editor-macro-block" data-macro-source="${encoded2}">rendered2</div>
<p>End</p>`;

    const result = htmlToAsciidoc(html);

    expect(result).toContain('{{#scoreCard}}');
    expect(result).toContain('{{/scoreCard}}');
    expect(result).toContain('{{#percentage}}');
    expect(result).toContain('{{/percentage}}');
    expect(result).toContain('Start');
    expect(result).toContain('Middle');
    expect(result).toContain('End');
  });
});
