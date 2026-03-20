import { expect, it, describe } from 'vitest';
import { createContextFacts } from '../../src/utils/clingo-facts.js';

const testCases = [
  { context: 'localApp' as const, expectedFact: 'localApp().\n' },
  {
    context: 'exportedSite' as const,
    expectedFact: 'exportedSite().\n',
  },
  {
    context: 'exportedDocument' as const,
    expectedFact: 'exportedDocument().\n',
  },
];
describe('clingo-facts', () => {
  it.each(testCases)(
    'should create context facts for %s',
    ({ context, expectedFact }) => {
      const contextFacts = createContextFacts(context);
      expect(contextFacts).to.equal(expectedFact);
    },
  );
});
