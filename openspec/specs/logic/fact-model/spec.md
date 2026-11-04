# logic/fact-model Specification

## Purpose

This capability defines the contract for content and module authors: the vocabulary of facts and external functions that a logic program written over a project can rely on, as the user docs present it. Facts the project uses only internally are not part of it. What programs do with the facts is specified in the other `logic/` capabilities.

## Requirements

### Requirement: Every card is declared as a card

A logic program run over a project SHALL see one card fact for every card of the project and of its templates.

Source: both

#### Scenario: Project card is a card

- **GIVEN** a project with the card `test_1` of the card type `test/cardTypes/page`
- **WHEN** the program `result(C) :- card(C).` is run
- **THEN** the results include `test_1`

### Requirement: Card properties are field facts

A card SHALL be described by field facts that give its title, card type and workflow state, with the field name as a string and the value as a string.

Source: both

#### Scenario: Title, card type and state of a card

- **GIVEN** the card `test_1` titled Top, of the card type `test/cardTypes/page`, in the state Open
- **WHEN** the program `result(V) :- field(test_1, "title", V).` is run
- **THEN** the single result is Top
- **AND** the facts `field(test_1, "cardType", "test/cardTypes/page")` and `field(test_1, "workflowState", "Open")` hold

### Requirement: Card metadata is exposed as fields

A card SHALL expose its creation time, last update time and rank as field facts.

Source: both

#### Scenario: Last update time is a field

- **GIVEN** the card `test_1`
- **WHEN** the program `result(V) :- field(test_1, "lastUpdated", V).` is run
- **THEN** there is one result, the time the card was last updated

### Requirement: Custom field values are field facts named by the field type

A value stored on a card for a custom field SHALL appear as a field fact whose field name is the full name of the field type.

Source: both

#### Scenario: Custom field value

- **GIVEN** the card `test_2` of a card type that declares the field type `test/fieldTypes/owner`, with the value Anna stored
- **WHEN** the program `result(V) :- field(test_2, "test/fieldTypes/owner", V).` is run
- **THEN** the single result is Anna

### Requirement: Integer field values are numbers

The value of a custom field whose field type is integer SHALL appear as a number in the fact, and the value of any other data type as a string.

Source: both

#### Scenario: Integer value in arithmetic

- **GIVEN** the card `test_2` with the integer field `test/fieldTypes/likelihood` stored as 3
- **WHEN** the program `result(V) :- field(test_2, "test/fieldTypes/likelihood", L), V = L + 1.` is run
- **THEN** the single result is 4

### Requirement: A list field value is one fact per item

A list field SHALL produce one field fact for each item in the list.

Source: code

#### Scenario: Two-item list

- **GIVEN** the card `test_2` with the list field `test/fieldTypes/admins` holding a and b
- **WHEN** the program `result(V) :- field(test_2, "test/fieldTypes/admins", V).` is run
- **THEN** the results are a and b

### Requirement: Workflow state category is a built-in field

Every card with a workflow state SHALL have a `workflowStateCategory` field whose value is the category of that state in the card type's workflow.

Source: both

#### Scenario: Category of the state

- **GIVEN** the card `test_1` in the state Closed, which the workflow categorises as closed
- **WHEN** the program `result(V) :- field(test_1, "workflowStateCategory", V).` is run
- **THEN** the single result is closed

### Requirement: Project cards have an application path

Every project card SHALL have a `urlPath` field whose value is the application-relative path of the card, and template cards SHALL NOT have one.

Source: both

#### Scenario: Path of a project card

- **GIVEN** the project with prefix `test` and the card `test_1`
- **WHEN** the program `result(P) :- field(test_1, "urlPath", P).` is run
- **THEN** the single result is `/projects/test/cards/test_1`

### Requirement: Child cards declare their parent

A card that is not at the top of its tree SHALL have a parent fact naming its parent card, and a card at the top of the project SHALL have none.

Source: both

#### Scenario: Child of a card

- **GIVEN** the card `test_2` as a child of `test_1`
- **WHEN** the program `result(P) :- parent(test_2, P).` is run
- **THEN** the single result is `test_1`
- **AND** the program `result(P) :- parent(test_1, P).` returns nothing

### Requirement: Ancestors cover every level of the hierarchy

The fact `ancestor(Descendant, Ancestor)` SHALL hold for every card and each of its parents, grandparents and further ancestors.

Source: both

#### Scenario: Grandparent

- **GIVEN** `test_3` is a child of `test_2`, which is a child of `test_1`
- **WHEN** the program `result(A) :- ancestor(test_3, A).` is run
- **THEN** the results are `test_2` and `test_1`

### Requirement: Cards are split into project cards and template cards

The fact `projectCard` SHALL hold for the cards of the project, `templateCard` for the cards inside templates, and every card of either kind SHALL also be a card.

Source: both

#### Scenario: Project card is not a template card

- **GIVEN** the project card `test_1` and a template with a card
- **WHEN** the program `result(C) :- projectCard(C).` is run
- **THEN** the results include `test_1` and no template card

### Requirement: Labels are label facts

Each label of a card SHALL appear as a label fact for that card.

Source: both

#### Scenario: Card with a label

- **GIVEN** the card `test_1` labelled task-progress
- **WHEN** the program `result(L) :- label(test_1, L).` is run
- **THEN** the single result is task-progress

### Requirement: Links are link facts in two forms

A link between cards SHALL appear as a link fact with source, destination and link type, or with a fourth argument for the description when the link type uses descriptions.

Source: both

#### Scenario: Link without and with description

- **GIVEN** `test_1` linked to `test_2` with `test/linkTypes/relates`, and to `test_3` with the description-enabled `test/linkTypes/mentions` and description See
- **WHEN** the program `result(D) :- link(test_1, D, "test/linkTypes/relates").` is run
- **THEN** the single result is `test_2`
- **AND** the program `result(T) :- link(test_1, test_3, "test/linkTypes/mentions", T).` returns See

### Requirement: Logic programs can define links

A rule that derives a link fact SHALL make the link part of the project as a calculated link.

Source: docs

#### Scenario: Calculated link

- **GIVEN** a calculation containing `link(test_1, test_2, "test/linkTypes/relates").`
- **WHEN** the program `result(D) :- link(test_1, D, _).` is run
- **THEN** the single result is `test_2`

### Requirement: Card types are described by facts

Each card type SHALL be described by a card type fact, its workflow, display name and description as fields, and facts for its custom, calculated, always visible and optionally visible fields.

Source: both

#### Scenario: Custom and calculated fields of a card type

- **GIVEN** the card type `test/cardTypes/risk` with the calculated field `test/fieldTypes/riskLevel`
- **WHEN** the program `result(F) :- calculatedField("test/cardTypes/risk", F).` is run
- **THEN** the single result is `test/fieldTypes/riskLevel`

### Requirement: Field types are described by facts

Each field type SHALL be described by a field type fact and fields for its data type, display name and description, and each enum value by an enum value fact with display value, description and a one-based index in the order listed.

Source: both

#### Scenario: Enum values

- **GIVEN** the enum field type `test/fieldTypes/priority` with values low then high
- **WHEN** the program `result(V) :- field(("test/fieldTypes/priority", V), "index", 2).` is run
- **THEN** the single result is high

### Requirement: Link types are described by facts

Each link type SHALL be described by a link type fact, fields for its category, display name, description, outbound and inbound display names and whether link descriptions are enabled, and facts for its source and destination card types.

Source: both

#### Scenario: Inbound display name

- **GIVEN** the link type `test/linkTypes/relates` with the inbound display name is related by
- **WHEN** the program `result(N) :- field("test/linkTypes/relates", "inboundDisplayName", N).` is run
- **THEN** the single result is is related by

### Requirement: Workflows are described by facts

Each workflow SHALL be described by a workflow fact, a workflow state fact for each state with its category, and a workflow transition fact for each source state of each transition, where a create transition has the empty string as its source.

Source: both

#### Scenario: Create transition

- **GIVEN** the workflow `test/workflows/flow` with the create transition Create into Open
- **WHEN** the program `result(S) :- workflowTransition("test/workflows/flow", "Create", "", S).` is run
- **THEN** the single result is Open

### Requirement: Templates, reports and skills are described by facts

Each template, report and skill SHALL be described by a fact of its kind with fields for its display name, description and category, and each related tool of a skill by a related tool fact.

Source: both

#### Scenario: Report

- **GIVEN** the report `test/reports/children` with the description Lists children
- **WHEN** the program `result(D) :- report(R), field(R, "description", D).` is run
- **THEN** the results include Lists children

### Requirement: The execution context is a fact

The program SHALL contain exactly one of the facts `localApp`, `exportedSite`, `exportedDocument` or `commandLine`, naming the context in which it is run.

Source: both

#### Scenario: Static site export

- **WHEN** the program `result(exportedSite) :- exportedSite.` is run in the context exportedSite
- **THEN** there is one result
- **AND** the same program run in the context localApp returns nothing

### Requirement: Connectors declare external data

Facts declared by a calculation for connectors, external items, their fields, parents, labels and links SHALL be part of the program, with external items keyed by the pair of connector and item key.

Source: docs

#### Scenario: Declared external item

- **GIVEN** a calculation declaring `connector(jira).` and `externalItem((jira, "ABC-1")).`
- **WHEN** the program `result(I) :- externalItem((jira, I)).` is run
- **THEN** the single result is ABC-1

### Requirement: concatenate joins its arguments as a string

The external function `@concatenate` SHALL return the string made by joining all its arguments, whether strings, constants or numbers, and an empty string for no arguments.

Source: both

#### Scenario: String, number and constant

- **WHEN** the program `result(@concatenate("a", 1, b)).` is run
- **THEN** the single result is a1b

### Requirement: daysSince counts days from a date

The external function `@daysSince` SHALL return the number of whole days since the given date or date time.

Source: both

#### Scenario: Date in the past

- **GIVEN** today is 2026-11-02
- **WHEN** the program `result(@daysSince("2026-10-30")).` is run
- **THEN** the single result is 3

### Requirement: today returns today's date

The external function `@today` SHALL return the current date as ten characters.

Source: both

#### Scenario: Length of today

- **WHEN** the program `result(@today()).` is run
- **THEN** the single result is a date of ten characters

### Requirement: wrap breaks and encodes titles for graphs

The external function `@wrap` SHALL return the string with line breaks inserted into long text and with special characters HTML encoded, and a short string unchanged.

Source: both

#### Scenario: Special character

- **WHEN** the program `result(@wrap("this & that")).` is run
- **THEN** the single result is `this &amp; that`
