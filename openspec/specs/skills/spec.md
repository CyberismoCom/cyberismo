# skills Specification

## Purpose

A skill is a project resource that holds instructions for an AI assistant working in the project. Logic programs decide when a skill is enabled, and its instructions are rendered from a query. This capability covers the skill resource, enabling, listing, looking up and previewing skills. Which skills the named query `enabledSkills` returns is specified in `logic/queries`; the tools and prompts that expose skills to an assistant are in `mcp/tools`; installing the bootstrap skill is in `cli/project-commands`; creating, editing and removing resources in general is in `resources`.

## Requirements

### Requirement: A skill requires a name, a display name and related tools

A skill SHALL have a name, a display name and a list of related tools, which MAY be empty, and MAY have a description and a category; it MUST NOT have other properties.

Source: both, jira (INTDEV-1237, INTDEV-1333)

#### Scenario: New skill has no related tools

- **GIVEN** the project prefix `test`
- **WHEN** the skill `test/skills/guide` is created without content
- **THEN** showing it returns an empty list of related tools

#### Scenario: Skill with an unknown property

- **GIVEN** the project prefix `test`
- **WHEN** the skill `test/skills/guide` is created from content that has the property `color`
- **THEN** the creation is refused with an error naming the property color

### Requirement: Related tools can be added

A tool name SHALL be appended to the related tools of a skill when it is added, and adding a tool that is already listed MUST be refused.

Source: both

#### Scenario: Add two tools

- **GIVEN** the skill `test/skills/guide` with no related tools
- **WHEN** the tools `query_cards` and `update_card` are added
- **THEN** the related tools are `query_cards` and `update_card` in that order

#### Scenario: Duplicate tool

- **GIVEN** the skill `test/skills/guide` with the related tool `query_cards`
- **WHEN** `query_cards` is added again
- **THEN** the change is refused with an error saying the tool already exists
- **AND** the related tools are still `query_cards`

### Requirement: Related tools can be changed and removed

A related tool of a skill SHALL be replaceable by another name and removable.

Source: code

#### Scenario: Change and remove

- **GIVEN** the skill `test/skills/guide` with the related tools `query_cards` and `update_card`
- **WHEN** `query_cards` is changed to `create_card` and `update_card` is removed
- **THEN** the related tools are `create_card`

### Requirement: A skill has an instruction file and a query file

A skill SHALL hold instructions as a template and a query, each of which can be read and changed as the content of the skill.

Source: both

#### Scenario: Instructions changed

- **GIVEN** the skill `test/skills/guide`
- **WHEN** its instructions are changed to `% changed`
- **THEN** showing `test/skills/guide` returns the instructions `% changed`

### Requirement: Instructions are rendered from the query results

The instructions of a skill SHALL be rendered as a template with the results of the skill's query as `results`.

Source: both

#### Scenario: Query result in the instructions

- **GIVEN** a skill whose query is `result(decision_5).` and whose instructions are `{{#each results}}Found {{key}}.{{/each}}`
- **WHEN** the instructions are previewed
- **THEN** the rendered instructions are `Found decision_5.`

### Requirement: The card key is available when a card is given

When instructions are requested for a card, the card key SHALL be available as `cardKey` to the query and to the instructions.

Source: both

#### Scenario: Card key in the instructions

- **GIVEN** a skill whose instructions are `Applies to {{cardKey}}.`
- **WHEN** the instructions are previewed for the card `decision_5`
- **THEN** the rendered instructions are `Applies to decision_5.`

### Requirement: A skill with an empty query renders its instructions as written

A skill with an empty query SHALL render its instructions with no query results.

Source: both

#### Scenario: Instructions only

- **GIVEN** a skill with an empty query and the instructions `Be kind.`
- **WHEN** the instructions are previewed
- **THEN** the rendered instructions are `Be kind.`

### Requirement: A skill is enabled only by a rule

A skill SHALL be enabled for the whole project only when a logic program derives `enableSkill` for it, and a skill that no rule enables MUST NOT be listed or looked up.

Source: both, jira (INTDEV-1334)

#### Scenario: Created but not enabled

- **GIVEN** the skill `test/skills/guide` and no rule that enables it
- **WHEN** the enabled skills are listed and `test/skills/guide` is looked up
- **THEN** the list is empty
- **AND** the lookup says the skill is not enabled

#### Scenario: Enabled by a calculation

- **GIVEN** the skill `test/skills/guide` and a calculation with the fact `enableSkill("test/skills/guide").`
- **WHEN** the enabled skills are listed
- **THEN** the list holds `test/skills/guide` with the scope global

### Requirement: A skill can be enabled for specific cards

A skill SHALL be enabled for a specific card when a logic program derives `enableSkill` with that card, and then it has the scope card.

Source: both, jira (INTDEV-1334)

#### Scenario: Skill for one card

- **GIVEN** the skill `decision/skills/cardSkill` and the fact `enableSkill("decision/skills/cardSkill", decision_5).`
- **WHEN** the enabled skills are listed for the card `decision_5`
- **THEN** the list holds `decision/skills/cardSkill` with the scope card

### Requirement: Listing for a card includes global skills and that card's skills

Listing the enabled skills without a card SHALL list every enabled skill, and listing them for a card SHALL list the global skills and the skills enabled for that card only.

Source: both

#### Scenario: Other card

- **GIVEN** the global skill `decision/skills/globalSkill` and `decision/skills/cardSkill` enabled for `decision_5`
- **WHEN** the enabled skills are listed for the card `decision_1`
- **THEN** the list holds only `decision/skills/globalSkill`

#### Scenario: No card

- **GIVEN** the same skills
- **WHEN** the enabled skills are listed without a card
- **THEN** the list holds both skills

### Requirement: Enabled skills can be listed by category

Listing the enabled skills with a category SHALL list only the skills that have that category.

Source: both

#### Scenario: Category filter

- **GIVEN** the enabled skill `test/skills/guide` with the category help
- **WHEN** the enabled skills are listed for the category help, and then for the category other
- **THEN** the first list holds `test/skills/guide`
- **AND** the second list is empty

### Requirement: A listing gives a summary of each skill sorted by name

Each listed skill SHALL be given as its name, display name, description, category, related tools and scope, without its instructions, and the list SHALL be sorted by name.

Source: code, jira (INTDEV-1334)

#### Scenario: Summary fields

- **GIVEN** the enabled skills `decision/skills/globalSkill` and `decision/skills/cardSkill`
- **WHEN** the enabled skills are listed
- **THEN** `decision/skills/cardSkill` comes before `decision/skills/globalSkill`
- **AND** each entry has the fields name, displayName, description, category, relatedTools and scope
- **AND** no entry has instructions

### Requirement: Enablement follows the current state of the project

A skill SHALL be listed according to the state of the project at the time of listing.

Source: both

#### Scenario: Card leaves the enabling state

- **GIVEN** the skill `test/skills/guide` enabled for every card in the state Open
- **WHEN** a card in the state Open is transitioned to Review and the enabled skills are listed for that card
- **THEN** the list is empty

### Requirement: Looking up an enabled skill returns its rendered instructions

Looking up an enabled skill SHALL return its summary and its instructions rendered for the card that was given, if any.

Source: both, jira (INTDEV-1334)

#### Scenario: Global skill

- **GIVEN** the enabled global skill `decision/skills/globalSkill` with the instructions `Use this any time.`
- **WHEN** the skill is looked up
- **THEN** the result is ok with the instructions `Use this any time.`

#### Scenario: Card skill for its card

- **GIVEN** `decision/skills/cardSkill` enabled for `decision_5` with the instructions `Applies to {{cardKey}}.`
- **WHEN** the skill is looked up for the card `decision_5`
- **THEN** the instructions are `Applies to decision_5.`

### Requirement: A card skill needs a card

Looking up a skill that is enabled only for cards, without a card, SHALL answer that a card is needed instead of rendering the instructions.

Source: both

#### Scenario: No card given

- **GIVEN** `decision/skills/cardSkill` enabled for `decision_5`
- **WHEN** the skill is looked up without a card
- **THEN** the result says a card is needed

### Requirement: Looking up a skill that is not enabled for the card answers so

Looking up a skill that is not enabled, or not enabled for the given card, SHALL answer that it is not enabled instead of failing.

Source: both, jira (INTDEV-1334)

#### Scenario: Wrong card

- **GIVEN** `decision/skills/cardSkill` enabled for `decision_5`
- **WHEN** the skill is looked up for the card `decision_1`
- **THEN** the result says the skill is not enabled

### Requirement: Looking up an unknown skill or card answers so

Looking up a skill that does not exist SHALL answer not found, and looking it up for a card that does not exist SHALL answer card not found.

Source: code

#### Scenario: Unknown skill

- **GIVEN** a project without the skill `decision/skills/missing`
- **WHEN** `decision/skills/missing` is looked up
- **THEN** the result says the skill is not found

#### Scenario: Unknown card

- **GIVEN** the enabled skill `decision/skills/globalSkill`
- **WHEN** it is looked up for the card `decision_9999`
- **THEN** the result says the card is not found

### Requirement: A preview ignores enablement

Previewing the instructions of a skill SHALL render them whether or not the skill is enabled, for any existing card.

Source: both

#### Scenario: Skill not enabled for the card

- **GIVEN** `decision/skills/cardSkill` enabled for `decision_5` only
- **WHEN** its instructions are previewed for `decision_1`
- **THEN** the rendered instructions are `Applies to decision_1.`

### Requirement: A preview can render unsaved content

Previewing a skill SHALL render the instructions and the query that are given instead of the stored ones, leaving the stored skill unchanged.

Source: both

#### Scenario: Draft instructions

- **GIVEN** the skill `decision/skills/globalSkill` with the stored instructions `Use this any time.`
- **WHEN** the instructions `# Draft` are previewed
- **THEN** the rendered instructions are `# Draft`
- **AND** the stored instructions are still `Use this any time.`

### Requirement: A preview of a missing or broken subject is refused

Previewing a skill that does not exist, for a card that does not exist, or with a query that cannot be evaluated SHALL be refused with an error.

Source: both

#### Scenario: Broken query

- **GIVEN** the skill `decision/skills/globalSkill`
- **WHEN** it is previewed with the query `this is not a logic program`
- **THEN** the preview is refused with an error
