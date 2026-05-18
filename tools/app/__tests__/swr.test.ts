import { describe, it, expect } from 'vitest';
import { globalApiPaths, projectApiPaths } from '@/lib/swr';

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

    it('builds raw card path', () => {
      const paths = projectApiPaths('TST');
      expect(paths.rawCard('TST_1')).toBe(
        '/api/projects/TST/cards/TST_1?raw=true',
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

    it('builds presence path', () => {
      const paths = projectApiPaths('TST');
      expect(paths.presence('TST_1', 'editing')).toBe(
        '/api/projects/TST/cards/TST_1/presence?mode=editing',
      );
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
