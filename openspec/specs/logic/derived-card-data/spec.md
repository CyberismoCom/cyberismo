# logic/derived-card-data Specification

## Purpose

This capability defines the contract for content and module authors on the card data their logic programs compute: calculated field values and how a stored override relates to them, the status indicator, progress, and hiding cards from the navigation tree. Storing an override is specified in `fields/field-values`, and how the app shows these values in `ui/navigation`, `ui/card-view` and `ui/card-editor`.

## Requirements

### Requirement: A calculated field takes its value from fieldCalculated

A field that the card type declares as calculated SHALL have the value given by the `fieldCalculated` fact derived for it, as its effective field value.

Source: both, jira (INTDEV-200, INTDEV-1276)

#### Scenario: Risk level

- **GIVEN** the card type `test/cardTypes/risk` with the calculated field `test/fieldTypes/riskLevel`, and a calculation giving it `Likelihood * Impact`
- **AND** the card `test_1` with likelihood 2 and impact 3
- **WHEN** the program `result(V) :- field(test_1, "test/fieldTypes/riskLevel", V).` is run
- **THEN** the single result is 6

### Requirement: A calculated field has no value without a calculation

A calculated field for which no `fieldCalculated` fact is derived and no override exists SHALL have no field value.

Source: code

#### Scenario: Missing input

- **GIVEN** `test_1` has no impact value, so the risk calculation derives nothing
- **WHEN** the program `result(V) :- field(test_1, "test/fieldTypes/riskLevel", V).` is run
- **THEN** there are no results

### Requirement: A stored override is the effective value

When a card stores a value for an override-enabled calculated field, that value SHALL be the effective field value instead of the calculated one.

Source: both, jira (INTDEV-1276)

#### Scenario: Override of risk level

- **GIVEN** `test_1` with calculated risk level 6 and a stored override of 9
- **WHEN** the program `result(V) :- field(test_1, "test/fieldTypes/riskLevel", V).` is run
- **THEN** the single result is 9

### Requirement: An override is a separate fact

A stored value of an override-enabled calculated field SHALL be declared as a `fieldOverride` fact and not as a plain field fact, while the calculated value remains available as `fieldCalculated`.

Source: both, jira (INTDEV-1276)

#### Scenario: Override and calculation side by side

- **GIVEN** `test_1` with calculated risk level 6 and a stored override of 9
- **WHEN** the program `result(O, C) :- fieldOverride(test_1, F, O), fieldCalculated(test_1, F, C).` is run
- **THEN** the single result is 9 with 6

### Requirement: A stored value on a non-overridable calculated field is dormant

A value stored on a card for a calculated field that does not enable override SHALL NOT produce a fact, and the calculation SHALL stay the effective value without conflict.

Source: both, jira (INTDEV-1305)

#### Scenario: Value left after override was disabled

- **GIVEN** `test_1` stores 9 for the risk level, whose override has been disabled, and the calculation gives 6
- **WHEN** the program `result(V) :- field(test_1, "test/fieldTypes/riskLevel", V).` is run
- **THEN** the single result is 6

### Requirement: A plain field head in a calculation conflicts with an override

When a calculation defines a calculated field with a plain `field` head and an override exists, the card SHALL have two values and a notification named Conflicting field values.

Source: both

#### Scenario: Deprecated head with override

- **GIVEN** a calculation giving the risk level with a plain field head, and `test_1` storing an override of 9
- **WHEN** the notifications of `test_1` are read
- **THEN** they include one titled Conflicting field values

### Requirement: Every card has a status indicator that logic can set

The value a logic program gives the calculated field `statusIndicator` of a card, one of initial, active, closed or error, SHALL be the status indicator of that card in the navigation tree.

Source: both

#### Scenario: Error indicator

- **GIVEN** a calculation giving `test_1` the status indicator error
- **WHEN** the navigation tree is read
- **THEN** `test_1` has the status indicator error

### Requirement: The base module sets the indicator from policy checks and state category

In a project using the base module, a card with a policy check failure SHALL have the indicator error, and otherwise the category of its workflow state, unless the module's default indicator has been disabled.

Source: docs

#### Scenario: Failure beats category

- **GIVEN** a project using the base module and the card `test_1` in a closed state with a policy check failure
- **WHEN** the navigation tree is read
- **THEN** `test_1` has the status indicator error

### Requirement: Progress is a percentage on the card

An integer value a logic program gives the calculated field `progress` of a card SHALL be the progress percentage of that card in the navigation tree.

Source: both, jira (INTDEV-250)

#### Scenario: Half of descendants closed

- **GIVEN** a calculation giving `test_1` the progress 50
- **WHEN** the navigation tree is read
- **THEN** `test_1` has the progress 50

### Requirement: A hidden card hides its descendants from the tree

A card for which `hiddenInTreeView` holds SHALL be left out of the navigation tree together with all its descendants.

Source: both

#### Scenario: Hidden parent

- **GIVEN** a calculation declaring `hiddenInTreeView(test_1).` and `test_2` a child of `test_1`
- **WHEN** the navigation tree is read
- **THEN** neither `test_1` nor `test_2` appears in it
