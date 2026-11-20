// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { convert } from '@asciidoctor/core';

import type { ActionButtonOptions, RenderOptions } from '@cyberismo/model';
import { actionButtons } from '../helpers/action-buttons.js';
import { metadataOf, projects } from '../domain/cards/fixture.js';

const open = projects();

const REPORT = 'test/reports/buttons';

// Renders a report on the first card; `options` are extra report parameters.
async function render(
  content: string,
  mode: RenderOptions['mode'] = 'inject',
  options: (keys: string[]) => Record<string, unknown> = () => ({}),
) {
  const built = await open({
    reports: {
      buttons: { query: 'result(C) :- projectCard(C).', content },
    },
    cards: [{ title: 'Host' }, { title: 'Other' }],
  });
  const { ws, keys } = built;
  const report = JSON.stringify({ name: REPORT, ...options(keys) }).slice(
    1,
    -1,
  );
  const { content: out } = await ws.render.macros(
    `{{#report}}${report}{{/report}}`,
    { cardKey: keys[0], context: 'localApp', mode },
  );
  return { out, keys, ws };
}

const action = (programs: string, label = 'Go') =>
  `{{#action}}"buttonLabel": "${label}", "actions": [${programs}]{{/action}}`;

describe('action buttons in a report', () => {
  it('renders a button with the programs in inject mode', async () => {
    const { out, keys } = await render(
      action(
        '{{#quoted}}transition({{{cardKey}}}, "Start").{{/quoted}}, {{#quoted}}a.{{/quoted}}',
      ),
    );
    expect(actionButtons(out)).toEqual([
      {
        buttonLabel: 'Go',
        cardKey: keys[0],
        programs: [`transition(${keys[0]}, "Start").`, 'a.'],
      },
    ]);
  });

  it.each(['static', 'staticSite'] as const)(
    'renders nothing in %s mode',
    async (mode) => {
      const { out } = await render(
        `before ${action('{{#quoted}}a.{{/quoted}}')} after`,
        mode,
      );
      expect(out).not.toContain('action-button');
      expect(out).not.toContain('WARNING');
      expect(out.trim()).toBe('before  after');
    },
  );

  it('refuses an empty actions array', async () => {
    const { out } = await render(action(''));
    expect(out).not.toContain('<action-button');
    expect(out).toContain('[WARNING]');
    expect(out).toMatch(/action macro JSON validation error/);
  });

  it.each([
    ['a trailing comma', '{{#quoted}}a.{{/quoted}},'],
    ['a missing comma', '{{#quoted}}a.{{/quoted}} {{#quoted}}b.{{/quoted}}'],
  ])(
    'refuses a malformed body with %s, naming the action macro',
    async (_, programs) => {
      const { out } = await render(action(programs));
      expect(out).not.toContain('<action-button');
      expect(out).toContain('[WARNING]');
      expect(out).toMatch(/action macro JSON error: /);
    },
  );

  it('renders one button per item inside each over strings and numbers', async () => {
    const { out, keys } = await render(
      `{{#each items}}${action('{{#quoted}}removeLabel({{{cardKey}}}, "{{{this}}}"). n({{this}}).{{/quoted}}')}\n{{/each}}`,
      'inject',
      () => ({ items: ['urgent', 7] }),
    );
    expect(actionButtons(out).map((button) => button.programs)).toEqual([
      [`removeLabel(${keys[0]}, "urgent"). n(urgent).`],
      [`removeLabel(${keys[0]}, "7"). n(7).`],
    ]);
  });

  it('clingoEscape keeps a hostile value inside its string', async () => {
    const owner = 'x"). evil(1). y("\\';
    const { out } = await render(
      action('{{#quoted}}owner("{{{clingoEscape owner}}}").{{/quoted}}'),
      'inject',
      () => ({ owner }),
    );
    expect(actionButtons(out)[0].programs).toEqual([
      'owner("x\\"). evil(1). y(\\"\\\\").',
    ]);
  });

  it('clingoEscape carries a card title with quotes and a backslash into a working effect', async () => {
    const title = 'Say "hi" to C:\\temp now';
    const { ws, keys } = await open({
      reports: {
        buttons: {
          query:
            'select("title").\nresult(C) :- projectCard(C), field(C, "title", T), T != "Host".',
          content: `{{#each results}}${action('{{#quoted}}setField({{{cardKey}}}, "title", "{{{clingoEscape title}}}").{{/quoted}}')}{{/each}}`,
        },
      },
      cards: [{ title: 'Host' }, { title }],
    });
    const { content } = await ws.render.macros(
      `{{#report}}"name": "${REPORT}"{{/report}}`,
      { cardKey: keys[0], context: 'localApp', mode: 'inject' },
    );
    const [button] = actionButtons(content);

    await ws.cards.runAction(keys[0], button.programs);

    expect((await metadataOf(ws, keys[0])).title).toBe(title);
  });

  it('cardKey in the action is the rendering card even when the report overrides it', async () => {
    const { out, keys } = await render(
      action(
        '{{#quoted}}card({{{cardKey}}}). param({{{@root.cardKey}}}).{{/quoted}}',
      ),
      'inject',
      (keys) => ({ cardKey: keys[1] }),
    );
    expect(actionButtons(out)).toEqual([
      {
        buttonLabel: 'Go',
        cardKey: keys[0],
        programs: [`card(${keys[0]}). param(${keys[1]}).`],
      },
    ]);
  });

  it('renders one button per row inside each, with cardKey the rendering card and the row key available', async () => {
    const content = `|===
|Card |Action

{{#each results}}
|{{{key}}}
|${action('{{#quoted}}row({{{key}}}, {{{this.key}}}). card({{{cardKey}}}). param({{{@root.cardKey}}}).{{/quoted}}', 'Go {{{key}}}')}

{{/each}}
|===`;
    const { out, keys } = await render(content, 'inject', (keys) => ({
      cardKey: keys[1],
    }));

    const byLabel = (a: ActionButtonOptions, b: ActionButtonOptions) =>
      a.buttonLabel.localeCompare(b.buttonLabel);
    expect(actionButtons(out).sort(byLabel)).toEqual(
      [...keys].sort().map((row) => ({
        buttonLabel: `Go ${row}`,
        cardKey: keys[0],
        programs: [`row(${row}, ${row}). card(${keys[0]}). param(${keys[1]}).`],
      })),
    );
    // Each button stays inside its table cell.
    const html = String(await convert(out, { safe: 'secure' }));
    const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
      ([, cell]) => cell,
    );
    expect(
      cells.filter((cell) => cell.includes('<action-button')),
    ).toHaveLength(keys.length);
  });

  it('a nested quoted text is one clingo string literal that sets the content', async () => {
    // The text of a setContent effect, written with a nested quoted.
    const text = '= Plan\nSay "hi" to C:\\temp\nDone';
    const { out, keys, ws } = await render(
      action(`{{#quoted}}
setContent({{{cardKey}}}, {{#quoted}}
${text}
{{/quoted}}).
{{/quoted}}`),
    );

    const [program] = actionButtons(out)[0].programs;
    // Line break, double quote and backslash escaped once, for clingo.
    expect(program).toBe(
      `setContent(${keys[0]}, "= Plan\\nSay \\"hi\\" to C:\\\\temp\\nDone").`,
    );
    // Clicked, the card's content is the original text.
    await ws.cards.runAction(keys[0], [program]);
    expect((await ws.cards.details(keys[0])).content).toBe(text);
  });
});
