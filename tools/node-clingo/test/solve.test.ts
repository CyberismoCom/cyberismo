import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { solve, setBaseProgram, clearBaseProgram } from '../dist/index.js';

describe('Clingo solver', () => {
  afterEach(() => {
    // Reset all base programs after each test
    clearBaseProgram();
  });

  it('should solve a simple logic program', async () => {
    const program = 'a. b. c(1). c(2).';
    const result = await solve(program);

    expect(result).toBeDefined();
    expect(result.answers).toBeInstanceOf(Array);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
  });

  it('should use the default base program when solving', async () => {
    // Set up a base program
    const baseProgram = 'base(1).';
    setBaseProgram(baseProgram);

    // Solve with additional rules
    const program = 'derived :- base(X).';
    const result = await solve(program);

    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.answers[0]).toContain('derived');
    expect(result.answers[0]).toContain('base(1)');
  });

  it('should reuse default base program across multiple solves', async () => {
    // Set base program once
    const baseProgram = 'common(value).';
    setBaseProgram(baseProgram);

    // First solve
    const result1 = await solve('a.');
    expect(result1.answers[0]).toContain('common(value)');
    expect(result1.answers[0]).toContain('a');

    // Second solve with different program
    const result2 = await solve('b.');
    expect(result2.answers[0]).toContain('common(value)');
    expect(result2.answers[0]).toContain('b');

    // Third solve with different program
    const result3 = await solve('c.');
    expect(result3.answers[0]).toContain('common(value)');
    expect(result3.answers[0]).toContain('c');
  });

  describe('Named base programs', () => {
    it('should use a specified named base program', async () => {
      setBaseProgram('type(query).', 'query');
      setBaseProgram('type(graph).', 'graph');

      // Use query base program
      const result1 = await solve('valid :- type(query).', 'query');
      expect(result1.answers[0]).toContain('valid');
      expect(result1.answers[0]).toContain('type(query)');
      expect(result1.answers[0]).not.toContain('type(graph)');

      // Use graph base program
      const result2 = await solve('valid :- type(graph).', 'graph');
      expect(result2.answers[0]).toContain('valid');
      expect(result2.answers[0]).toContain('type(graph)');
      expect(result2.answers[0]).not.toContain('type(query)');
    });

    it('should combine multiple base programs', async () => {
      setBaseProgram('color(red).', 'colors');
      setBaseProgram('shape(circle).', 'shapes');
      setBaseProgram('size(large).', 'sizes');

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
      const result = await solve('a.', 'non_existent');

      // Should still solve normally
      expect(result.answers[0]).toBe('a');
    });
  });
  it('should handle errors', async () => {
    await expect(solve('not a program', 'non_existent')).rejects.toThrow();
  });
  it('should include errors and warnings in the result', async () => {
    try {
      await solve('causes syn t4x error,');
      expect.fail('Expected solve to throw an error');
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error.message).toBe('parsing failed');

      // Verify the error has details with errors and warnings
      expect(error.details).toBeDefined();
      expect(error.details.errors).toBeInstanceOf(Array);
      expect(error.details.warnings).toBeInstanceOf(Array);

      // Verify there's at least one error (syntax error)
      expect(error.details.errors.length).toBeGreaterThan(0);
      expect(error.details.errors[0]).toContain('syntax error');
      expect(error.details.errors[0]).toContain('unexpected');
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
      setBaseProgram(showResultsProgram, 'show_results');
    });
    it('should extract prefix from valid resource names', async () => {
      const program = `
        result(@resourcePrefix("base/fieldTypes/owner")).
        result2(@resourcePrefix("local/cardTypes/task")).  
        result3(@resourcePrefix("system/workflows/review")).
      `;
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

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
      const result = await solve(program, 'show_results');

      expect(result.answers[0]).toContain('result1("base")');
      expect(result.answers[0]).toContain('result2("base/fieldTypes")');
    });
  });
});
