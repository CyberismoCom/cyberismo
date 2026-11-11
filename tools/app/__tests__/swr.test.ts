// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from 'vitest';
import {
  ApiCallError,
  blockingError,
  globalApiPaths,
  projectApiPaths,
} from '@/lib/swr';

describe('globalApiPaths', () => {
  it('returns /api/projects for projects()', () => {
    expect(globalApiPaths.projects()).toBe('/api/projects');
  });

  it('returns /api/auth/me for user()', () => {
    expect(globalApiPaths.user()).toBe('/api/auth/me');
  });
});

describe('projectApiPaths', () => {
  describe('with explicit prefix', () => {
    it('builds correct base path', () => {
      const paths = projectApiPaths('TST');
      expect(paths.cards()).toBe('/api/projects/TST/cards');
    });

    it('encodes special characters in prefix', () => {
      const paths = projectApiPaths('my project');
      expect(paths.cards()).toBe('/api/projects/my%20project/cards');
    });

    it('builds card path with key', () => {
      const paths = projectApiPaths('TST');
      expect(paths.card('TST_1')).toBe('/api/projects/TST/cards/TST_1');
    });

    it('keeps a card key inside the cards path', () => {
      const paths = projectApiPaths('TST');
      expect(paths.card('../../x')).toBe('/api/projects/TST/cards/..%2F..%2Fx');
      expect(paths.cardContent('a/b')).toBe(
        '/api/projects/TST/cards/a%2Fb/content',
      );
      expect(paths.cardSource('a/b')).toBe(
        '/api/projects/TST/cards/a%2Fb/source',
      );
    });

    it('builds attachment path with encoding', () => {
      const paths = projectApiPaths('TST');
      expect(paths.attachment('TST_1', 'my file.png')).toBe(
        '/api/projects/TST/cards/TST_1/a/my%20file.png',
      );
    });

    it('builds cardTypeFieldVisibility path with encoding', () => {
      const paths = projectApiPaths('TST');
      expect(paths.cardTypeFieldVisibility('my/type')).toBe(
        '/api/projects/TST/cardTypes/my%2Ftype/field-visibility',
      );
    });

    it('builds project event paths', () => {
      const paths = projectApiPaths('TST');
      expect(paths.events()).toBe('/api/projects/TST/events');
      expect(paths.presence()).toBe('/api/projects/TST/events/presence');
    });

    it('builds resource paths', () => {
      const paths = projectApiPaths('TST');
      expect(paths.resourceTree()).toBe('/api/projects/TST/resources/tree');
      expect(paths.resource('fieldTypes/myField')).toBe(
        '/api/projects/TST/resources/fieldTypes/myField',
      );
      expect(paths.resourceOperation('fieldTypes/myField')).toBe(
        '/api/projects/TST/resources/fieldTypes/myField/operation',
      );
    });

    it('builds project clean path', () => {
      const paths = projectApiPaths('TST');
      expect(paths.projectClean()).toBe('/api/projects/TST/project/clean');
    });

    it('builds project module paths', () => {
      const paths = projectApiPaths('TST');
      expect(paths.project()).toBe('/api/projects/TST/project');
      expect(paths.projectModulesAdd()).toBe(
        '/api/projects/TST/project/modules',
      );
      expect(paths.projectModulesUpdate()).toBe(
        '/api/projects/TST/project/modules/update',
      );
      expect(paths.projectModuleUpdate('my-mod')).toBe(
        '/api/projects/TST/project/modules/my-mod/update',
      );
      expect(paths.projectModuleDelete('my-mod')).toBe(
        '/api/projects/TST/project/modules/my-mod',
      );
      expect(paths.projectModulesImportable()).toBe(
        '/api/projects/TST/project/modules/importable',
      );
    });
  });

  describe('different prefixes produce different paths', () => {
    it('uses the prefix in all paths', () => {
      const pathsA = projectApiPaths('AAA');
      const pathsB = projectApiPaths('BBB');
      expect(pathsA.cards()).not.toBe(pathsB.cards());
      expect(pathsA.tree()).toBe('/api/projects/AAA/tree');
      expect(pathsB.tree()).toBe('/api/projects/BBB/tree');
    });
  });
});

describe('blockingError', () => {
  const notFound = new ApiCallError(new Response(null, { status: 404 }));
  const serverError = new ApiCallError(new Response(null, { status: 500 }));
  const network = new TypeError('Failed to fetch');

  it.each([
    ['no error', undefined, true, undefined],
    ['a failure before any data loaded', serverError, false, serverError],
    ['a failed refresh', serverError, true, undefined],
    ['a network drop during a refresh', network, true, undefined],
    ['a resource gone since it loaded', notFound, true, notFound],
  ])('%s', (_, error, hasData, expected) => {
    expect(blockingError(error, hasData)).toBe(expected);
  });
});
