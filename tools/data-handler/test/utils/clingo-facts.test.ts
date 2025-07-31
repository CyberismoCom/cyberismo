import { expect } from 'chai';
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

describe('createContextFacts', () => {
  for (const { context, expectedFact } of testCases) {
    it(`should create context fact for ${context}`, () => {
      const contextFacts = createContextFacts(context);
      expect(contextFacts).to.equal(expectedFact);
    });
  }
});
