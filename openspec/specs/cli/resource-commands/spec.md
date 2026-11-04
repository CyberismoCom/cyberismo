# cli/resource-commands Specification

## Purpose

The `cyberismo` commands that create, show, update and remove project resources (card types, field types, link types, workflows, templates, calculations, reports, graph models and views, skills), validate the project, and run logic programs and reports. The rules of each resource are specified in `resources` and the per-type capabilities; output and exit codes follow `cli/conventions`.

## Requirements

### Requirement: Create makes a resource of the named type

`cyberismo create <type> <name>` for the types `cardType`, `fieldType`, `linkType`, `graphModel`, `graphView`, `calculation`, `report`, `skill`, `template` and `workflow` SHALL create the resource as specified in `resources` and print `Done`.

Source: both

#### Scenario: Report created

- **WHEN** the user runs `cyberismo create report children`
- **THEN** stdout is `Done`
- **AND** `cyberismo show reports` lists `test/reports/children`

### Requirement: Create card type takes a workflow and create field type a data type

`cyberismo create cardType <name> <workflow>` SHALL create the card type bound to the workflow, and `cyberismo create fieldType <name> <dataType>` SHALL create the field type with that data type.

Source: both

#### Scenario: Card type with a workflow

- **WHEN** the user runs `cyberismo create cardType risk test/workflows/default`
- **THEN** `cyberismo show cardType test/cardTypes/risk` reports the workflow `test/workflows/default`

#### Scenario: Field type with a data type

- **WHEN** the user runs `cyberismo create fieldType score integer`
- **THEN** `cyberismo show fieldType test/fieldTypes/score` reports the data type `integer`

### Requirement: Template and workflow content may be given as JSON

`cyberismo create template <name> [content]` and `cyberismo create workflow <name> [content]` SHALL create the resource from the JSON text given as content, and with no content SHALL create it with default values.

Source: both

#### Scenario: Workflow with default content

- **WHEN** the user runs `cyberismo create workflow myWorkflow`
- **THEN** stdout is `Done`
- **AND** `cyberismo show workflow test/workflows/myWorkflow` shows the default workflow

#### Scenario: Content that is not JSON

- **WHEN** the user runs `cyberismo create workflow broken "{not json"`
- **THEN** stderr states the failure
- **AND** the exit code is 1

### Requirement: Create resource takes a full resource name

`cyberismo create resource <resourceName> [content]` SHALL create the resource of the type named in the resource name `<prefix>/<type>/<identifier>`.

Source: code

#### Scenario: Create by full name

- **WHEN** the user runs `cyberismo create resource test/linkTypes/relates`
- **THEN** stdout is `Done`
- **AND** `cyberismo show linkTypes` lists `test/linkTypes/relates`

### Requirement: Create with an unknown type is refused

`cyberismo create resource` given a type that cannot be created SHALL fail with `Unknown type to create: '<type>'` and create nothing.

Source: code

#### Scenario: Unknown type

- **WHEN** the user runs `cyberismo create resource test/widgets/foo`
- **THEN** stderr names the unknown type
- **AND** the exit code is 1

### Requirement: Show prints a resource without its content by default

`cyberismo show <type> <resourceName>`, or `cyberismo show <resourceName>`, SHALL print the resource's definition as JSON without its `content`, and with `--details` (`-d`) SHALL include it.

Source: both

#### Scenario: Show by type and name

- **WHEN** the user runs `cyberismo show cardType test/cardTypes/page`
- **THEN** stdout is the card type's JSON definition

#### Scenario: Show by name only

- **WHEN** the user runs `cyberismo show test/cardTypes/page`
- **THEN** stdout is the same JSON

#### Scenario: Unknown resource

- **WHEN** the user runs `cyberismo show cardType test/cardTypes/nope`
- **THEN** stderr states that the card type `test/cardTypes/nope` does not exist in the project
- **AND** the exit code is 1

### Requirement: Show with a plural type lists the resources of that type

`cyberismo show cardTypes`, `fieldTypes`, `linkTypes`, `workflows`, `templates`, `calculations`, `reports`, `graphModels`, `graphViews` and `skills` SHALL print the resource names of that type as a JSON array.

Source: both

#### Scenario: Card types listed

- **WHEN** the user runs `cyberismo show cardTypes`
- **THEN** stdout is the JSON array `["test/cardTypes/page"]`

### Requirement: Show use adds where a resource is used

`cyberismo show <type> <resourceName> --show-use` (`-u`) SHALL add a `usedIn` entry to the printed resource, listing where the resource is used as specified in `resources`.

Source: both, jira (INTDEV-598)

#### Scenario: Usage shown

- **GIVEN** the workflow `test/workflows/default` is used by `test/cardTypes/page`
- **WHEN** the user runs `cyberismo show workflow test/workflows/default -u`
- **THEN** the printed JSON has `usedIn` listing `test/cardTypes/page`

### Requirement: Show refuses an unknown type and lists the supported ones

`cyberismo show` given a type it does not know SHALL fail with `Unknown type` naming the value, listing the supported types and suggesting a resource name, and exit with code 1.

Source: code

#### Scenario: Unknown type

- **WHEN** the user runs `cyberismo show widgets`
- **THEN** stderr starts with `error: command-argument value 'widgets' is invalid for argument 'type'`
- **AND** names the supported types
- **AND** the exit code is 1

### Requirement: Update changes one property of a resource

`cyberismo update <resourceName> <operation> <key> <value> [newValue]` SHALL apply an `add`, `change`, `rank` or `remove` operation on the named property as specified in `resources`, and print `Done`.

Source: both

#### Scenario: Scalar property changed

- **WHEN** the user runs `cyberismo update test/cardTypes/page change displayName "Page"`
- **THEN** stdout is `Done`
- **AND** `cyberismo show cardType test/cardTypes/page` reports the display name `Page`

#### Scenario: Array element replaced

- **WHEN** the user runs `cyberismo update test/cardTypes/page change alwaysVisibleFields test/fieldTypes/a test/fieldTypes/b`
- **THEN** the field `test/fieldTypes/b` replaces `test/fieldTypes/a` in the card type

### Requirement: Update values are read as JSON when they are valid JSON

`cyberismo update` SHALL read `<value>` and `[newValue]` as JSON when they parse as JSON and otherwise as plain text.

Source: code

#### Scenario: Boolean value

- **WHEN** the user runs `cyberismo update test/linkTypes/relates change enableLinkDescription true`
- **THEN** the link type's `enableLinkDescription` is the boolean true

#### Scenario: Text value

- **WHEN** the user runs `cyberismo update test/linkTypes/relates change description "relates to"`
- **THEN** the description is the text `relates to`

### Requirement: Update addresses content properties as content slash property

`cyberismo update` SHALL accept the key as `<property>` or `content/<property>` and SHALL refuse any other key shape with an `Invalid key format` error naming the key.

Source: code

#### Scenario: Content property

- **WHEN** the user runs `cyberismo update test/reports/children change content/queryTemplate "{{#each results}}{{/each}}"`
- **THEN** the report's query template is changed

#### Scenario: Bad key

- **WHEN** the user runs `cyberismo update test/reports/children change other/queryTemplate x`
- **THEN** stderr starts with `Invalid key format: other/queryTemplate`
- **AND** the exit code is 1

### Requirement: Update of a workflow change may take a state mapping file

`cyberismo update <cardType> change workflow <old> <new> --mapping-file <path>` (`-m`) SHALL pass the file's `stateMapping` object to the workflow change as specified in `card-types`.

Source: both

#### Scenario: Workflow changed with a mapping

- **GIVEN** a file `mapping.json` holding `{"stateMapping": {"Open": "New"}}`
- **WHEN** the user runs `cyberismo update test/cardTypes/page change workflow test/workflows/old test/workflows/new --mapping-file mapping.json`
- **THEN** stdout is `Done`
- **AND** cards in state Open are in state New

### Requirement: A mapping file without a state mapping is refused

`cyberismo update` given a mapping file that is unreadable or has no `stateMapping` object SHALL fail with `Failed to read mapping file` and the cause, and change nothing.

Source: code

#### Scenario: Mapping file without stateMapping

- **GIVEN** a file `mapping.json` holding `{}`
- **WHEN** the user runs `cyberismo update test/cardTypes/page change workflow test/workflows/old test/workflows/new -m mapping.json`
- **THEN** stderr starts with `Failed to read mapping file`
- **AND** the exit code is 1

### Requirement: Remove deletes a resource by name

`cyberismo remove <resourceName>`, or `cyberismo remove <type> <resourceName>`, SHALL remove the resource as specified in `resources` and print `Done`.

Source: both

#### Scenario: Workflow removed

- **WHEN** the user runs `cyberismo remove workflow test/workflows/unused`
- **THEN** stdout is `Done`
- **AND** `cyberismo show workflows` no longer lists it

#### Scenario: Resource of an imported module

- **WHEN** the user runs `cyberismo remove base/workflows/default` and the resource belongs to an imported module
- **THEN** stderr states that the resource cannot be removed
- **AND** the exit code is 1

### Requirement: Remove with an unsupported type removes nothing

`cyberismo remove` given a type it cannot remove SHALL fail with `Unknown resource type '<type>'` and change nothing.

Source: code

#### Scenario: Unsupported type

- **WHEN** the user runs `cyberismo remove test/widgets/foo`
- **THEN** stderr states the unknown type
- **AND** the exit code is 1

### Requirement: Validate prints the findings or a success line

`cyberismo validate` SHALL validate the project as specified in `validation` and print `Project structure validated` and exit with code 0 when there are no errors, and otherwise print the errors one per line to stdout.

Source: code

#### Scenario: Valid project

- **WHEN** the user runs `cyberismo validate` in a valid project
- **THEN** stdout is `Project structure validated`
- **AND** the exit code is 0

#### Scenario: Invalid project

- **GIVEN** card `<card3>` has the card type `test/cardTypes/missing`
- **WHEN** the user runs `cyberismo validate`
- **THEN** stdout is `Card '<card3>' has invalid card type 'test/cardTypes/missing'`

### Requirement: Calc generate writes the logic program to a file

`cyberismo calc generate <destination> [query]` SHALL write the project's logic program, or the program of the named built-in query, to the destination file and print `Done`. The content of a built-in query's program is not part of this contract.

Source: both

#### Scenario: Whole program

- **WHEN** the user runs `cyberismo calc generate all.txt`
- **THEN** stdout is `Done`
- **AND** `all.txt` holds the project's logic program

#### Scenario: Unknown query

- **WHEN** the user runs `cyberismo calc generate x.txt bogus`
- **THEN** stderr starts with `Unknown query 'bogus'` and lists the valid query names
- **AND** the exit code is 1

### Requirement: Calc run prints the result of a logic program

`cyberismo calc run <filePath>` SHALL run the logic program in the file together with the project's program as specified in `logic/calculations` and print the result as JSON.

Source: both

#### Scenario: Tree query run

- **GIVEN** a file `tree.txt` holding the built-in tree query
- **WHEN** the user runs `cyberismo calc run tree.txt`
- **THEN** stdout is the JSON result of the query

### Requirement: Context option selects the execution context and defaults to commandLine

`cyberismo calc run` and `cyberismo report` SHALL accept `--context` (`-c`) with one of the execution contexts and SHALL default to `commandLine`.

Source: both, jira (INTDEV-1178)

#### Scenario: Default context

- **GIVEN** a program whose result differs by context
- **WHEN** the user runs `cyberismo calc run context.txt`
- **THEN** the result is the one for the context `commandLine`

#### Scenario: Invalid context

- **WHEN** the user runs `cyberismo calc run context.txt -c nowhere`
- **THEN** stderr names the invalid choice
- **AND** the exit code is 1

### Requirement: Report runs the report named in a parameters file

`cyberismo report <parameters> [output]` SHALL read the report name and its parameters from the JSON file, run the report as specified in `reports`, and print the result to stdout.

Source: both

#### Scenario: Report printed

- **GIVEN** `report.json` names `test/reports/children` with the parameter `cardKey` of a card that has one child titled Child
- **WHEN** the user runs `cyberismo report report.json`
- **THEN** stdout is `* Child`

#### Scenario: Missing card key parameter

- **GIVEN** `report.json` names the report with no parameters
- **WHEN** the user runs `cyberismo report report.json`
- **THEN** stderr states that the parameters file must include a `cardKey` field
- **AND** the exit code is 1

### Requirement: Report with an output file writes the result to the file

`cyberismo report <parameters> <output>` SHALL write the report to the output file instead of stdout and print `Done`; a file that cannot be written SHALL fail with `Failed to write report to <output>`.

Source: code

#### Scenario: Written to a file

- **WHEN** the user runs `cyberismo report report.json out.txt`
- **THEN** stdout is `Done`
- **AND** `out.txt` holds `* Child`

### Requirement: Report with no result says so

`cyberismo report` whose report returns nothing SHALL print `No report results`.

Source: code

#### Scenario: Empty result

- **GIVEN** `report.json` names a card with no children
- **WHEN** the user runs `cyberismo report report.json`
- **THEN** stdout is `No report results`
