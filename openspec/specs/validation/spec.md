# validation Specification

## Purpose

Validation checks a whole project and reports every problem it finds as text, so that content edited by hand or arriving through version control can be trusted. This capability covers what is checked and how problems are reported. The rules themselves belong to the capability that owns the thing checked, for example workflow rules to `workflows`; validation only reports their violations. Validating a single resource is in `resources`.

## Requirements

### Requirement: A valid project reports no errors

Validating a project that meets every check SHALL return an empty result.

Source: both

#### Scenario: Valid project

- **GIVEN** the project `decision-records` with its cards, card types, workflows and fields in order
- **WHEN** the project is validated
- **THEN** the result is empty

### Requirement: Missing project structure is reported

Validating a project SHALL report a missing project configuration, a missing configuration folder or its required subfolders, and a missing card root.

Source: both

#### Scenario: No card root

- **GIVEN** a project directory without its card root
- **WHEN** the project is validated
- **THEN** the result reports the missing card root

#### Scenario: No project configuration

- **GIVEN** a project directory without its project configuration file
- **WHEN** the project is validated
- **THEN** the result reports the missing project configuration

### Requirement: A path that is not a project is reported

Validating a path that does not hold a project SHALL report an error rather than an empty result.

Source: code

#### Scenario: Path does not exist

- **GIVEN** a path that does not exist
- **WHEN** it is validated
- **THEN** the result is not empty

### Requirement: An invalid project configuration is reported

Validating a project whose project configuration is not valid SHALL report it.

Source: code

#### Scenario: Invalid configuration

- **GIVEN** a project whose project configuration file is not valid
- **WHEN** the project is validated
- **THEN** the result is not empty

### Requirement: Unexpected files are reported

Validating a project SHALL report a file or folder that the project layout does not allow.

Source: code

#### Scenario: Stray file among reports

- **GIVEN** a valid project with an extra file named `fschema` among its reports
- **WHEN** the project is validated
- **THEN** the result is not empty

### Requirement: Every JSON file is checked against its format

Validating a project SHALL check each resource and metadata file against the format of its kind and report each violation with the file it was found in.

Source: both

#### Scenario: Violating file

- **GIVEN** a valid project in which the workflow file has a property its format does not allow
- **WHEN** the project is validated
- **THEN** the result reports a violation for that workflow file

### Requirement: A resource name must match its file

Validating a project SHALL report a resource whose name has a prefix that is not the project's or a module's, an identifier that differs from its file name, or a type that differs from its folder.

Source: code

#### Scenario: Name differs from the file

- **GIVEN** a workflow file `decision.json` whose name is `decision/workflows/other`
- **WHEN** the project is validated
- **THEN** the result reports the mismatch between the name and the file

### Requirement: A malformed resource name is reported against its file

Validating a project SHALL report a malformed resource name together with the file that holds it and continue with the rest of the project.

Source: code

#### Scenario: Name without an identifier

- **GIVEN** a workflow file whose name is `decision/workflows`
- **WHEN** the project is validated
- **THEN** the result names the workflow file and says its name is not a valid resource name

### Requirement: Workflow rules are reported

Validating a project SHALL report each workflow that breaks a rule of `workflows`, such as several transitions with the same name.

Source: code

#### Scenario: Duplicate transition name

- **GIVEN** the workflow `decision/workflows/decision` edited by hand to have two transitions named Branch
- **WHEN** the project is validated
- **THEN** the result says the workflow has several transitions named Branch and that transition names must be unique

### Requirement: Every invalid calculation is reported

Validating a project SHALL report each calculation whose logic program is not valid with its diagnostics, and MUST NOT report valid calculations.

Source: code, jira (INTDEV-1347)

#### Scenario: Two bad calculations

- **GIVEN** the calculations `mini/calculations/syntaxError`, `mini/calculations/unsafeVars` and `mini/calculations/validCalc`, of which the first two are invalid
- **WHEN** the project is validated
- **THEN** the result names the first two with their diagnostics
- **AND** the result does not name `mini/calculations/validCalc`

### Requirement: A card must have a card type that exists

Validating a project SHALL report a card whose card type does not exist.

Source: code

#### Scenario: Unknown card type

- **GIVEN** a card `decision_5` whose card type is `decision/cardTypes/ghost`
- **WHEN** the project is validated
- **THEN** the result says the card `decision_5` has an invalid card type

### Requirement: Card states that break workflow rules are reported

Validating a project SHALL report each card whose workflow state breaks a card-state rule of `workflows`, naming the card.

Source: code

#### Scenario: Invalid state

- **GIVEN** a card `decision_6` in the state Imaginary, which its workflow does not have
- **WHEN** the project is validated
- **THEN** the result says the card `decision_6` has an invalid state

#### Scenario: Template card in a state

- **GIVEN** a template card with the workflow state Draft
- **WHEN** the project is validated
- **THEN** the result says the template card must have an empty workflow state

### Requirement: Field values must fit their field types

Validating a project SHALL report each stored custom field value that breaks a value rule of `fields/field-values`, naming the card and the field.

Source: code

#### Scenario: Enum value not listed

- **GIVEN** an enum field whose values are Low and High and a card whose value is Medium
- **WHEN** the project is validated
- **THEN** the result names the card, the field and the possible values

### Requirement: An override value must fit its field type

Validating a project SHALL report an invalid value stored for an overridable calculated field, and MUST NOT report a value that is dormant as specified in `fields/field-values`.

Source: code

#### Scenario: Invalid override

- **GIVEN** an overridable calculated integer field and a card whose stored value is the text abc
- **WHEN** the project is validated
- **THEN** the result reports the card and the field

#### Scenario: Dormant value

- **GIVEN** a calculated integer field that cannot be overridden and a card with a stored value for it
- **WHEN** the project is validated
- **THEN** the result is empty

### Requirement: A field of the card type must exist in the project

Validating a project SHALL report a field named by a card type, in its custom fields or its visible fields, that the project does not have.

Source: code

#### Scenario: Missing field type

- **GIVEN** a card type that lists the custom field `decision/fieldTypes/gone`, which does not exist
- **WHEN** the project is validated
- **THEN** the result says the field `decision/fieldTypes/gone` is missing from the project

### Requirement: Metadata keys must be known fields or valid field names

Validating a project SHALL report a metadata key of a card that is neither a built-in field nor a valid field type name, and MUST NOT report a well-formed key that its card type does not declare.

Source: code, jira (INTDEV-1305)

#### Scenario: Key with parentheses

- **GIVEN** a card whose metadata has the key `decision/fieldTypes/x(1)`
- **WHEN** the project is validated
- **THEN** the result reports an invalid metadata key for the card

#### Scenario: Undeclared well-formed key

- **GIVEN** a card whose metadata has a well-formed field key that its card type does not declare
- **WHEN** the project is validated
- **THEN** the result is empty

### Requirement: Labels must follow the naming rules

Validating a project SHALL report card labels that are not an array of strings or that do not follow the label naming rules.

Source: code

#### Scenario: Invalid label

- **GIVEN** a card with the label `bad/label!`
- **WHEN** the project is validated
- **THEN** the result says the label does not follow the naming rules

### Requirement: Macros in card content are checked

Validating a project SHALL evaluate the macros in the content of each card and report a failing macro against its card, and the validation MUST continue with the other cards.

Source: both, jira (INTDEV-637)

#### Scenario: Graph macro without a view

- **GIVEN** the card `decision_5` whose content has a graph macro with an empty view
- **WHEN** the project is validated
- **THEN** the result names the card `decision_5` and says a resource name is needed to query its details

### Requirement: Duplicate card keys are reported

Validating a project SHALL report two cards that have the same key.

Source: code, jira (INTDEV-921)

#### Scenario: Same key twice

- **GIVEN** a project in which two cards share the key `decision_5`
- **WHEN** the project is validated
- **THEN** the result is not empty

### Requirement: All problems are reported together

Validating a project SHALL report every problem found, once each and in the same order on every run, instead of stopping at the first; when the project structure itself is invalid, only the structure problems are reported.

Source: code

#### Scenario: Two problems

- **GIVEN** a project with an invalid state on `decision_6` and a invalid label on `decision_5`
- **WHEN** the project is validated twice
- **THEN** both results report both problems in the same order
