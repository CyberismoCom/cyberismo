# reports Specification

## Purpose

A report is a project resource that turns the results of a query into AsciiDoc text through a template. This capability covers the content of a report, running it with parameters, the template helpers and the errors of a failing report. Embedding a report in card content is specified in `macros`; the query language is in `logic/queries`; creating, editing and removing resources in general is in `resources`.

## Requirements

### Requirement: A report requires a name and a display name

A report SHALL have a name and a display name, and MUST NOT have properties other than name, display name, description and category.

Source: code

#### Scenario: Report without a display name

- **GIVEN** the project prefix `test`
- **WHEN** the report `test/reports/x` is created from content that has no display name
- **THEN** the creation is refused with an error naming displayName
- **AND** the project has no report `test/reports/x`

#### Scenario: Report with an unknown property

- **GIVEN** the project prefix `test`
- **WHEN** the report `test/reports/x` is created from content that has the property `color`
- **THEN** the creation is refused with an error naming the property color

### Requirement: A report consists of a query, a parameter schema and a content template

A report SHALL consist of a query template, a parameter schema and a content template, each of which can be read and changed as the content of the report.

Source: both

#### Scenario: Content template changed

- **GIVEN** the report `test/reports/x`
- **WHEN** its content template is changed to `% changed`
- **THEN** showing `test/reports/x` returns the content template `% changed`

### Requirement: A new report lists the child cards

A newly created report SHALL have a query that selects the title of the child cards of the card key parameter, a content template that lists those titles as bullet points, and a parameter schema that accepts a name and a card key.

Source: both

#### Scenario: Default content

- **GIVEN** the project prefix `test`
- **WHEN** the report `test/reports/x` is created without content
- **THEN** its query selects the titles of the children of the card key
- **AND** its content template lists each result title as a bullet point

### Requirement: A report is rendered from its query results

Running a report SHALL run its query and render the content template with the query results as `results`.

Source: both

#### Scenario: Children of a card

- **GIVEN** the report `test/reports/children` whose query selects the titles of the children of the card key and whose template lists `results` as bullet points, and a card Top with the children Child A and Child B
- **WHEN** the report is run for Top
- **THEN** the output contains `* Child A` and `* Child B`

#### Scenario: Nothing found

- **GIVEN** the report `test/reports/children` and a card Other without children
- **WHEN** the report is run for Other
- **THEN** the output is empty

### Requirement: The query is a template over the report parameters

The query of a report SHALL be a template that is expanded with the parameters of the report before it is run.

Source: both

#### Scenario: Parameter in the query

- **GIVEN** the report `test/reports/children` and the cards Top and Other
- **WHEN** the report is run for Top and then for Other
- **THEN** each output lists only the children of the card it was run for

### Requirement: A query that uses a missing parameter is refused

A report whose query uses a parameter that was not given SHALL be refused.

Source: code

#### Scenario: Missing parameter

- **GIVEN** a report whose query uses the parameter `depth`
- **WHEN** the report is run without a `depth`
- **THEN** the run is refused with an error

### Requirement: The card key defaults to the card holding the report

The `cardKey` parameter of a report SHALL default to the card whose content holds the report, and a `cardKey` given explicitly MUST replace it.

Source: both

#### Scenario: Default and override

- **GIVEN** the report `test/reports/children`, a card Top with children and a card Other without
- **WHEN** the content of Other holding the report is rendered, and then the same report with the `cardKey` of Top
- **THEN** the first output is empty
- **AND** the second output lists the children of Top

### Requirement: A report with an empty query is rendered from its parameters

A report whose query is empty SHALL be rendered from its parameters alone, with no query results.

Source: both, jira (INTDEV-1246)

#### Scenario: Echo of a parameter

- **GIVEN** the report `test/reports/echo` with an empty query and the content template `Value is {{value}}.`
- **WHEN** the report is run with the parameter value 7
- **THEN** the output is `Value is 7.`

### Requirement: Parameters are checked against the parameter schema

The parameters of a report SHALL be checked against the parameter schema of the report, and parameters that do not conform MUST be reported as an error.

Source: both

#### Scenario: Missing required parameter

- **GIVEN** a report whose parameter schema requires the parameter `labels` as an array of strings
- **WHEN** content holding the report without `labels` is rendered
- **THEN** the rendered content reports a macro error for the report

### Requirement: A parameter schema must be a valid schema

A parameter schema that is not a valid schema SHALL be reported when the report is validated.

Source: code

#### Scenario: Invalid schema

- **GIVEN** the report `test/reports/x` whose parameter schema is `{"type": 5}`
- **WHEN** the report is validated
- **THEN** the result reports an invalid parameter schema

### Requirement: Running an unknown report is refused

Running a report that the project does not have SHALL be refused with an error naming the report.

Source: code

#### Scenario: Unknown report

- **GIVEN** a project without the report `test/reports/gone`
- **WHEN** the report `test/reports/gone` is run for a card
- **THEN** the run is refused with an error naming `test/reports/gone`

### Requirement: A failing logic program names the report

A report whose query cannot be evaluated SHALL fail with an error that names the report and carries the diagnostics of the query.

Source: code, jira (INTDEV-858)

#### Scenario: Syntax error in the query

- **GIVEN** the report `test/reports/bad` whose query is `result(X :- `
- **WHEN** content holding the report is rendered
- **THEN** the rendered content reports a macro error naming `test/reports/bad`

### Requirement: Templates can compare values

Report templates SHALL provide the helpers `eq` and `ne` that test whether two values are equal or not equal.

Source: code, jira (INTDEV-1203)

#### Scenario: Equality

- **GIVEN** a report with an empty query and the content template `{{#if (eq value 1)}}EQ{{/if}}{{#if (ne value 1)}}NE{{/if}}`
- **WHEN** the report is run with value 1, and then with value 7
- **THEN** the outputs are EQ and NE

### Requirement: Templates can do arithmetic

Report templates SHALL provide `add`, `subtract`, `multiply` and `divide` for numbers, in both the query template and the content template, where `add` and `multiply` take two or more operands.

Source: code, jira (INTDEV-1246)

#### Scenario: Arithmetic in a content template

- **GIVEN** a report with an empty query and the content template `{{subtract 100 value}} {{multiply value 2}} {{add 1 2 3}} {{divide 7 2}}`
- **WHEN** the report is run with value 7
- **THEN** the output is `93 14 6 3.5`

#### Scenario: Arithmetic in a query template

- **GIVEN** a report whose query is `result(x) :- 3 = {{add 1 2}}.` and whose content template is `{{#each results}}ok{{/each}}`
- **WHEN** the report is run
- **THEN** the output is `ok`

### Requirement: Arithmetic refuses non-numbers and division by zero

A helper that does arithmetic SHALL refuse an operand that is not a number, too few operands, and division by zero.

Source: code

#### Scenario: Division by zero

- **GIVEN** a report with an empty query and the content template `{{divide 1 0}}`
- **WHEN** the report is run
- **THEN** the run fails with an error

### Requirement: Templates can round and compare numbers

Report templates SHALL provide `round`, which rounds to the nearest integer or to a given number of decimal digits, and `max` and `min`, which return the largest or smallest of two or more numbers.

Source: code, jira (INTDEV-1246)

#### Scenario: Rounding and extremes

- **GIVEN** a report with an empty query and the content template `{{round 2.567 2}} {{max 3 9 4}} {{min 3 9 4}}`
- **WHEN** the report is run
- **THEN** the output is `2.57 9 3`

### Requirement: formatValue formats a query value for text

The helper `formatValue` SHALL render arrays as comma-separated lists, objects by their `displayValue` or else their `value` or else as JSON, booleans as Yes or No, and other values as text.

Source: both

#### Scenario: Boolean and list

- **GIVEN** a report with an empty query and the content template `{{formatValue flag}} {{formatValue items}}`
- **WHEN** the report is run with flag true and items `["a", "b"]`
- **THEN** the output is `Yes a, b`

### Requirement: jsonEscape makes a string safe for a JSON string

The helper `jsonEscape` SHALL escape double quotes, backslashes, newlines and other control characters in a string.

Source: both, jira (INTDEV-1143)

#### Scenario: Quotes and newline

- **GIVEN** a report with an empty query and the content template `"{{jsonEscape text}}"`
- **WHEN** the report is run with the text `say "hi"` followed by a newline
- **THEN** the output is `"say \"hi\"\n"` with the newline written as the two characters backslash and n

### Requirement: csvEscape makes a string safe for a CSV field

The helper `csvEscape` SHALL double each double quote in a string and leave wrapping the field in quotes to the template.

Source: both, jira (INTDEV-1143)

#### Scenario: Quote in a field

- **GIVEN** a report with an empty query and the content template `"{{csvEscape text}}"`
- **WHEN** the report is run with the text `a"b`
- **THEN** the output is `"a""b"`
