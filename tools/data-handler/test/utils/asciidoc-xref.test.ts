import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rewriteAsciidocCardXrefs } from '../../src/utils/asciidoc-xref.js';
import type { Project } from '../../src/containers/project.js';
import type { Card } from '../../src/interfaces/project-interfaces.js';
import type { Mode } from '../../src/interfaces/macros.js';

function makeCard(key: string, title: string): Card {
  return {
    key,
    path: '',
    content: '',
    metadata: {
      title,
      cardType: '',
      workflowState: '',
      rank: '',
      links: [],
    },
    children: [],
    attachments: [],
  };
}

function makeProject(byKey: Record<string, Card>): Project {
  // Mirror the real Project.findCard contract: throw when the key is unknown,
  // never return undefined.
  const lookup = (k: string) => {
    const card = byKey[k];
    if (!card) {
      throw new Error(`Card not found: ${k}`);
    }
    return card;
  };
  return { findCard: lookup } as unknown as Project;
}

describe('rewriteAsciidocCardXrefs', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const project = makeProject({
    docs_12: makeCard('docs_12', 'Demo'),
    docs_2: makeCard('docs_2', 'Getting started tutorial'),
    decision_5: makeCard('decision_5', 'Decision Records'),
    bareword: makeCard('bareword', 'Bareword card'),
  });

  describe('inject mode', () => {
    it('rewrites to multi-project link with explicit label', () => {
      const out = rewriteAsciidocCardXrefs(
        'See xref:docs_12.adoc[Demo] please.',
        project,
        'inject',
      );
      expect(out).toBe('See link:/projects/docs/cards/docs_12[Demo] please.');
    });

    it('falls back to card title when label is empty', () => {
      const out = rewriteAsciidocCardXrefs(
        'Read xref:docs_2.adoc[].',
        project,
        'inject',
      );
      expect(out).toBe(
        'Read link:/projects/docs/cards/docs_2[Getting started tutorial].',
      );
    });

    it('preserves #anchor in the link target', () => {
      const out = rewriteAsciidocCardXrefs(
        'Jump to xref:docs_12.adoc#installation[Install].',
        project,
        'inject',
      );
      expect(out).toBe(
        'Jump to link:/projects/docs/cards/docs_12#installation[Install].',
      );
    });

    it('handles multiple xrefs on the same line', () => {
      const out = rewriteAsciidocCardXrefs(
        '* xref:docs_12.adoc[Demo] * xref:docs_2.adoc[Tutorial]',
        project,
        'inject',
      );
      expect(out).toBe(
        '* link:/projects/docs/cards/docs_12[Demo] * link:/projects/docs/cards/docs_2[Tutorial]',
      );
    });

    it('uses the target card key prefix, not the current project', () => {
      const out = rewriteAsciidocCardXrefs(
        'cross: xref:decision_5.adoc[ADR]',
        project,
        'inject',
      );
      expect(out).toBe('cross: link:/projects/decision/cards/decision_5[ADR]');
    });
  });

  describe('staticSite mode', () => {
    it('emits the same multi-project link form', () => {
      const out = rewriteAsciidocCardXrefs(
        'xref:docs_12.adoc[Demo]',
        project,
        'staticSite',
      );
      expect(out).toBe('link:/projects/docs/cards/docs_12[Demo]');
    });
  });

  describe('static (PDF) mode', () => {
    it('rewrites xref to an internal anchor reference with label', () => {
      const out = rewriteAsciidocCardXrefs(
        'See xref:docs_12.adoc[Demo].',
        project,
        'static',
      );
      expect(out).toBe('See <<docs_12,Demo>>.');
    });

    it('emits a bare anchor reference when the label is empty', () => {
      const out = rewriteAsciidocCardXrefs(
        'Read xref:docs_2.adoc[].',
        project,
        'static',
      );
      expect(out).toBe('Read <<docs_2>>.');
    });

    it('drops the #anchor part and warns once per target', () => {
      const out = rewriteAsciidocCardXrefs(
        'Jump to xref:docs_12.adoc#sec[Section] and xref:docs_12.adoc#again[Again].',
        project,
        'static',
      );
      expect(out).toBe('Jump to <<docs_12,Section>> and <<docs_12,Again>>.');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('docs_12');
      expect(warnSpy.mock.calls[0][0]).toMatch(/anchor/i);
    });

    it('rewrites multiple xrefs on one line', () => {
      const out = rewriteAsciidocCardXrefs(
        '* xref:docs_12.adoc[Demo] * xref:docs_2.adoc[]',
        project,
        'static',
      );
      expect(out).toBe('* <<docs_12,Demo>> * <<docs_2>>');
    });
  });

  describe('passthrough cases', () => {
    it('leaves content unchanged in validate mode', () => {
      const input = 'xref:docs_12.adoc[Demo]';
      expect(rewriteAsciidocCardXrefs(input, project, 'validate' as Mode)).toBe(
        input,
      );
    });

    it('leaves bare <<anchor>> references untouched', () => {
      const input = 'See <<Data types of custom fields>> below.';
      expect(rewriteAsciidocCardXrefs(input, project, 'inject')).toBe(input);
    });
  });

  describe('unknown / unparseable keys', () => {
    it('passes through xrefs whose target is not a known card and warns', () => {
      const input = 'xref:missing_99.adoc[Missing]';
      const out = rewriteAsciidocCardXrefs(input, project, 'inject');
      expect(out).toBe(input);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('missing_99');
    });

    it('warns once per unique unknown key', () => {
      const input =
        'xref:missing_99.adoc[A] and xref:missing_99.adoc[B] and xref:gone_1.adoc[C]';
      rewriteAsciidocCardXrefs(input, project, 'inject');
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });

    it('passes through xrefs whose key lacks a module prefix and warns', () => {
      // moduleNameFromCardKey throws on keys with no `_` separator. A card lookup
      // would still succeed if such a key exists, but we cannot form a project
      // URL. Treat it as a non-card target.
      const input = 'xref:bareword.adoc[Bare]';
      const out = rewriteAsciidocCardXrefs(input, project, 'inject');
      expect(out).toBe(input);
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('bareword');
    });
  });
});
