// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { CreateParamsByType } from '@cyberismo/model';
import {
  expectRefused,
  local,
  newParams,
  projects,
  readJson,
  spec,
} from './fixture.js';

const open = projects();

const validationTypes = ['cardTypes', 'fieldTypes', 'reports'] as const;

type Type = keyof CreateParamsByType;

// What each type gets on create: params, the metadata file it is written as
// (besides its name), and the files of its folder, if it has one, next to
// <type>/<id>.json.
const types: {
  type: Type;
  params: CreateParamsByType[Type];
  metadata: Record<string, unknown>;
  folder?: string[];
  content?: Record<string, unknown>;
}[] = [
  {
    type: 'workflows',
    params: {},
    metadata: {
      displayName: '',
      states: [
        { name: 'Draft', category: 'initial' },
        { name: 'Approved', category: 'closed' },
        { name: 'Deprecated', category: 'closed' },
      ],
      transitions: [
        { name: 'Create', fromState: [''], toState: 'Draft' },
        { name: 'Approve', fromState: ['Draft'], toState: 'Approved' },
        { name: 'Archive', fromState: ['*'], toState: 'Deprecated' },
      ],
    },
  },
  {
    type: 'cardTypes',
    params: { workflow: 'test/workflows/flow' },
    metadata: {
      displayName: '',
      workflow: 'test/workflows/flow',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    },
  },
  {
    type: 'fieldTypes',
    params: { dataType: 'shortText' },
    metadata: { displayName: '', dataType: 'shortText' },
  },
  {
    type: 'fieldTypes',
    params: { dataType: 'enum' },
    metadata: {
      displayName: '',
      dataType: 'enum',
      enumValues: [{ enumValue: 'value1' }, { enumValue: 'value2' }],
    },
  },
  {
    type: 'linkTypes',
    params: {},
    metadata: {
      displayName: '',
      outboundDisplayName: 'test/linkTypes/fresh',
      inboundDisplayName: 'test/linkTypes/fresh',
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    },
  },
  {
    type: 'templates',
    params: {},
    metadata: { displayName: '' },
    folder: ['c'],
  },
  {
    type: 'calculations',
    params: {},
    metadata: { displayName: '', calculation: 'calculation.lp' },
    folder: ['calculation.lp'],
    content: { calculation: "% add your calculations here for 'fresh'" },
  },
  {
    type: 'reports',
    params: {},
    metadata: { displayName: '' },
    folder: [
      '.schema',
      'index.adoc.hbs',
      'parameterSchema.json',
      'query.lp.hbs',
    ],
    content: {
      // Line breaks differ between platforms.
      contentTemplate: expect.stringMatching(
        /^\{\{#each results\}\}\s*\* \{\{this\.title\}\}\s*\{\{\/each\}\}\s*$/,
      ),
      queryTemplate: expect.stringMatching(
        /^select\("title"\)\.\s*result\(Card\) :- parent\(Card, \{\{cardKey\}\}\)\.\s*$/,
      ),
      schema: {
        $id: 'reportMacroDefaultSchema',
        additionalProperties: false,
        description:
          'A report object provides supplemental information about a report',
        properties: {
          cardKey: {
            description:
              'Used to override the default cardKey, which is the cardKey of the card, in which the report macro is used',
            type: 'string',
          },
          name: { description: 'The name of the report', type: 'string' },
        },
        required: ['name'],
        title: 'Report',
        type: 'object',
      },
    },
  },
  {
    type: 'graphModels',
    params: {},
    metadata: { displayName: '' },
    folder: ['model.lp'],
    content: { model: "% add your calculations here for 'fresh'" },
  },
  {
    type: 'graphViews',
    params: {},
    metadata: { displayName: '' },
    folder: ['.schema', 'parameterSchema.json', 'view.lp.hbs'],
    content: {
      viewTemplate: '',
      schema: {
        $id: 'myGraphMacroSchema',
        additionalProperties: false,
        description: 'Parameters for the graph macro',
        properties: {
          model: { description: 'The name of the graph model', type: 'string' },
          view: { description: 'The name of the graph view', type: 'string' },
          cardKey: {
            description:
              'Override default cardKey of the macro with another cardKey. Default cardKey is the card where the macro is defined in.',
            type: 'string',
          },
        },
        required: ['model', 'view'],
        title: 'Graph view',
        type: 'object',
      },
    },
  },
  {
    type: 'skills',
    params: {},
    metadata: { displayName: '', relatedTools: [] },
    folder: ['query.lp', 'skill.md'],
    content: {
      skillContent: expect.any(String),
      skillQuery: expect.any(String),
    },
  },
];

describe('resources.create', () => {
  it.each(types)(
    'creates a $type resource ($params) with its defaults, on disk and through show',
    async ({ type, params, metadata, folder, content }) => {
      const { ws, path } = await open(spec);

      await ws.resources.create('fresh', type, params);

      const name = `test/${type}/fresh`;
      expect(readJson(local(path, type, 'fresh.json'))).toEqual({
        name,
        ...metadata,
      });
      expect(await ws.resources.show(name)).toMatchObject({
        name,
        ...metadata,
        ...(content && { content }),
      });
      if (folder) {
        expect(readdirSync(local(path, type, 'fresh')).sort()).toEqual(folder);
      }
    },
  );

  it('takes the full name as well as the bare identifier', async () => {
    const { ws, path } = await open(spec);

    await ws.resources.create('test/fieldTypes/full', 'fieldTypes', {
      dataType: 'integer',
    });

    expect(existsSync(local(path, 'fieldTypes', 'full.json'))).toBe(true);
    expect(await ws.resources.show('test/fieldTypes/full')).toMatchObject({
      dataType: 'integer',
    });
  });

  // The content given is written, with the name set to the new one.
  it.each([
    {
      type: 'linkTypes' as const,
      content: {
        name: 'ignored',
        displayName: 'Bidir',
        outboundDisplayName: 'out',
        inboundDisplayName: 'in',
        sourceCardTypes: ['test/cardTypes/page'],
        destinationCardTypes: [],
        enableLinkDescription: true,
      },
    },
    {
      type: 'templates' as const,
      content: {
        name: 'ignored',
        displayName: 'Mine',
        description: 'About',
        category: 'Group',
      },
    },
    {
      type: 'workflows' as const,
      content: {
        name: 'ignored',
        displayName: 'Mine',
        states: [{ name: 'Draft', category: 'initial' }],
        transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
      },
    },
    {
      type: 'calculations' as const,
      content: {
        name: 'ignored',
        displayName: 'Mine',
        description: 'About',
        calculation: '',
      },
    },
  ])(
    'creates a $type resource from the content given',
    async ({ type, content }) => {
      const { ws } = await open(spec);

      await ws.resources.create('given', type, { content } as never);

      expect(await ws.resources.show(`test/${type}/given`)).toMatchObject({
        ...content,
        name: `test/${type}/given`,
      });
    },
  );

  describe('refusals leave the project as it was', () => {
    it.each([
      {
        why: 'the name is another type',
        name: 'test/workflows/x',
        type: 'fieldTypes' as const,
        params: { dataType: 'integer' as const },
        error: /not of type 'fieldTypes'/,
      },
      {
        why: 'the resource exists',
        name: 'size',
        type: 'fieldTypes' as const,
        params: { dataType: 'integer' as const },
        error: /'size' already exists/,
      },
      {
        why: 'the identifier is invalid',
        name: 'no spaces',
        type: 'fieldTypes' as const,
        params: { dataType: 'integer' as const },
        error: /naming rules/,
      },
      {
        why: 'the prefix is a module prefix',
        name: 'mod/fieldTypes/x',
        type: 'fieldTypes' as const,
        params: { dataType: 'integer' as const },
        error: /Cannot change module resources/,
      },
      {
        why: 'the prefix is no project prefix',
        name: 'nope/fieldTypes/x',
        type: 'fieldTypes' as const,
        params: { dataType: 'integer' as const },
        error: /can only refer to project that it is part of/,
      },
      {
        why: 'the data type is unknown',
        name: 'x',
        type: 'fieldTypes' as const,
        params: { dataType: 'colour' as never },
        error: /Field type 'colour' not supported/,
      },
      {
        why: 'the card type names no workflow',
        name: 'x',
        type: 'cardTypes' as const,
        params: { workflow: '' },
        error: /without providing workflow/,
      },
      {
        why: 'the workflow is unknown',
        name: 'x',
        type: 'cardTypes' as const,
        params: { workflow: 'test/workflows/missing' },
        error:
          /Workflow 'test\/workflows\/missing' does not exist in the project/,
      },
      {
        why: 'the link type content lacks a mandatory value',
        name: 'x',
        type: 'linkTypes' as const,
        params: {
          content: {
            name: 'test/linkTypes/x',
            displayName: 'x',
            inboundDisplayName: 'in',
            outboundDisplayName: 'out',
            destinationCardTypes: [],
            sourceCardTypes: [],
          },
        },
        error: /must have required property 'enableLinkDescription'/,
      },
      {
        why: 'the template content has no name',
        name: 'x',
        type: 'templates' as const,
        params: { content: { displayName: 'x' } },
        error: /must have required property 'name'/,
      },
      {
        why: 'the calculation content has no name',
        name: 'x',
        type: 'calculations' as const,
        params: { content: { displayName: 'x', calculation: '' } },
        error: /must have required property 'name'/,
      },
      {
        why: 'the workflow content has no initial transition',
        name: 'x',
        type: 'workflows' as const,
        params: {
          content: {
            name: 'test/workflows/x',
            displayName: '',
            states: [{ name: 'A', category: 'initial' }],
            transitions: [],
          },
        },
        error: /exactly one transition/,
      },
    ])('when $why', async ({ name, type, params, error }) => {
      const { ws, path } = await open({
        ...spec,
        modules: [{ prefix: 'mod' }],
      });

      await expectRefused(
        path,
        () => ws.resources.create(name, type, params as never),
        error,
      );
    });

    // The check lives in one place (resource-object.ts); a few types show it.
    it.each(validationTypes)(
      'when the %s identifier has characters it may not',
      async (type) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => ws.resources.create('new-ööö', type, newParams[type] as never),
          /Resource identifier must follow naming rules/,
        );
      },
    );

    it.each(validationTypes)(
      'when the %s prefix is not one of the project',
      async (type) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () =>
            ws.resources.create(
              `unknown/${type}/x`,
              type,
              newParams[type] as never,
            ),
          /Prefix 'unknown' is not included/,
        );
      },
    );
  });
});
