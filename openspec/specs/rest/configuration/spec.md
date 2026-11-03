# rest/configuration Specification

## Purpose

The routes of a project's configuration resources: card types, field types, link types, workflows, templates, calculations, reports, graph models, graph views, skills and logic programs, plus the generic resource routes. What each resource is and which changes are valid is specified in `resources`, `card-types`, `fields/field-types`, `links`, `workflows`, `templates`, `logic/calculations` and the other domain capabilities; this capability covers the routes, request shapes, responses and statuses. Roles are in `rest/auth`.

## Requirements

### Requirement: Card types are listed with their details

`GET .../cardTypes` SHALL return every card type of the project with its details, and a failure SHALL be answered with 500 and an `error` message.

Source: code

#### Scenario: Card types

- **WHEN** a client requests `GET /api/projects/decision/cardTypes`
- **THEN** the response is 200 with a list including decision/cardTypes/decision

### Requirement: Field types, link types and templates are listed

`GET .../fieldTypes`, `GET .../linkTypes` and `GET .../templates` SHALL each return the project's resources of that kind with their details.

Source: code

#### Scenario: Field types

- **WHEN** a client requests `GET /api/projects/decision/fieldTypes`
- **THEN** the response is 200 with a list of field types, each with its data type

### Requirement: Resources of a kind are created by identifier

`POST` on `.../cardTypes`, `.../fieldTypes`, `.../linkTypes`, `.../workflows`, `.../templates`, `.../calculations`, `.../reports`, `.../graphModels`, `.../graphViews` and `.../skills` with an `identifier` SHALL create that resource in the project and respond 200 with a success message.

Source: code

#### Scenario: Create a workflow

- **WHEN** a client posts `{"identifier": "newflow"}` to `POST /api/projects/decision/workflows`
- **THEN** the response is 200
- **AND** the workflow decision/workflows/newflow exists

### Requirement: A resource identifier must be valid

A creation request whose `identifier` is not a valid identifier name SHALL be refused with status 400.

Source: code

#### Scenario: Invalid skill identifier

- **WHEN** a client posts an identifier with a space to `POST /api/projects/decision/skills`
- **THEN** the response is 400

### Requirement: A card type is created with its workflow

`POST .../cardTypes` SHALL also require `workflowName`, and a request without it SHALL be refused with status 400.

Source: code

#### Scenario: No workflow

- **WHEN** a client posts identifier test-cardtype without workflowName
- **THEN** the response is 400

### Requirement: A field type is created with a data type

`POST .../fieldTypes` SHALL also require `dataType`, one of the data types specified in `fields/field-types`, and refuse any other value with status 400.

Source: code

#### Scenario: Unknown data type

- **WHEN** a client posts dataType colour to `POST /api/projects/decision/fieldTypes`
- **THEN** the response is 400

### Requirement: A card type's field visibility is changed in one request

`PATCH .../cardTypes/{cardTypeName}/field-visibility` with `fieldName`, `group` of always, optional or hidden and an optional `index` SHALL move the field to that group and position as specified in `card-types` and respond 200 with a message.

Source: code

#### Scenario: Always to optional

- **GIVEN** field decision/fieldTypes/admins is always visible on decision/cardTypes/decision
- **WHEN** a client patches fieldName decision/fieldTypes/admins and group optional
- **THEN** the response is 200
- **AND** the field is in the card type's optionally visible fields

### Requirement: A field visibility request is validated

A field visibility request with a missing `fieldName`, a missing or unknown `group` or a negative `index` SHALL be refused with status 400.

Source: code

#### Scenario: Unknown group

- **WHEN** a client patches group sometimes
- **THEN** the response is 400

### Requirement: A field visibility request for something unknown is answered with 404

A field visibility request naming a card type or a field the card type lacks SHALL be answered with status 404.

Source: code

#### Scenario: Field the card type lacks

- **WHEN** a client patches fieldName decision/fieldTypes/nope
- **THEN** the response is 404

### Requirement: A template card is added with its card type

`POST .../templates/card` with `template`, `cardType` and optionally `parentKey` and a positive integer `count` SHALL add that many cards to the template as specified in `templates` and respond 200 with `cards`, the added cards.

Source: code

#### Scenario: Two cards

- **WHEN** a client posts template decision/templates/decision, a card type and count 2
- **THEN** the response is 200 with two cards in `cards`

### Requirement: A template card request is validated

A template card request without `cardType`, or with a `count` that is not a positive integer, SHALL be refused with status 400.

Source: code

#### Scenario: Zero count

- **WHEN** a client posts count 0
- **THEN** the response is 400

### Requirement: The resources of the project are returned as a tree

`GET .../resources/tree` SHALL return the project's resources, and those of its modules, grouped by kind and sorted by display name, and a failure SHALL be answered with 500 and an `error` message.

Source: code

#### Scenario: Created skill in the tree

- **GIVEN** a skill created in the project
- **WHEN** a client requests `GET /api/projects/decision/resources/tree`
- **THEN** the response is 200 and the skill is listed with its content files

### Requirement: A resource is validated on request

`GET .../resources/{prefix}/{type}/{identifier}/validate` SHALL return the validation errors of that one resource as a list of messages, empty when valid.

Source: code

#### Scenario: Valid field type

- **WHEN** a client requests the validate route of decision/fieldTypes/admins
- **THEN** the response is 200 with an empty `errors` list

### Requirement: Resource routes accept only known resource types and valid identifiers

A resource route whose `type` is not one of calculations, cardTypes, fieldTypes, graphModels, graphViews, linkTypes, reports, skills, templates or workflows, or whose identifier is invalid, SHALL be refused with status 400.

Source: code

#### Scenario: Unknown type

- **WHEN** a client requests `.../resources/decision/widgets/x/validate`
- **THEN** the response is 400

### Requirement: A resource is deleted

`DELETE .../resources/{prefix}/{type}/{identifier}` SHALL delete the resource and respond 200 with a message, and an unknown resource SHALL be answered with 404.

Source: code

#### Scenario: Missing resource

- **WHEN** a client deletes decision/linkTypes/nope
- **THEN** the response is 404 with code not-found

### Requirement: A resource is edited by an operation

`POST .../resources/{prefix}/{type}/{identifier}/operation` with an `updateKey` and an `operation` of add, change, remove or rank SHALL apply that edit to the resource and respond 200 with a message.

Source: code

#### Scenario: Change a display name

- **WHEN** a client posts updateKey displayName and operation change to Decision on decision/cardTypes/decision
- **THEN** the response is 200
- **AND** the card type's display name is Decision

### Requirement: An operation request is validated

An operation request with an unknown operation name, or an update key of `content` without a sub key, SHALL be refused with status 400.

Source: code

#### Scenario: Unknown operation

- **WHEN** a client posts operation name invalid_operation
- **THEN** the response is 400

### Requirement: An operation on a missing resource is answered with 404

An operation request that names a resource, or a resource inside the edit, that does not exist SHALL be answered with status 404 and code not-found.

Source: code

#### Scenario: Missing resource

- **WHEN** a client posts an operation to decision/cardTypes/nope
- **THEN** the response is 404 with code not-found

### Requirement: A workflow graph is returned as an image

`GET .../resources/{prefix}/workflows/{identifier}/graph` SHALL respond 200 with `svg`, the workflow's state machine as an SVG document, and with `?card=` the card's current state highlighted.

Source: code

#### Scenario: Graph with a card

- **WHEN** a client requests the graph of decision/workflows/decision with `?card=decision_5`
- **THEN** the response is 200 with an `svg` document

### Requirement: A workflow graph for something unknown is answered with 404

A workflow graph request for an unknown workflow or an unknown card SHALL be answered with status 404.

Source: code

#### Scenario: Unknown workflow

- **WHEN** a client requests the graph of decision/workflows/nope
- **THEN** the response is 404

### Requirement: A skill can be previewed with unsaved content

`POST .../resources/{prefix}/skills/{identifier}/preview` with optional `skillContent`, `skillQuery` and `cardKey` SHALL respond 200 with `instructions`, the skill rendered with those values in place of the saved ones, without saving.

Source: code

#### Scenario: Unsaved content

- **WHEN** a client posts skillContent Hello {{name}} to a skill's preview
- **THEN** the response is 200 with `instructions`
- **AND** the saved skill is unchanged

### Requirement: A skill preview that cannot run is refused

A skill preview for an unknown skill or card SHALL be answered with 404, and one whose content or query is broken with 400 and the error.

Source: code

#### Scenario: Broken query

- **WHEN** a client posts a skillQuery that does not run
- **THEN** the response is 400 with an `error` message

### Requirement: A logic program is returned for a card or a resource

`GET .../logicPrograms/{prefix}/{type}/{identifier}` SHALL respond 200 with `logicProgram`, the logic program of the card or the resource, where the type is `cards` or a resource type.

Source: code

#### Scenario: Card type

- **WHEN** a client requests the logic program of decision/cardTypes/decision
- **THEN** the response is 200 with `logicProgram`

### Requirement: A logic program for an unknown card is answered with 404

A logic program request for an unknown card SHALL be answered with status 404 and an error naming the card.

Source: code

#### Scenario: Unknown card

- **WHEN** a client requests the logic program of decision/cards/nonexistent_card
- **THEN** the response is 404 and the error names nonexistent_card
