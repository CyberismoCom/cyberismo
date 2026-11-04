# mcp/tools Specification

## Purpose

The 40 tools an AI assistant calls on the Cyberismo MCP server: names, inputs, result and error shapes, and which operation each runs. The operations are specified in `cards/*`, `links`, `workflows`, `templates`, `resources`, `card-types`, `fields/field-types`, `logic/calculations`, `reports`, `graphs` and `skills`; how a project and a user are chosen is specified in `mcp/server`.

## Requirements

### Requirement: A successful tool call returns a JSON text with success true

A tool call that succeeds SHALL return one text content holding JSON indented by two spaces whose first field is `success` with the value `true`, followed by the tool's result fields.

Source: code

#### Scenario: Result of a write

- **WHEN** the client calls `create_label` with `cardKey` `decision_5` and `label` `urgent`
- **THEN** the result text parses as `{"success": true, "cardKey": "decision_5", "label": "urgent"}`
- **AND** the result is not marked as an error

### Requirement: A failed tool call returns an error result with the failure message

A tool call whose operation fails SHALL return a result marked as an error whose text is `Error <action>: <message>`, naming what the tool was doing, and SHALL leave the project unchanged.

Source: both

#### Scenario: Unknown card

- **WHEN** the client calls `get_card` with `cardKey` `nonexistent_key_999`
- **THEN** the result is marked as an error
- **AND** its text starts with `Error getting card:`

### Requirement: Inputs that do not match the tool's shape are refused

A tool call whose arguments do not match the tool's declared input, such as a missing required argument, an unknown enum value or a negative index, SHALL be refused as invalid input before any operation runs.

Source: code

#### Scenario: Negative index

- **WHEN** the client calls `rank_card_by_index` with `index` -1
- **THEN** the call is refused as invalid input
- **AND** no card changes

### Requirement: List projects returns the available projects

`list_projects` SHALL return the available projects, with their prefixes, in `projects`, and takes no `projectPrefix`.

Source: both

#### Scenario: Two projects

- **WHEN** the client calls `list_projects`
- **THEN** `projects` holds an entry for each of `decision` and `other`

### Requirement: Get card returns the rendered card with its working data

`get_card` with `cardKey` SHALL return in `card` the card's key, title, card type, workflow state, available transitions, raw and rendered content, fields with their values and visibility, labels, links, children, parent, attachments, denied operations, notifications and policy checks.

Source: both

#### Scenario: Card read

- **WHEN** the client calls `get_card` with `projectPrefix` `decision` and `cardKey` `decision_5`
- **THEN** `card` has the keys `key`, `title`, `workflowState`, `availableTransitions`, `rawContent`, `parsedContent`, `fields`, `deniedOperations` and `policyChecks`

### Requirement: Get card with raw returns the basic card data

`get_card` with `raw` true SHALL return in `card` the basic card data, without macro evaluation and without the extended metadata.

Source: both

#### Scenario: Raw card

- **WHEN** the client calls `get_card` with `cardKey` `decision_5` and `raw` true
- **THEN** `card` has no `parsedContent`

### Requirement: List cards returns the card hierarchy

`list_cards` SHALL return in `cards` the project's cards as a tree of parents and children.

Source: both

#### Scenario: Tree listed

- **WHEN** the client calls `list_cards`
- **THEN** `cards` holds the root cards, each with its children

### Requirement: Create card returns the created cards

`create_card` with `template` and optional `parentKey` SHALL create the cards of the template as specified in `cards/creation`, at the root when `parentKey` is omitted, and return in `created` the key and title of each created card.

Source: both

#### Scenario: Card created

- **WHEN** the client calls `create_card` with `template` `base/templates/page`
- **THEN** `created` lists one entry with the new card's `key` and `title`

### Requirement: Edit card content replaces the AsciiDoc content

`edit_card_content` with `cardKey` and `content` SHALL replace the card's content as specified in `cards/editing` and return `cardKey`.

Source: both

#### Scenario: Content edited

- **WHEN** the client calls `edit_card_content` with `cardKey` `decision_5` and `content` `== Updated`
- **THEN** the result has `cardKey` `decision_5`
- **AND** `get_card` returns raw content `== Updated`

#### Scenario: Edit denied

- **GIVEN** the project denies content edits of the card
- **WHEN** the client calls `edit_card_content`
- **THEN** the result is an error starting `Error editing content:` that carries the denial message

### Requirement: Edit card metadata sets one field and null clears it

`edit_card_metadata` with `cardKey`, `field` and `value`, a string, number, boolean, list of strings or null, SHALL set the field as specified in `cards/editing` and `fields/field-values`, and return `cardKey`, `field` and `value`.

Source: both

#### Scenario: Title changed

- **WHEN** the client calls `edit_card_metadata` with `cardKey` `decision_5`, `field` `title` and `value` `New title`
- **THEN** the result has `field` `title` and `value` `New title`

#### Scenario: Value cleared

- **WHEN** the client calls `edit_card_metadata` with `field` `test/fieldTypes/note` and `value` null
- **THEN** the field has no stored value

### Requirement: Transition card applies a workflow transition

`transition_card` with `cardKey` and `transition` SHALL apply the transition as specified in `workflows` and return `cardKey` and `transition`.

Source: both

#### Scenario: Transitioned

- **WHEN** the client calls `transition_card` with `cardKey` `decision_5` and `transition` `Approve`
- **THEN** the result has `transition` `Approve`
- **AND** `get_card` shows the new workflow state

### Requirement: Move card moves a card under a parent or to the root

`move_card` with `cardKey` and `destinationKey`, where `root` means the top level, SHALL move the card as specified in `cards/hierarchy` and return `cardKey` and `newParent`.

Source: both

#### Scenario: Moved to the root

- **WHEN** the client calls `move_card` with `cardKey` `decision_6` and `destinationKey` `root`
- **THEN** the result has `newParent` `root`

### Requirement: Remove card removes a card

`remove_card` with `cardKey` SHALL remove the card as specified in `cards/hierarchy` and return `removed` with the card key.

Source: both

#### Scenario: Card removed

- **WHEN** the client calls `remove_card` with `cardKey` `decision_6`
- **THEN** the result has `removed` `decision_6`

### Requirement: The rank tools place a card among its siblings

`rank_card_first` with `cardKey`, `rank_card_after` with `cardKey` and `afterCardKey`, and `rank_card_by_index` with `cardKey` and a zero-based `index` SHALL place the card as specified in `cards/hierarchy` and return their arguments, with `position` `first` for `rank_card_first`.

Source: both

#### Scenario: Ranked first

- **WHEN** the client calls `rank_card_first` with `cardKey` `decision_6`
- **THEN** the result has `position` `first`

#### Scenario: Ranked by index

- **WHEN** the client calls `rank_card_by_index` with `cardKey` `decision_6` and `index` 0
- **THEN** the result has `index` 0

### Requirement: Create attachment takes base64 content

`create_attachment` with `cardKey`, `filename` and base64 `content` SHALL add the decoded bytes to the card as specified in `cards/attachments` and return `cardKey` and `filename`.

Source: both

#### Scenario: Attachment added

- **WHEN** the client calls `create_attachment` with `filename` `notes.txt` and `content` `aGVsbG8=`
- **THEN** the result has `filename` `notes.txt`
- **AND** `get_card` lists the attachment `notes.txt`

### Requirement: Remove attachment removes a named attachment

`remove_attachment` with `cardKey` and `filename` SHALL remove the attachment as specified in `cards/attachments` and return `cardKey` and `filename`.

Source: both

#### Scenario: Attachment removed

- **WHEN** the client calls `remove_attachment` with `filename` `notes.txt`
- **THEN** `get_card` no longer lists `notes.txt`

### Requirement: The label tools list, add and remove labels

`list_labels` SHALL return in `labels` the unique labels of the project, `create_label` with `cardKey` and `label` SHALL add the label, and `remove_label` with `cardKey` and `label` SHALL remove it, as specified in `cards/editing`.

Source: both

#### Scenario: Label added and listed

- **WHEN** the client calls `create_label` with `cardKey` `decision_5` and `label` `urgent`, then `list_labels`
- **THEN** `labels` contains `urgent`

### Requirement: The link tools create and remove a link between two cards

`create_link` with `sourceKey`, `destinationKey`, `linkType` and optional `description` SHALL create the link, and `remove_link` with `sourceKey`, `destinationKey` and `linkType` SHALL remove it, as specified in `links`; each returns `sourceKey`, `destinationKey` and `linkType`.

Source: both

#### Scenario: Link created

- **WHEN** the client calls `create_link` with `linkType` `decision/linkTypes/relates`
- **THEN** the source card's links include the destination

#### Scenario: Link removed

- **GIVEN** a link of type `decision/linkTypes/relates` from `decision_5` to `decision_6`
- **WHEN** the client calls `remove_link` with those three values
- **THEN** the source card's links no longer include `decision_6`

### Requirement: The template tools list templates and add template cards

`list_templates` SHALL return in `templates` the project's templates, `create_template` with `name` and optional JSON `content` SHALL create a template, and `add_template_cards` with `templateName`, `cardTypeName`, optional `parentCard` and optional `count` of at least 1, default 1, SHALL add that many cards to the template, as specified in `templates`.

Source: both

#### Scenario: Cards added to a template

- **WHEN** the client calls `add_template_cards` with `templateName` `decision/templates/page`, `cardTypeName` `decision/cardTypes/page` and `count` 2
- **THEN** `created` lists two card keys

### Requirement: The create tools make resources of one type

`create_card_type` with `name` and `workflowName`, `create_field_type` with `name` and `dataType`, `create_workflow` with `name` and optional JSON `content`, `create_link_type`, `create_calculation`, `create_report`, `create_graph_model` and `create_graph_view` with `name` SHALL create the resource as specified in `resources`, and return the arguments.

Source: both

#### Scenario: Field type created

- **WHEN** the client calls `create_field_type` with `name` `score` and `dataType` `integer`
- **THEN** the result has `name` `score` and `dataType` `integer`

#### Scenario: Unknown data type

- **WHEN** the client calls `create_field_type` with `dataType` `text`
- **THEN** the call is refused as invalid input

### Requirement: Delete resource removes a resource of a listed type

`delete_resource` with `resourceType` one of `calculation`, `cardType`, `fieldType`, `graphModel`, `graphView`, `linkType`, `report`, `template` or `workflow` and `name` SHALL remove the resource as specified in `resources` and return `resourceType` and `name`.

Source: both

#### Scenario: Report deleted

- **WHEN** the client calls `delete_resource` with `resourceType` `report` and `name` `decision/reports/old`
- **THEN** the result has `name` `decision/reports/old`

#### Scenario: Skills not deletable

- **WHEN** the client calls `delete_resource` with `resourceType` `skill`
- **THEN** the call is refused as invalid input

### Requirement: Validate resource reports whether a resource is valid

`validate_resource` with the full resource `name` SHALL validate the resource as specified in `resources` and return `name`, `valid` and, when invalid, `errors`.

Source: both

#### Scenario: Valid resource

- **WHEN** the client calls `validate_resource` with `name` `decision/cardTypes/page`
- **THEN** the result has `valid` true and no `errors`

### Requirement: Update file resource edits one property of a file-based resource

`update_file_resource` with `resource`, `key` and `operation` SHALL apply the operation to the property of a card type, field type, link type or workflow as specified in `resources`, accepting only the keys that type has, and return `resource`, `key`, `operation` and `text` `Successfully updated`.

Source: both, jira (INTDEV-1204)

#### Scenario: Display name changed

- **WHEN** the client calls `update_file_resource` with `resource` `decision/cardTypes/page`, `key` `displayName` and `operation` `{"name": "change", "to": "Page"}`
- **THEN** the result has `text` `Successfully updated`

#### Scenario: Key of another type

- **WHEN** the client calls `update_file_resource` with `resource` `decision/workflows/flow` and `key` `customFields`
- **THEN** the call is refused as invalid input

### Requirement: Update folder resource edits a property or a content part of a folder-based resource

`update_folder_resource` with `resource` and `query`, a `key` with an `operation` or `key` `content` with a `subKey` and an `operation`, SHALL apply the operation to a calculation, graph model, graph view, report or template as specified in `resources`, and return the resource, key, sub-key, operation and `text` `Successfully updated`.

Source: both, jira (INTDEV-1204)

#### Scenario: Report query template changed

- **WHEN** the client calls `update_folder_resource` with `resource` `decision/reports/children`, and `query` `{"key": "content", "subKey": "queryTemplate", "operation": {"name": "change", "to": "x"}}`
- **THEN** the result has `subKey` `queryTemplate` and `text` `Successfully updated`

### Requirement: Run query runs a built-in query

`run_query` with `queryName` one of `card`, `onCreation`, `onTransition` or `tree` SHALL run that built-in query and return its output in `results`. The shape of the output is not part of this contract.

Source: both

#### Scenario: Tree query

- **WHEN** the client calls `run_query` with `queryName` `tree`
- **THEN** `results` holds the query results

### Requirement: Run logic program runs a program given as text

`run_logic_program` with `query` SHALL run the logic program text together with the project's program as specified in `logic/calculations` and return the output in `result`.

Source: both

#### Scenario: Program run

- **WHEN** the client calls `run_logic_program` with a program that selects all card keys
- **THEN** `result` holds the program's output

### Requirement: Run report runs a report for a card

`run_report` with `reportName`, `cardKey` and optional `parameters` SHALL run the report as specified in `reports`, with the card key as a parameter, in the context `localApp`, and return `reportName`, `cardKey` and `report`.

Source: both

#### Scenario: Report run

- **WHEN** the client calls `run_report` with `reportName` `decision/reports/children` and `cardKey` `decision_5`
- **THEN** `report` holds the report text

### Requirement: Run graph returns the graph as a PNG image

`run_graph` with `model` and `view` SHALL render the graph as specified in `graphs` and return one image content with MIME type `image/png` holding the base64 data, and no JSON text.

Source: code

#### Scenario: Graph rendered

- **WHEN** the client calls `run_graph` with `model` `decision/graphModels/tree` and `view` `decision/graphViews/tree`
- **THEN** the result is one content of type `image` with MIME type `image/png`

### Requirement: List skills returns the enabled skills

`list_skills` with optional `category` and `cardKey` SHALL return in `skills` the lightweight summaries of the skills currently enabled, narrowed by category and card as specified in `skills`.

Source: both, jira (INTDEV-1334)

#### Scenario: Skills for a card

- **GIVEN** the global skill `mod/skills/review` and the skill `mod/skills/triage` enabled for `decision_5`
- **WHEN** the client calls `list_skills` with `cardKey` `decision_6`
- **THEN** `skills` has `mod/skills/review` and not `mod/skills/triage`

### Requirement: Get skill returns instructions or says why not

`get_skill` with `name` and optional `cardKey` SHALL return in `skill` the full rendered instructions of an enabled skill; for a skill that does not exist, is not enabled, needs a card key, or is given a card that does not exist it SHALL return a successful result with `enabled` and a `message` saying which and what to do next.

Source: both, jira (INTDEV-1334)

#### Scenario: Skill rendered

- **WHEN** the client calls `get_skill` with `name` `mod/skills/review`
- **THEN** `skill` holds the instructions

#### Scenario: Needs a card

- **WHEN** the client calls `get_skill` with `name` `mod/skills/triage` and no `cardKey`
- **THEN** the result has `enabled` true and a `message` saying to call again with a `cardKey`
- **AND** the result is not marked as an error

#### Scenario: Not enabled

- **WHEN** the client calls `get_skill` for a skill that is not enabled
- **THEN** the result has `enabled` false and a `message` pointing to `list_skills`
