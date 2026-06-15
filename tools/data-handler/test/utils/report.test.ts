import { expect, it, describe } from 'vitest';
import type { CalculationEngine } from '../../src/containers/project/calculation-engine.js';
import { generateReportContent } from '../../src/utils/report.js';

// Minimal stub of CalculationEngine that records logic program invocations.
function stubEngine() {
  const calls: string[] = [];
  const calculate = {
    runLogicProgram: async (query: string) => {
      calls.push(query);
      return { results: [], error: null };
    },
  } as unknown as CalculationEngine;
  return { calculate, calls };
}

describe('generateReportContent', () => {
  it('skips the logic program when the query template is empty', async () => {
    const { calculate, calls } = stubEngine();
    const result = await generateReportContent({
      calculate,
      contentTemplate: 'Remaining: {{subtract 100 percentage}}%',
      queryTemplate: '   \n  ',
      options: { name: 'r', percentage: 55 },
      context: 'localApp',
    });
    expect(calls).toHaveLength(0);
    expect(result).toBe('Remaining: 45%');
  });

  it('skips the logic program when the query template is undefined', async () => {
    const { calculate, calls } = stubEngine();
    const result = await generateReportContent({
      calculate,
      contentTemplate: 'Value: {{round count}}',
      queryTemplate: undefined as unknown as string,
      options: { name: 'r', count: 7 },
      context: 'localApp',
    });
    expect(calls).toHaveLength(0);
    expect(result).toBe('Value: 7');
  });

  it('runs the logic program when the query template is not empty', async () => {
    const { calculate, calls } = stubEngine();
    await generateReportContent({
      calculate,
      contentTemplate: 'done',
      queryTemplate: 'result(Card) :- card(Card).',
      options: { name: 'r' },
      context: 'localApp',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe('result(Card) :- card(Card).');
  });

  it('exposes math helpers to the query template', async () => {
    const { calculate, calls } = stubEngine();
    await generateReportContent({
      calculate,
      contentTemplate: 'done',
      queryTemplate: 'value({{add 1 2}}).',
      options: { name: 'r' },
      context: 'localApp',
    });
    expect(calls[0]).toBe('value(3).');
  });
});
