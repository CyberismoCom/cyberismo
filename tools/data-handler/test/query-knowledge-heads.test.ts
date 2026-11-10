/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { Facts } from '../src/utils/clingo-facts.js';

// Predicates the knowledge layer owns: generated facts, base.lp heads, and
// what calculations write for the query layer to read. A query must not
// write any of them. Keep in sync by hand; the last test flags missing names and base.lp heads.
const KNOWLEDGE_PREDICATES = new Set([
  // facts (clingo-facts.ts)
  'alwaysVisibleField/2',
  'calculatedField/2',
  'card/1',
  'cardType/1',
  'customField/2',
  'enumValue/2',
  'field/3',
  'fieldOverride/3',
  'fieldType/1',
  'label/2',
  'linkDestinationCardType/2',
  'linkSourceCardType/2',
  'linkType/1',
  'module/1',
  'optionallyVisibleField/2',
  'overridableField/2',
  'parent/2',
  'project/1',
  'report/1',
  'skill/1',
  'skillRelatedTool/2',
  'template/1',
  'userLink/3',
  'userLink/4',
  'workflow/1',
  'workflowState/3',
  'workflowTransition/4',
  // base.lp heads
  'ancestor/2',
  'calculatedLink/3',
  'calculatedLink/4',
  'conflictingFieldValues/2',
  'dataType/3',
  'hiddenInTreeView/1',
  'link/3',
  'link/4',
  'notification/4',
  'policyCheckFailure/5',
  'projectCard/1',
  'templateCard/1',
  // written by calculations, read by the query layer
  'connector/1',
  'deletingCardDenied/2',
  'editingContentDenied/2',
  'editingFieldDenied/3',
  'enableSkill/1',
  'enableSkill/2',
  'externalItem/1',
  'fieldCalculated/3',
  'movingCardDenied/2',
  'onTransitionExecuteTransition/4',
  'onTransitionSetField/5',
  'policyCheckFailure/4',
  'policyCheckSuccess/3',
  'transitionDenied/3',
]);

const ASSETS = join(
  dirname(
    createRequire(import.meta.url).resolve('@cyberismo/assets/package.json'),
  ),
  'src',
);
const KNOWLEDGE_FILE = 'calculations/common/base.lp';

// Every Handlebars branch at once: drop block tags and lone tags, turn the
// rest into a constant. Line numbers are kept.
function stripHandlebars(text: string) {
  return text
    .replace(/\{\{!(--)?[\s\S]*?\}\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\{\{\{?[^{}\n]*\}\}\}?[ \t]*$/gm, '')
    .replace(/\{\{(?:[#/^]|else\b)[^}\n]*\}\}/g, '')
    .replace(/\{\{\{?[^}\n]*\}?\}\}/g, 'x');
}

// Blanks comments and string contents, so that '.', ':-' and ';' in them do
// not count. Offsets are kept.
function mask(text: string) {
  return text.replace(/%\*[\s\S]*?\*%|%[^\n]*|"(?:[^"\\]|\\.)*"/g, (m) =>
    m[0] === '"' ? `"${'_'.repeat(m.length - 2)}"` : m.replace(/[^\n]/g, ' '),
  );
}

// Splits at ';', ',', '|' or ':' outside brackets.
function splitTop(text: string, separators: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    else if (depth === 0 && separators.includes(c)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, text.slice(start)];
}

function ruleHeads(text: string) {
  const masked = mask(stripHandlebars(text));
  const heads: { line: number; signature: string }[] = [];
  let offset = 0;
  for (const statement of masked.split(/(?<!\.)\.(?!\.)/)) {
    const start = offset + statement.length - statement.trimStart().length;
    offset += statement.length + 1;
    const body = statement.trim();
    if (
      body === '' ||
      body.startsWith(':-') ||
      body.startsWith(':~') ||
      body.startsWith('#show')
    )
      continue;
    const line = masked.slice(0, start).split('\n').length;
    if (body.startsWith('#') && !body.startsWith('#external')) {
      if (
        /^#(const|include|defined|program|minimize|maximize|heuristic|project)\b/.test(
          body,
        )
      )
        continue;
      throw new Error(
        `line ${line}: unsupported statement: ${body.slice(0, 40)}`,
      );
    }
    const head = body.startsWith('#external')
      ? splitTop(body.slice('#external'.length), ':')[0]
      : body.split(':-')[0];
    // a choice '{ a : b; c }' with optional bounds, or a disjunction 'a ; b : c'
    const choice = /^[^{#]*\{([\s\S]*)\}[^}]*$/.exec(head);
    const elements = splitTop(
      choice ? choice[1] : head,
      choice ? ';' : ';|',
    ).map((e) => splitTop(e, ':')[0]);
    for (const element of elements) {
      const atom =
        /^\s*(?:not\s+)*-?\s*([a-z_]\w*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(
          element,
        );
      if (!atom)
        throw new Error(`line ${line}: cannot read head "${element.trim()}"`);
      for (const pooled of splitTop(atom[2] ?? '', ';')) {
        const arity = pooled.trim() === '' ? 0 : splitTop(pooled, ',').length;
        heads.push({ line, signature: `${atom[1]}/${arity}` });
      }
    }
  }
  return heads;
}

// Every scanned file is query-side, so none is excluded: base.lp is the only
// knowledge file. calculations/test/model.lp is a graph-model fixture and the
// static/default* files are scaffolds copied into new content.
const queryFiles = readdirSync(ASSETS, { recursive: true, encoding: 'utf8' })
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => /\.lp(\.hbs)?$/.test(f) && f !== KNOWLEDGE_FILE)
  .sort();

describe('ruleHeads', () => {
  const sigs = (text: string) => ruleHeads(text).map((h) => h.signature);

  it('sees every Handlebars branch', () => {
    const block = '{{#if a}}\np(1).\n{{else}}\nq(1,2).\n{{/if}}\n{{{model}}}\n';
    expect(sigs(block)).toEqual(['p/1', 'q/2']);
    expect(sigs('{{#if a}}p(x) :- s.{{else}}q(x) :- s.{{/if}}')).toEqual([
      'p/1',
      'q/1',
    ]);
  });

  it('ignores rule syntax inside strings and comments', () => {
    const text = 'a("x :- b(1). c(2);"). % d(1).\n%* e(1). *%\nf(1) :- g.';
    expect(sigs(text)).toEqual(['a/1', 'f/1']);
  });

  it('reads pools, choices and multi-line heads', () => {
    expect(sigs('r(1,2;3).')).toEqual(['r/2', 'r/1']);
    expect(sigs('1 { c(X) : d(X); e(X) } 2 :- f(X).')).toEqual(['c/1', 'e/1']);
    expect(sigs('h(\n  1,\n  2\n)\n:- b.')).toEqual(['h/2']);
  });

  it('is not fooled by mustache delimiters inside strings', () => {
    expect(sigs('p("{{").\nfield(1,2,3).\nq("}}").')).toEqual([
      'p/1',
      'field/3',
      'q/1',
    ]);
  });

  it('counts an empty argument list as arity 0', () => {
    expect(sigs('f().')).toEqual(['f/0']);
  });

  it('throws on a head it cannot read', () => {
    expect(() => ruleHeads('#count{ X : a(X) } > 1 :- b.')).toThrow();
  });
});

describe('query files', () => {
  const heads = (file: string) => {
    try {
      return ruleHeads(readFileSync(join(ASSETS, file), 'utf8'));
    } catch (e) {
      throw new Error(`tools/assets/src/${file}: ${(e as Error).message}`, {
        cause: e,
      });
    }
  };

  it('write no knowledge-layer predicate', () => {
    const violations = queryFiles.flatMap((file) =>
      heads(file)
        .filter((h) => KNOWLEDGE_PREDICATES.has(h.signature))
        .map(
          (h) =>
            `tools/assets/src/${file}:${h.line}: head ${h.signature} is a knowledge-layer predicate. ` +
            'A query must not write it; output the value with resultField/3 or resultField/4.',
        ),
    );
    expect(violations.join('\n')).toBe('');
  });

  // Facts are checked by name only (Facts has no arities); base.lp heads by
  // name/arity.
  it('the list covers every generated fact and base.lp head', () => {
    const names = new Set(
      [...KNOWLEDGE_PREDICATES].map((s) => s.split('/')[0]),
    );
    const facts = Object.values(Facts).flatMap((e) => Object.values(e));
    const base = heads(KNOWLEDGE_FILE);
    expect(facts.filter((f) => !names.has(f))).toEqual([]);
    expect(
      base.map((h) => h.signature).filter((s) => !KNOWLEDGE_PREDICATES.has(s)),
    ).toEqual([]);
  });
});
