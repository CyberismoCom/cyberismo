import { expect, it, describe } from 'vitest';
import {
  createContextFacts,
  createWorkflowFacts,
} from '../../src/utils/clingo-facts.js';
import {
  WorkflowCategory,
  type Workflow,
} from '../../src/interfaces/resource-interfaces.js';

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

  describe('createWorkflowFacts', () => {
    it('emits workflowState with the declared category', () => {
      const workflow: Workflow = {
        name: 'mod/workflows/wf',
        displayName: 'wf',
        states: [{ name: 'Draft', category: WorkflowCategory.initial }],
        transitions: [],
      };

      expect(createWorkflowFacts(workflow)).toContain(
        'workflowState("mod/workflows/wf", "Draft", "initial").',
      );
    });

    it('falls back to "none" when category is missing', () => {
      const workflow: Workflow = {
        name: 'mod/workflows/wf',
        displayName: 'wf',
        states: [{ name: 'Draft' }],
        transitions: [],
      };

      expect(createWorkflowFacts(workflow)).toContain(
        'workflowState("mod/workflows/wf", "Draft", "none").',
      );
    });
  });
});
