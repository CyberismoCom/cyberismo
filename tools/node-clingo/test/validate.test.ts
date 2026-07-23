import { describe, expect, it } from 'vitest';
import { ClingoContext, validateProgram } from '../lib/index.js';

describe('validateProgram', () => {
  it('accepts a valid program', () => {
    const result = validateProgram('fact(1). derived(X) :- fact(X).');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts an empty program', () => {
    expect(validateProgram('').valid).toBe(true);
  });

  it('accepts a comment-only program', () => {
    expect(validateProgram('% just a comment').valid).toBe(true);
  });

  it('rejects a syntax error with diagnostics', () => {
    const result = validateProgram('fact(1');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join('\n')).toContain('syntax error');
  });

  it('rejects unsafe variables', () => {
    const result = validateProgram('result(X) :- other(Y).');
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('unsafe variables');
  });

  it('reports diagnostics with line information', () => {
    // Error must occur mid-file: an unterminated program reports its
    // syntax error at EOF, one line past the last input line.
    const result = validateProgram('fact(1).\nbroken(:- x.\nother(2).');
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/2:\d+/);
  });

  it('does not interfere with concurrent solves', async () => {
    const ctx = new ClingoContext();
    ctx.setProgram('p', 'a(1..100).', ['all']);
    const solves = Array.from({ length: 5 }, () =>
      ctx.solve('b(X) :- a(X).', ['all']),
    );
    for (let i = 0; i < 50; i++) {
      validateProgram('c(X) :- a(X), X > 1.');
      validateProgram('broken(');
      // setProgram pre-parses on the main thread while solves are in flight
      ctx.setProgram(`scratch${i}`, `d(${i}).`, ['scratch']);
    }
    const results = await Promise.all(solves);
    for (const r of results) {
      expect(r.answers.length).toBeGreaterThan(0);
    }
  });
});
