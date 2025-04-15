import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { solve, setBaseProgram } from '../lib/index.js';

describe('Clingo solver', () => {
  afterEach(() => {
    // Reset base program after each test
    setBaseProgram('');
  });

  it('should solve a simple logic program', async () => {
    const program = 'a. b. c(1). c(2).';
    const result = await solve(program);
    console.log(result);

    expect(result).toBeDefined();
    expect(result.answers).toBeInstanceOf(Array);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.executionTime).toBeGreaterThan(0);
  });

  it('should use the base program when solving', async () => {
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

  it('should reuse base program across multiple solves', async () => {
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
});
