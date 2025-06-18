import { describe, it, expect, afterEach } from 'vitest';
import { solve, setBaseProgram, clearBaseProgram } from '../lib/index.js';

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
});
