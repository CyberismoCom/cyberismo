import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  solve,
  setProgram,
  removeAllPrograms,
  removeProgram,
  buildProgram,
} from '../lib/index.js';

describe('Clingo solver', () => {
  afterEach(() => {
    // Reset all base programs after each test
    removeAllPrograms();
  });

  it('should solve a simple logic program', async () => {
    const program = 'a. b. c(1). c(2).';
    const result = await solve(program);

    expect(result).toBeDefined();
    expect(result.answers).toBeInstanceOf(Array);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.stats).toBeDefined();
  });
  // TODO: could consider c++ tests so that we can test the cache directly
  it('should return stats object', async () => {
    const program = 'a. b. c(1). c(3).';
    const result = await solve(program);
    const result2 = await solve(program);

    expect(result.stats).toBeDefined();
    expect(result.stats.glue).toBeGreaterThanOrEqual(0);
    expect(result.stats.add).toBeGreaterThanOrEqual(0);
    expect(result.stats.ground).toBeGreaterThanOrEqual(0);
    expect(result.stats.solve).toBeGreaterThanOrEqual(0);
    // First solve does not hit cache
    expect(result.stats.cacheHit).toBe(false);

    // second solve uses cache
    expect(result2.stats).toBeDefined();
    expect(result2.stats.cacheHit).toBe(true);

    expect(result2.stats.glue).toBeGreaterThanOrEqual(0);
    expect(result2.stats.add).toBe(0);
    expect(result2.stats.ground).toBe(0);
    expect(result2.stats.solve).toBe(0);
  });

  it('should reuse default base program across multiple solves', async () => {
    // Set base program once
    const baseProgram = 'common(value).';
    setProgram('base', baseProgram);

    // First solve
    const result1 = await solve('a.', ['base']);
    expect(result1.answers[0]).toContain('common(value)');
    expect(result1.answers[0]).toContain('a');

    // Second solve with different program
    const result2 = await solve('b.', ['base']);
    expect(result2.answers[0]).toContain('common(value)');
    expect(result2.answers[0]).toContain('b');

    // Third solve with different program
    const result3 = await solve('c.', ['base']);
    expect(result3.answers[0]).toContain('common(value)');
    expect(result3.answers[0]).toContain('c');
  });

  describe('Named base programs', () => {
    it('should use a specified named base program', async () => {
      setProgram('query', 'type(query).');
      setProgram('graph', 'type(graph).');

      // Use query base program
      const result1 = await solve('valid :- type(query).', ['query']);
      expect(result1.answers[0]).toContain('valid');
      expect(result1.answers[0]).toContain('type(query)');
      expect(result1.answers[0]).not.toContain('type(graph)');

      // Use graph base program
      const result2 = await solve('valid :- type(graph).', ['graph']);
      expect(result2.answers[0]).toContain('valid');
      expect(result2.answers[0]).toContain('type(graph)');
      expect(result2.answers[0]).not.toContain('type(query)');
    });

    it('should work with category ids', async () => {
      setProgram('query', 'type(query).', ['ref']);
      const result1 = await solve('valid :- type(query).', ['ref']);
      expect(result1.answers[0]).toContain('valid');
      expect(result1.answers[0]).toContain('type(query)');
    });

    it('should work with multiple refs', async () => {
      setProgram('query', 'type(query).', ['ref']);
      setProgram('graph', 'type(graph).', ['ref']);
      setProgram('base', 'base(base).', ['ref']);
      const result1 = await solve('valid :- type(query), base(base).', ['ref']);
      expect(result1.answers[0]).toContain('valid');
      expect(result1.answers[0]).toContain('type(query)');
      expect(result1.answers[0]).toContain('base(base)');
    });

    it('should combine multiple base programs', async () => {
      setProgram('colors', 'color(red).');
      setProgram('shapes', 'shape(circle).');
      setProgram('sizes', 'size(large).');

      // Combine multiple base programs
      const result = await solve('valid :- color(X), shape(Y), size(Z).', [
        'colors',
        'shapes',
        'sizes',
      ]);

      expect(result.answers[0]).toContain('valid');
      expect(result.answers[0]).toContain('color(red)');
      expect(result.answers[0]).toContain('shape(circle)');
      expect(result.answers[0]).toContain('size(large)');
    });

    it('should handle non-existent base program gracefully', async () => {
      // Solve with non-existent base program
      const result = await solve('a.', ['non_existent']);

      // Should still solve normally
      expect(result.answers[0]).toBe('a');
    });
  });
  it('should handle errors', async () => {
    await expect(solve('not a program', ['non_existent'])).rejects.toThrow();
  });
  it('should include errors and warnings in the result', async () => {
    try {
      await solve('causes syn t4x error,');
      expect.fail('Expected solve to throw an error');
    } catch (error: unknown) {
      expect(error).toBeDefined();

      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        'details' in error
      ) {
        const clingoError = error as {
          message: string;
          details: { errors: string[]; warnings: string[] };
        };
        expect(clingoError.message).toContain('Parsing failed');

        // Verify the error has details with errors and warnings
        expect(clingoError.details).toBeDefined();
        expect(clingoError.details.errors).toBeInstanceOf(Array);
        expect(clingoError.details.warnings).toBeInstanceOf(Array);

        // Verify there's at least one error (syntax error)
        expect(clingoError.details.errors.length).toBeGreaterThan(0);
        expect(clingoError.details.errors[0]).toContain('syntax error');
        expect(clingoError.details.errors[0]).toContain('unexpected');
      } else {
        throw new Error('Error does not have expected structure');
      }
    }
  });

  describe('Resource parsing functions', () => {
    beforeEach(() => {
      // Set up a base program that shows common result predicates
      const showResultsProgram = `
        #show result/1.
        #show result1/1.
        #show result2/1.
        #show result3/1.
      `;
      setProgram('show_results', showResultsProgram);
    });
    it('should extract prefix from valid resource names', async () => {
      const program = `
        result(@resourcePrefix("base/fieldTypes/owner")).
        result2(@resourcePrefix("local/cardTypes/task")).
        result3(@resourcePrefix("system/workflows/review")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result("base")');
      expect(result.answers[0]).toContain('result2("local")');
      expect(result.answers[0]).toContain('result3("system")');
    });

    it('should extract type from valid resource names', async () => {
      const program = `
        result(@resourceType("base/fieldTypes/owner")).
        result2(@resourceType("local/cardTypes/task")).
        result3(@resourceType("system/workflows/review")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result("fieldTypes")');
      expect(result.answers[0]).toContain('result2("cardTypes")');
      expect(result.answers[0]).toContain('result3("workflows")');
    });

    it('should extract identifier from valid resource names', async () => {
      const program = `
        result(@resourceIdentifier("base/fieldTypes/owner")).
        result2(@resourceIdentifier("local/cardTypes/task")).
        result3(@resourceIdentifier("system/workflows/review")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result("owner")');
      expect(result.answers[0]).toContain('result2("task")');
      expect(result.answers[0]).toContain('result3("review")');
    });

    it('should return empty string for invalid resource names with no slashes', async () => {
      const program = `
        result1(@resourcePrefix("invalidname")).
        result2(@resourceType("invalidname")).
        result3(@resourceIdentifier("invalidname")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("")');
      expect(result.answers[0]).toContain('result2("")');
      expect(result.answers[0]).toContain('result3("")');
    });

    it('should return empty string for invalid resource names with only one slash', async () => {
      const program = `
        result1(@resourcePrefix("base/owner")).
        result2(@resourceType("base/owner")).
        result3(@resourceIdentifier("base/owner")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("")');
      expect(result.answers[0]).toContain('result2("")');
      expect(result.answers[0]).toContain('result3("")');
    });

    it('should return empty string for invalid resource names with too many slashes', async () => {
      const program = `
        result1(@resourcePrefix("base/fieldTypes/owner/extra")).
        result2(@resourceType("base/fieldTypes/owner/extra")).
        result3(@resourceIdentifier("base/fieldTypes/owner/extra")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("")');
      expect(result.answers[0]).toContain('result2("")');
      expect(result.answers[0]).toContain('result3("")');
    });

    it('should return empty string for empty input', async () => {
      const program = `
        result1(@resourcePrefix("")).
        result2(@resourceType("")).
        result3(@resourceIdentifier("")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("")');
      expect(result.answers[0]).toContain('result2("")');
      expect(result.answers[0]).toContain('result3("")');
    });

    it('should return empty string for non-string inputs', async () => {
      const program = `
        result1(@resourcePrefix(123)).
        result2(@resourceType(456)).
        result3(@resourceIdentifier(789)).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("")');
      expect(result.answers[0]).toContain('result2("")');
      expect(result.answers[0]).toContain('result3("")');
    });

    it('should handle edge cases with special characters', async () => {
      const program = `
        result1(@resourcePrefix("base-123/field_types/owner-name")).
        result2(@resourceType("base-123/field_types/owner-name")).
        result3(@resourceIdentifier("base-123/field_types/owner-name")).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("base-123")');
      expect(result.answers[0]).toContain('result2("field_types")');
      expect(result.answers[0]).toContain('result3("owner-name")');
    });

    it('should work in combination with other functions', async () => {
      const program = `
        resource("base/fieldTypes/owner").
        result1(@resourcePrefix(R)) :- resource(R).
        result2(@concatenate(@resourcePrefix("base/fieldTypes/owner"), "/", @resourceType("base/fieldTypes/owner"))).
      `;
      const result = await solve(program, ['show_results']);

      expect(result.answers[0]).toContain('result1("base")');
      expect(result.answers[0]).toContain('result2("base/fieldTypes")');
    });
  });

  describe('Single program removal', () => {
    it('should remove a specific program by key', async () => {
      // Set up programs
      setProgram('remove_me', 'fact(remove).', ['test']);
      setProgram('keep_me', 'fact(keep).', ['test']);

      // Verify both programs work initially
      const initialResult = await solve('test :- fact(remove), fact(keep).', [
        'remove_me',
        'keep_me',
      ]);
      expect(initialResult.answers[0]).toContain('test');

      // Remove one program
      const removed = removeProgram('remove_me');
      expect(removed).toBe(true);

      // Verify the kept program still works
      const afterRemoval = await solve('test :- fact(keep).', ['keep_me']);
      expect(afterRemoval.answers[0]).toContain('test');
      expect(afterRemoval.answers[0]).toContain('fact(keep)');

      // Verify the removed program is no longer available
      const withoutRemoved = await solve('a.', ['remove_me']);
      expect(withoutRemoved.answers[0]).toBe('a'); // Only main program result
    });

    it('should handle removing non-existent program gracefully', async () => {
      // Set up one program
      setProgram('exists', 'fact(exists).', []);

      // Try to remove non-existent program (should not throw)
      const removed = removeProgram('does_not_exist');
      expect(removed).toBe(false);

      // Existing program should still be there
      const result = await solve('test :- fact(exists).', ['exists']);
      expect(result.answers[0]).toContain('test');
    });

    it('should handle removing from empty program store', () => {
      // No programs set up, try to remove something
      const removed = removeProgram('anything');
      expect(removed).toBe(false);
    });

    it('should remove program with specific key while keeping others with same categories', async () => {
      // Set up programs with same categories but different keys
      setProgram('base1', 'type(base1).', ['common']);
      setProgram('base2', 'type(base2).', ['common']);
      setProgram('base3', 'type(base3).', ['common']);

      // Remove specific program
      const removed = removeProgram('base2');
      expect(removed).toBe(true);

      // Other programs with same category should still work
      const result = await solve('test :- type(base1), type(base3).', [
        'common',
      ]);
      expect(result.answers[0]).toContain('test');
      expect(result.answers[0]).toContain('type(base1)');
      expect(result.answers[0]).toContain('type(base3)');
      expect(result.answers[0]).not.toContain('type(base2)');
    });

    it('should work with programs that have no categories', async () => {
      setProgram('no_categories', 'fact(no_categories).', []);
      setProgram('with_categories', 'fact(with_categories).', ['category']);

      // Remove the program without categories
      const removed = removeProgram('no_categories');
      expect(removed).toBe(true);

      // Program with categories should still work
      const result = await solve('test :- fact(with_categories).', [
        'with_categories',
      ]);
      expect(result.answers[0]).toContain('test');

      // Program without categories should be gone
      const result2 = await solve('a.', ['no_categories']);
      expect(result2.answers[0]).toBe('a');
    });

    it('should return correct boolean values for removal attempts', () => {
      setProgram('exists', 'fact(exists).', []);

      // First removal should return true
      const firstRemove = removeProgram('exists');
      expect(firstRemove).toBe(true);

      // Second removal of same program should return false
      const secondRemove = removeProgram('exists');
      expect(secondRemove).toBe(false);

      // Removing non-existent program should return false
      const nonExistentRemove = removeProgram('never_existed');
      expect(nonExistentRemove).toBe(false);
    });
  });

  describe('Remove all programs', () => {
    it('should remove all stored programs', async () => {
      // Set up multiple programs with different configurations
      setProgram('program1', 'fact(1).', ['flag1']);
      setProgram('program2', 'fact(2).', ['flag2', 'flag3']);
      setProgram('program3', 'fact(3).', []);
      setProgram('program4', 'fact(4).', ['flag1', 'flag4']);

      // Verify programs work initially
      const initialResult = await solve('test :- fact(1).', ['program1']);
      expect(initialResult.answers[0]).toContain('test');

      // Remove all programs
      removeAllPrograms();

      // All programs should be gone - solve should work with empty refs
      const afterClear1 = await solve('a.', ['program1']);
      expect(afterClear1.answers[0]).toBe('a');

      const afterClear2 = await solve('b.', ['flag1']);
      expect(afterClear2.answers[0]).toBe('b');

      const afterClear3 = await solve('c.', ['program3']);
      expect(afterClear3.answers[0]).toBe('c');
    });

    it('should work when no programs are stored', () => {
      // Call removeAllPrograms when no programs exist
      removeAllPrograms();
    });

    it('should return true indicating successful operation', () => {
      setProgram('test', 'fact(test).', []);
      removeAllPrograms();
    });

    it('should be safe to call multiple times', () => {
      setProgram('test', 'fact(test).', []);

      // Call multiple times
      removeAllPrograms();
      removeAllPrograms();
      removeAllPrograms();
    });
  });

  describe('buildProgram function', () => {
    it('should return just the main program when no base programs are specified', () => {
      const mainProgram = 'a. b. c(1).';
      const result = buildProgram(mainProgram);

      expect(result).toContain('% Main program');
      expect(result).toContain(mainProgram);
      expect(result).not.toContain('% Program:');
    });

    it('should combine main program with a single base program', () => {
      setProgram('base', 'base_fact(value).');

      const mainProgram = 'main_fact.';
      const result = buildProgram(mainProgram, ['base']);

      expect(result).toContain('% Program: base');
      expect(result).toContain('base_fact(value).');
      expect(result).toContain('% Main program');
      expect(result).toContain('main_fact.');

      // Base program should come before main program
      const baseIndex = result.indexOf('base_fact(value)');
      const mainIndex = result.indexOf('main_fact.');
      expect(baseIndex).toBeLessThan(mainIndex);
    });

    it('should combine main program with multiple base programs', () => {
      setProgram('colors', 'color(red). color(blue).');
      setProgram('shapes', 'shape(circle). shape(square).');
      setProgram('sizes', 'size(small). size(large).');

      const mainProgram = 'valid :- color(X), shape(Y), size(Z).';
      const result = buildProgram(mainProgram, ['colors', 'shapes', 'sizes']);

      expect(result).toContain('% Program: colors');
      expect(result).toContain('color(red). color(blue).');
      expect(result).toContain('% Program: shapes');
      expect(result).toContain('shape(circle). shape(square).');
      expect(result).toContain('% Program: sizes');
      expect(result).toContain('size(small). size(large).');
      expect(result).toContain('% Main program');
      expect(result).toContain(mainProgram);
    });

    it('should work with category-based program inclusion', () => {
      setProgram('query_rules', 'type(query).', ['query']);
      setProgram('graph_rules', 'type(graph).', ['query']);
      setProgram('base_rules', 'base(fact).', ['base']);

      const mainProgram = 'valid :- type(X), base(Y).';
      const result = buildProgram(mainProgram, ['query']);

      expect(result).toContain('% Program: query_rules');
      expect(result).toContain('type(query).');
      expect(result).toContain('% Program: graph_rules');
      expect(result).toContain('type(graph).');
      expect(result).toContain('% Main program');
      expect(result).toContain(mainProgram);
      expect(result).not.toContain('base(fact).');
    });

    it('should prevent duplicate programs when using mixed refs and categories', () => {
      setProgram('common', 'common(value).', ['shared']);
      setProgram('specific', 'specific(value).', ['shared']);

      const mainProgram = 'test.';
      const result = buildProgram(mainProgram, ['common', 'shared']);

      // 'common' should appear only once, even though it matches both direct ref and category
      const commonMatches = (result.match(/common\(value\)/g) || []).length;
      expect(commonMatches).toBe(1);

      // 'specific' should appear once from category match
      expect(result).toContain('specific(value)');
    });

    it('should handle non-existent program references gracefully', () => {
      setProgram('exists', 'exists(fact).');

      const mainProgram = 'main.';
      const result = buildProgram(mainProgram, [
        'exists',
        'non_existent',
        'also_missing',
      ]);

      expect(result).toContain('% Program: exists');
      expect(result).toContain('exists(fact).');
      expect(result).toContain('% Main program');
      expect(result).toContain('main.');
      // Non-existent programs should not appear in output
      expect(result).not.toContain('non_existent');
      expect(result).not.toContain('also_missing');
    });

    it('should handle empty categories array', () => {
      setProgram('unused', 'unused(fact).');

      const mainProgram = 'only_main.';
      const result = buildProgram(mainProgram, []);

      expect(result).toContain('% Main program');
      expect(result).toContain('only_main.');
      expect(result).not.toContain('unused(fact)');
    });

    it('should handle programs with categories that have multiple programs', () => {
      setProgram('rule1', 'type(a).', ['group']);
      setProgram('rule2', 'type(b).', ['group']);
      setProgram('rule3', 'type(c).', ['group']);
      setProgram('other', 'other(fact).', ['different']);

      const mainProgram = 'collect :- type(X).';
      const result = buildProgram(mainProgram, ['group']);

      expect(result).toContain('% Program: rule1');
      expect(result).toContain('type(a).');
      expect(result).toContain('% Program: rule2');
      expect(result).toContain('type(b).');
      expect(result).toContain('% Program: rule3');
      expect(result).toContain('type(c).');
      expect(result).not.toContain('other(fact)');
    });

    it('should throw TypeError for invalid arguments', () => {
      // @ts-expect-error Testing invalid argument type
      expect(() => buildProgram('test', 'not_an_array')).toThrow(
        'Second argument must be an array of strings (refs)',
      );
      // @ts-expect-error Testing invalid argument type
      expect(() => buildProgram('test', ['valid', 123, 'also_valid'])).toThrow(
        'All refs must be strings',
      );
    });
  });
});
