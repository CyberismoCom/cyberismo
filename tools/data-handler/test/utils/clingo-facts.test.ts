import { expect, it, describe } from 'vitest';
import {
  createContextFacts,
  createSkillFacts,
  createWorkflowFacts,
} from '../../src/utils/clingo-facts.js';
import {
  WorkflowCategory,
  type SkillMetadata,
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

  describe('createSkillFacts', () => {
    it('emits one skillRelatedTool fact per related tool', () => {
      const skill: SkillMetadata = {
        name: 'mod/skills/risk',
        displayName: 'Risk',
        relatedTools: ['search_cards', 'create_card'],
      };

      const facts = createSkillFacts(skill);
      expect(facts).toContain(
        'skillRelatedTool("mod/skills/risk", "search_cards").',
      );
      expect(facts).toContain(
        'skillRelatedTool("mod/skills/risk", "create_card").',
      );
    });

    it('emits no skillRelatedTool facts when relatedTools is empty', () => {
      const skill: SkillMetadata = {
        name: 'mod/skills/risk',
        displayName: 'Risk',
        relatedTools: [],
      };

      expect(createSkillFacts(skill)).not.toContain('skillRelatedTool(');
    });
  });
});
