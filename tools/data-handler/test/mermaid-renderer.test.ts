import { describe, expect, it } from 'vitest';

import {
  preprocessMermaidBlocksForHtml,
  preprocessMermaidBlocksForPdf,
  renderMermaidDiagrams,
  renderMermaidToPng,
} from '../src/utils/mermaid-renderer.js';

// Rendering spawns a worker that loads Mermaid on first use, so allow generous time.
const RENDER_TIMEOUT = 30000;

const FLOWCHART = `graph TD
  A[Start] --> B{Is it working?}
  B -->|Yes| C[Great]
  B -->|No| D[Debug]`;

const SEQUENCE = `sequenceDiagram
  Alice->>Bob: Hello Bob
  Bob-->>Alice: Hi Alice`;

const INVALID = 'this is definitely not a valid mermaid diagram !!!';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function isPng(buffer: Buffer | null): boolean {
  return buffer !== null && buffer.subarray(0, 4).equals(PNG_MAGIC);
}

describe('mermaid-renderer', () => {
  describe('renderMermaidToPng', () => {
    it(
      'renders a flowchart to a PNG buffer',
      async () => {
        const png = await renderMermaidToPng(FLOWCHART);
        expect(isPng(png)).toBe(true);
        expect(png!.length).toBeGreaterThan(1000);
      },
      RENDER_TIMEOUT,
    );

    it(
      'renders a sequence diagram to a PNG buffer',
      async () => {
        const png = await renderMermaidToPng(SEQUENCE);
        expect(isPng(png)).toBe(true);
      },
      RENDER_TIMEOUT,
    );

    it(
      'returns null for invalid mermaid input',
      async () => {
        const png = await renderMermaidToPng(INVALID);
        expect(png).toBeNull();
      },
      RENDER_TIMEOUT,
    );
  });

  describe('renderMermaidDiagrams', () => {
    it('returns an empty array for no diagrams', async () => {
      expect(await renderMermaidDiagrams([])).toEqual([]);
    });

    it(
      'returns results aligned with the input, with null for failures',
      async () => {
        const results = await renderMermaidDiagrams([FLOWCHART, INVALID]);
        expect(results).toHaveLength(2);
        expect(isPng(results[0])).toBe(true);
        expect(results[1]).toBeNull();
      },
      RENDER_TIMEOUT,
    );
  });

  describe('preprocessMermaidBlocksForPdf', () => {
    it('returns content unchanged when there are no mermaid blocks', async () => {
      const content = 'Just some= AsciiDoc\n\nwith no diagrams.\n';
      expect(await preprocessMermaidBlocksForPdf(content)).toBe(content);
    });

    it(
      'replaces a valid block with a PNG image and a broken block with a source listing',
      async () => {
        const content = `before

[mermaid]
....
${SEQUENCE}
....

middle

[mermaid]
....
${INVALID}
....

after
`;
        const result = await preprocessMermaidBlocksForPdf(content);
        expect(result).toContain('image::data:image/png;base64,');
        expect(result).toContain('[source,mermaid]');
        expect(result).not.toMatch(/\[mermaid\]/);
      },
      RENDER_TIMEOUT,
    );
  });

  describe('preprocessMermaidBlocksForHtml', () => {
    it('replaces a mermaid block with a base64 passthrough placeholder', () => {
      const content = `[mermaid]\n....\n${FLOWCHART}\n....`;
      const result = preprocessMermaidBlocksForHtml(content);
      const encoded = Buffer.from(FLOWCHART, 'utf-8').toString('base64');
      expect(result).toContain(
        `<div class="mermaid-block" data-mermaid-code="${encoded}"></div>`,
      );
      expect(result).not.toMatch(/\[mermaid\]/);
    });

    it('leaves content without mermaid blocks unchanged', () => {
      const content = 'No diagrams here.\n';
      expect(preprocessMermaidBlocksForHtml(content)).toBe(content);
    });
  });
});
