# card-types Specification

## Purpose

A card type defines the workflow its cards follow and the custom fields they may carry, and how those fields are listed. This capability covers a card type's workflow, custom fields, visibility lists and calculated-field flags, and what renaming, removing or changing a card type does to cards and link types. Naming, listing and the other lifecycle rules shared by all resources are in `resources`; field types themselves are in `fields/field-types`.

## Requirements

### Requirement: A card type uses exactly one workflow

A card type SHALL name one workflow, which defines the states of the cards of that type.

Source: docs

#### Scenario: Card type shows its workflow

- **GIVEN** the card type `test/cardTypes/page` created with the workflow `test/workflows/flow`
- **WHEN** `test/cardTypes/page` is shown
- **THEN** its workflow is `test/workflows/flow`

### Requirement: A card type is created with a workflow

Creating a card type SHALL require the name of an existing workflow, and a missing or unknown workflow MUST be refused.

Source: both

#### Scenario: No workflow given

- **GIVEN** the project `test`
- **WHEN** the card type `x` is created with an empty workflow
- **THEN** the creation is refused with an error that a card type needs a workflow
- **AND** the project is unchanged

#### Scenario: Workflow does not exist

- **GIVEN** no workflow `test/workflows/missing`
- **WHEN** the card type `x` is created with the workflow `test/workflows/missing`
- **THEN** the creation is refused with an error that the workflow does not exist in the project

### Requirement: A new card type has no custom fields

A card type created without content SHALL have empty lists of custom fields, always visible fields and optionally visible fields.

Source: code

#### Scenario: Defaults

- **GIVEN** the workflow `test/workflows/flow`
- **WHEN** the card type `fresh` is created with that workflow
- **THEN** `test/cardTypes/fresh` has the display name empty and no custom fields, no always visible fields and no optionally visible fields

### Requirement: A custom field refers to an existing field type

Adding a custom field to a card type SHALL require that the field type exists, and a card type MUST NOT list the same field type twice.

Source: both

#### Scenario: Field type added

- **GIVEN** the card type `test/cardTypes/bare` with the custom field `test/fieldTypes/size`
- **WHEN** the custom field `test/fieldTypes/note` is added
- **THEN** the custom fields are `test/fieldTypes/size` and `test/fieldTypes/note`

#### Scenario: Unknown field type

- **GIVEN** no field type `test/fieldTypes/ghost`
- **WHEN** `test/fieldTypes/ghost` is added as a custom field of `test/cardTypes/bare`
- **THEN** the edit is refused with a not-found error
- **AND** the card type is unchanged

#### Scenario: Field type already a custom field

- **GIVEN** the card type `test/cardTypes/bare` with the custom field `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is added again
- **THEN** the edit is refused with an error that it already exists

### Requirement: Custom fields can be reordered

A custom field SHALL be movable to a given position in the card type's list of custom fields.

Source: code

#### Scenario: Field moved first

- **GIVEN** the card type `test/cardTypes/bare` with the custom fields `test/fieldTypes/size`, `test/fieldTypes/note`
- **WHEN** `test/fieldTypes/note` is ranked to position 0
- **THEN** the custom fields are `test/fieldTypes/note`, `test/fieldTypes/size`

### Requirement: A custom field can have its own display name

A custom field of a card type SHALL use its own display name, when it has one, instead of the display name of its field type.

Source: docs

#### Scenario: Override shown

- **GIVEN** the field type `test/fieldTypes/size` with display name `Size`
- **WHEN** the card type `test/cardTypes/page` lists `test/fieldTypes/size` with display name `Page size`
- **THEN** showing `test/cardTypes/page` returns the custom field with display name `Page size`

### Requirement: A custom field is not calculated unless declared so

A custom field SHALL be editable and not calculated unless the card type declares it calculated.

Source: both

#### Scenario: Default flag

- **GIVEN** a card type whose custom field `test/fieldTypes/size` has no calculated flag
- **WHEN** the card type is shown
- **THEN** the custom field is not calculated

### Requirement: Override can be enabled on a calculated field

A custom field declared calculated SHALL be able to enable override, which lets users enter a value that replaces the calculated one; enabling override on a field that is not calculated has no effect.

Source: both, jira (INTDEV-1276)

#### Scenario: Override enabled

- **GIVEN** the card type `test/cardTypes/page` with the calculated custom field `test/fieldTypes/bonus`
- **WHEN** the field is changed to calculated with override enabled
- **THEN** showing `test/cardTypes/page` returns `test/fieldTypes/bonus` as calculated with override enabled

### Requirement: Override can be disabled while cards hold values

Disabling override on a calculated custom field SHALL be accepted even when cards hold values for it, and the values are kept.

Source: code

#### Scenario: Disabled with a stored value

- **GIVEN** the calculated custom field `decision/fieldTypes/owner` with override enabled and a card holding the value `decision_999`
- **WHEN** override is disabled on the card type
- **THEN** the edit succeeds and the field is calculated without override
- **AND** the card still stores `decision_999`, which is dormant as described in `fields/field-values`

### Requirement: Visible fields are listed in display order

A card type SHALL keep a list of always visible fields and a list of optionally visible fields, each in the order the fields are to be shown.

Source: docs

#### Scenario: Field added to a list

- **GIVEN** the card type `test/cardTypes/bare` with the custom field `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is added to the always visible fields
- **THEN** the always visible fields are `test/fieldTypes/size`

#### Scenario: Optional list

- **GIVEN** the card type `test/cardTypes/bare` with the custom field `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is added to the optionally visible fields
- **THEN** the optionally visible fields are `test/fieldTypes/size`

### Requirement: Only custom fields of the card type can be made visible

Adding a field to a visibility list SHALL be refused unless it is a custom field of that card type.

Source: code

#### Scenario: Field not declared on the card type

- **GIVEN** the card type `test/cardTypes/bare` without the custom field `test/fieldTypes/note`
- **WHEN** `test/fieldTypes/note` is added to its always visible fields
- **THEN** the edit is refused with an error that the field is not defined in the card type

#### Scenario: Field type missing from the project

- **GIVEN** no module `nope`
- **WHEN** `nope/fieldTypes/x` is added to the always visible fields of `test/cardTypes/bare`
- **THEN** the edit is refused with a not-found error

### Requirement: Removing a custom field removes it from the visibility lists

Removing a custom field from a card type SHALL also remove it from both visibility lists, and removing a custom field that is not on the card type MUST be refused.

Source: code

#### Scenario: Field removed everywhere

- **GIVEN** the custom field `test/fieldTypes/size` listed in both visibility lists of `test/cardTypes/bare`
- **WHEN** `test/fieldTypes/size` is removed from the custom fields
- **THEN** the custom fields and both visibility lists are empty

#### Scenario: Field not on the card type

- **GIVEN** the card type `test/cardTypes/bare` without `test/fieldTypes/note`
- **WHEN** `test/fieldTypes/note` is removed from its custom fields
- **THEN** the edit is refused with an error

### Requirement: Changing custom fields leaves existing cards unchanged

Adding or removing a custom field SHALL NOT change the stored values of existing cards.

Source: both

#### Scenario: Field added

- **GIVEN** a card of `test/cardTypes/bare` with no value for `test/fieldTypes/note`
- **WHEN** `test/fieldTypes/note` is added to the card type
- **THEN** the card has no key for `test/fieldTypes/note`

#### Scenario: Field removed

- **GIVEN** a card of `test/cardTypes/page` holding the value 3 for `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is removed from the card type
- **THEN** the card still holds 3 for `test/fieldTypes/size`

### Requirement: Changing the workflow can map the states of existing cards

Changing a card type's workflow SHALL, when a state mapping is given, set each card of that type to the state its current state maps to.

Source: both, jira (INTDEV-582)

#### Scenario: Cards moved by mapping

- **GIVEN** the card type `test/cardTypes/page` on `test/workflows/flow` with one card Open and one In Progress
- **WHEN** the workflow is changed to `test/workflows/other` with the mapping Open to Open, In Progress to Closed, Closed to Closed
- **THEN** the card type's workflow is `test/workflows/other`
- **AND** the first card is in Open and the second in Closed

### Requirement: Changing the workflow needs a mapping when cards exist

Changing a card type's workflow SHALL be refused without a state mapping while cards of that card type exist.

Source: jira (INTDEV-582)

#### Scenario: No mapping with existing cards

- **GIVEN** a card of `test/cardTypes/page` in In Progress
- **WHEN** the workflow is changed to `test/workflows/other` without a mapping
- **THEN** the change is refused
- **AND** the card type's workflow and the card's state are unchanged

#### Scenario: No mapping without cards

- **GIVEN** no cards of `test/cardTypes/page`
- **WHEN** the workflow is changed to `test/workflows/other` without a mapping
- **THEN** the change is accepted

### Requirement: A state mapping must be complete and valid

A state mapping SHALL be refused when it leaves a state of the old workflow unmapped or maps to a state the new workflow lacks.

Source: both, jira (INTDEV-582)

#### Scenario: State left out

- **GIVEN** a change of workflow to `test/workflows/other` with a mapping that omits Closed
- **WHEN** the change is applied
- **THEN** it is refused with an error naming the unmapped state Closed
- **AND** the card type and its cards are unchanged

#### Scenario: Target state missing

- **GIVEN** a mapping of Open to Draft, a state `test/workflows/other` lacks
- **WHEN** the change is applied
- **THEN** it is refused with an error naming the state Draft

### Requirement: Changing to a workflow that does not exist is refused

Changing a card type's workflow MUST be refused when the new workflow does not exist, leaving the card type and its cards unchanged.

Source: docs

#### Scenario: Ghost workflow

- **GIVEN** no workflow `test/workflows/ghost`
- **WHEN** the workflow of `test/cardTypes/page` is changed to `test/workflows/ghost`
- **THEN** the change is refused with an error naming `test/workflows/ghost`
- **AND** `test/cardTypes/page` still uses its previous workflow

### Requirement: Renaming a card type updates its cards and link types

Renaming a card type SHALL give every card and template card of that type the new card type name and rewrite the card type in link types that list it.

Source: both

#### Scenario: Card type renamed

- **GIVEN** `test/cardTypes/page` used by two cards and a template card and listed as a source card type of `test/linkTypes/rel`
- **WHEN** it is renamed to `sheet`
- **THEN** those cards have the card type `test/cardTypes/sheet`
- **AND** `test/linkTypes/rel` lists `test/cardTypes/sheet` as source card type
- **AND** cards of other card types are unchanged

### Requirement: Removing a card type removes its cards

Removing a card type SHALL delete every card of that type and remove the card type from link types, keeping all other cards and link types.

Source: code

#### Scenario: Card type removed

- **GIVEN** `test/cardTypes/page` with two cards, and another card of `test/cardTypes/bare`; `test/linkTypes/rel` lists `test/cardTypes/page` as source
- **WHEN** `test/cardTypes/page` is removed
- **THEN** the two cards no longer exist and the card of `test/cardTypes/bare` remains
- **AND** `test/linkTypes/rel` has no source card types

### Requirement: Usage of a card type includes cards and link types

The usage of a card type SHALL list the cards of that type, including template cards, and the link types that list it.

Source: code

#### Scenario: Cards and link type

- **GIVEN** two project cards and a template card of `test/cardTypes/page`, and `test/linkTypes/rel` listing it
- **WHEN** usage of `test/cardTypes/page` is requested
- **THEN** the result holds the two cards, the template card and `test/linkTypes/rel`
