import { expect, it, describe, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  createCalculatedFieldRules,
  createCardFacts,
  createCardTypeFacts,
  createContextFacts,
  createSkillFacts,
  createWorkflowFacts,
} from '../../src/utils/clingo-facts.js';
import {
  WorkflowCategory,
  type CardType,
  type SkillMetadata,
  type Workflow,
} from '../../src/interfaces/resource-interfaces.js';
import type { Card } from '../../src/index.js';
import type { Project } from '../../src/containers/project.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { getTestProject } from '../helpers/test-utils.js';

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

  describe('createCardTypeFacts', () => {
    const base: CardType = {
      name: 'mod/cardTypes/ct',
      displayName: 'ct',
      workflow: 'mod/workflows/wf',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    };

    it('emits overridableField for calculated fields with enableOverride', () => {
      const cardType: CardType = {
        ...base,
        customFields: [
          {
            name: 'mod/fieldTypes/owner',
            isCalculated: true,
            enableOverride: true,
          },
        ],
      };
      const facts = createCardTypeFacts(cardType);
      expect(facts).toContain(
        'calculatedField("mod/cardTypes/ct", "mod/fieldTypes/owner").',
      );
      expect(facts).toContain(
        'overridableField("mod/cardTypes/ct", "mod/fieldTypes/owner").',
      );
    });

    it('does not emit overridableField without enableOverride', () => {
      const cardType: CardType = {
        ...base,
        customFields: [{ name: 'mod/fieldTypes/owner', isCalculated: true }],
      };
      expect(createCardTypeFacts(cardType)).not.toContain('overridableField(');
    });

    it('does not emit overridableField for non-calculated fields', () => {
      const cardType: CardType = {
        ...base,
        customFields: [
          {
            name: 'mod/fieldTypes/owner',
            isCalculated: false,
            enableOverride: true,
          },
        ],
      };
      expect(createCardTypeFacts(cardType)).not.toContain('overridableField(');
    });
  });

  describe('createCalculatedFieldRules', () => {
    const base: CardType = {
      name: 'mod/cardTypes/ct',
      displayName: 'ct',
      workflow: 'mod/workflows/wf',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    };

    it('binds the field name as a constant in every literal', () => {
      const cardType: CardType = {
        ...base,
        customFields: [
          {
            name: 'mod/fieldTypes/owner',
            isCalculated: true,
            enableOverride: true,
          },
        ],
      };

      expect(createCalculatedFieldRules([cardType])).to.equal(
        `field(Card, "mod/fieldTypes/owner", Value) :-
    fieldCalculated(Card, "mod/fieldTypes/owner", Value),
    field(Card, "cardType", CardType),
    calculatedField(CardType, "mod/fieldTypes/owner"),
    not fieldOverride(Card, "mod/fieldTypes/owner", _).
`,
      );
    });

    it('emits one rule per field name, regardless of how many card types declare it', () => {
      const customFields = [
        { name: 'mod/fieldTypes/owner', isCalculated: true },
      ];
      const rules = createCalculatedFieldRules([
        { ...base, name: 'mod/cardTypes/a', customFields },
        { ...base, name: 'mod/cardTypes/b', customFields },
      ]);

      expect(rules.match(/^field\(Card, /gm)).to.have.length(1);
    });

    it('sorts the rules so the program is stable across runs', () => {
      const rules = createCalculatedFieldRules([
        {
          ...base,
          customFields: [
            { name: 'mod/fieldTypes/owner', isCalculated: true },
            { name: 'mod/fieldTypes/assessment', isCalculated: true },
          ],
        },
      ]);

      expect(rules.indexOf('mod/fieldTypes/assessment')).to.be.lessThan(
        rules.indexOf('mod/fieldTypes/owner'),
      );
    });

    it('skips custom fields that are not calculated', () => {
      const cardType: CardType = {
        ...base,
        customFields: [
          { name: 'mod/fieldTypes/owner', isCalculated: false },
          { name: 'mod/fieldTypes/notes' },
        ],
      };

      expect(createCalculatedFieldRules([cardType])).to.equal('');
    });

    it('returns an empty program when there are no card types', () => {
      expect(createCalculatedFieldRules([])).to.equal('');
    });

    it('encodes characters that would break the clingo string', () => {
      const cardType: CardType = {
        ...base,
        customFields: [{ name: 'mod/fieldTypes/"odd"', isCalculated: true }],
      };

      expect(createCalculatedFieldRules([cardType])).toContain(
        'field(Card, "mod/fieldTypes/\\"odd\\"", Value) :-',
      );
    });
  });
});

describe('createCardFacts only emits fields the card type declares', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-declared-fields-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  const CARD_KEY = 'decision_6';
  // Declared by the decision card type until the setup below drops it; its
  // field type resource stays in place.
  const UNDECLARED_FIELD = 'decision/fieldTypes/numberOfCommits';
  // Neither declared by the card type nor backed by a field type resource.
  const GHOST_FIELD = 'decision/fieldTypes/ghost';
  // Stays declared by the card type, but its field type resource is deleted.
  const DELETED_TYPE_FIELD = 'decision/fieldTypes/responsible';
  // Declared by the card type, with its field type resource intact.
  const DECLARED_FIELD = 'decision/fieldTypes/commitDescription';
  // Card whose card type resource does not exist, so nothing can be classified
  // as declared or dormant.
  const BROKEN_CARD_TYPE_CARD_KEY = 'decision_5';
  let project: Project;
  let card: Card;
  let brokenCardTypeCard: Card;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);

    const cardTypePath = join(
      projectPath,
      '.cards/local/cardTypes/decision.json',
    );
    const cardType = JSON.parse(readFileSync(cardTypePath, 'utf-8'));
    cardType.customFields = cardType.customFields.filter(
      (f: { name: string }) => f.name !== UNDECLARED_FIELD,
    );
    writeFileSync(cardTypePath, JSON.stringify(cardType, null, 4));

    rmSync(join(projectPath, '.cards/local/fieldTypes/responsible.json'));

    const cardJsonPath = join(
      projectPath,
      `cardRoot/decision_5/c/${CARD_KEY}/index.json`,
    );
    const metadata = JSON.parse(readFileSync(cardJsonPath, 'utf-8'));
    metadata[UNDECLARED_FIELD] = 12;
    metadata[GHOST_FIELD] = 'stale';
    metadata[DELETED_TYPE_FIELD] = 'Jane Doe';
    metadata[DECLARED_FIELD] = 'Rewrote the decision';
    writeFileSync(cardJsonPath, JSON.stringify(metadata, null, 4));

    const brokenCardJsonPath = join(
      projectPath,
      `cardRoot/${BROKEN_CARD_TYPE_CARD_KEY}/index.json`,
    );
    const brokenMetadata = JSON.parse(
      readFileSync(brokenCardJsonPath, 'utf-8'),
    );
    brokenMetadata.cardType = 'decision/cardTypes/ghostType';
    brokenMetadata[DECLARED_FIELD] = 'Kept as a plain field';
    writeFileSync(brokenCardJsonPath, JSON.stringify(brokenMetadata, null, 4));

    project = getTestProject(projectPath);
    await project.populateCaches();
    card = await project.findCard(CARD_KEY);
    brokenCardTypeCard = await project.findCard(BROKEN_CARD_TYPE_CARD_KEY);
  });

  afterAll(() => {
    project?.dispose();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('metadata key not declared by the card type emits no fact', async () => {
    const facts = await createCardFacts(card, project);
    expect(facts).not.toContain(UNDECLARED_FIELD);
  });

  it('undeclared key is dropped before its field type is looked up', async () => {
    const facts = await createCardFacts(card, project);
    expect(facts).not.toContain(GHOST_FIELD);
  });

  it('declared field whose field type was deleted is skipped, not thrown on', async () => {
    const facts = await createCardFacts(card, project);
    expect(facts).not.toContain(DELETED_TYPE_FIELD);
  });

  it('declared field with a resolvable field type still emits a fact', async () => {
    const facts = await createCardFacts(card, project);
    expect(facts).toContain(
      `field(${CARD_KEY}, "${DECLARED_FIELD}", "Rewrote the decision").`,
    );
  });

  it('unresolvable card type falls back to plain field facts for stored values', async () => {
    const facts = await createCardFacts(brokenCardTypeCard, project);
    expect(facts).toContain(
      `field(${BROKEN_CARD_TYPE_CARD_KEY}, "${DECLARED_FIELD}", "Kept as a plain field").`,
    );
  });
});
