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
  const rendered = await ws.render.macros(`{{#report}}${report}{{/report}}`, {
    cardKey: keys[0],
    context: 'localApp',
    mode,
  });
  return { out: rendered.content, rendered, keys, ws };
}

const action = (programs: string, label = 'Go') =>
  `{{#action}}"buttonLabel": "${label}", "actions": [${programs}]{{/action}}`;

describe('action buttons in a report', () => {
  it('renders a button with the programs in inject mode', async () => {
    const { rendered, keys } = await render(
      action(
        '{{#quoted}}transition({{{cardKey}}}, "Start").{{/quoted}}, {{#quoted}}a.{{/quoted}}',
      ),
    );
    expect(actionButtons(rendered)).toEqual([
      {
        buttonLabel: 'Go',
        cardKey: keys[0],
        programs: [`transition(${keys[0]}, "Start").`, 'a.'],
      },
    ]);
  });

  // Without the card, the body would have no programs.
  it.each(['static', 'staticSite'] as const)(
    'renders nothing in %s mode',
    async (mode) => {
      const { out } = await render(
        `before ${action('{{#if cardKey}}{{#quoted}}a.{{/quoted}}{{/if}}')} after`,
        mode,
      );
      expect(out).not.toContain('cyberismo-part');
      expect(out).not.toContain('WARNING');
      expect(out.trim()).toBe('before  after');
    },
  );

  it('refuses an empty actions array', async () => {
    const { out } = await render(action(''));
    expect(out).not.toContain('cyberismo-part');
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
      expect(out).not.toContain('cyberismo-part');
      expect(out).toContain('[WARNING]');
      expect(out).toMatch(/action macro JSON error: /);
    },
  );

  it('renders one button per item inside each over strings and numbers', async () => {
    const { rendered, keys } = await render(
      `{{#each items}}${action('{{#quoted}}removeLabel({{{cardKey}}}, "{{{this}}}"). n({{this}}).{{/quoted}}')}\n{{/each}}`,
      'inject',
      () => ({ items: ['urgent', 7] }),
    );
    expect(actionButtons(rendered).map((button) => button.programs)).toEqual([
      [`removeLabel(${keys[0]}, "urgent"). n(urgent).`],
      [`removeLabel(${keys[0]}, "7"). n(7).`],
    ]);
  });

  it('leaves the row as it is inside the action', async () => {
    const { rendered } = await render(
      `{{#each items}}${action('{{#quoted}}{{#if this}}true.{{else}}false.{{/if}}{{#each this}} item({{{this}}}).{{/each}}{{/quoted}}')}\n{{/each}}`,
      'inject',
      () => ({ items: [false, 0, '', ['a', 'b']] }),
    );
    expect(actionButtons(rendered).map((button) => button.programs)).toEqual([
      ['false.'],
      ['false.'],
      ['false.'],
      ['true. item(a). item(b).'],
    ]);
  });

  it('leaves a cardKey section of the report as it is', async () => {
    const { out, keys } = await render(
      '{{#cardKey}}Card: {{this}}{{/cardKey}}|{{^cardKey}}none{{/cardKey}}|{{#with x}}{{^cardKey}}no key{{/cardKey}}{{/with}}',
      'inject',
      () => ({ x: { y: 1 } }),
    );
    expect(out.trim()).toBe(`Card: ${keys[0]}||no key`);
  });

  it('clingoEscape keeps a hostile value inside its string', async () => {
    const owner = 'x"). evil(1). y("\\';
    const { rendered } = await render(
      action('{{#quoted}}owner("{{{clingoEscape owner}}}").{{/quoted}}'),
      'inject',
      () => ({ owner }),
    );
    expect(actionButtons(rendered)[0].programs).toEqual([
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
    const rendered = await ws.render.macros(
      `{{#report}}"name": "${REPORT}"{{/report}}`,
      { cardKey: keys[0], context: 'localApp', mode: 'inject' },
    );
    const [button] = actionButtons(rendered);

    await ws.cards.runAction(keys[0], button.programs);

    expect((await metadataOf(ws, keys[0])).title).toBe(title);
  });

  it('cardKey in the action is the rendering card even when the report overrides it', async () => {
    const { rendered, keys } = await render(
      action(
        '{{#quoted}}card({{{cardKey}}}). param({{{@root.cardKey}}}).{{/quoted}}',
      ),
      'inject',
      (keys) => ({ cardKey: keys[1] }),
    );
    expect(actionButtons(rendered)).toEqual([
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
    const { out, rendered, keys } = await render(content, 'inject', (keys) => ({
      cardKey: keys[1],
    }));

    const byLabel = (a: ActionButtonOptions, b: ActionButtonOptions) =>
      a.buttonLabel.localeCompare(b.buttonLabel);
    expect(actionButtons(rendered).sort(byLabel)).toEqual(
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
      cells.filter((cell) => cell.includes('cyberismo-part:')),
    ).toHaveLength(keys.length);
  });

  it('a nested quoted text is one clingo string literal that sets the content', async () => {
    // The text of a setContent effect, written with a nested quoted.
    const text = '= Plan\nSay "hi" to C:\\temp\nDone';
    const { rendered, keys, ws } = await render(
      action(`{{#quoted}}
setContent({{{cardKey}}}, {{#quoted}}
${text}
{{/quoted}}).
{{/quoted}}`),
    );

    const [program] = actionButtons(rendered)[0].programs;
    // Line break, double quote and backslash escaped once, for clingo.
    expect(program).toBe(
      `setContent(${keys[0]}, "= Plan\\nSay \\"hi\\" to C:\\\\temp\\nDone").`,
    );
    // Clicked, the card's content is the original text.
    await ws.cards.runAction(keys[0], [program]);
    expect((await ws.cards.details(keys[0])).content).toBe(text);
  });
});
