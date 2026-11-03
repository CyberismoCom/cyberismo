# rest/cards Specification

## Purpose

The routes of a project's cards: listing, reading, creating, updating and deleting cards, attachments, content parsing, links, labels, the card tree, connectors and PDF export. What each operation does is specified in `cards/creation`, `cards/editing`, `cards/hierarchy`, `cards/attachments` and `links`; this capability covers the routes, request shapes, response shapes and statuses. Which role each route needs is in `rest/auth`.

## Requirements

### Requirement: The project's card overview is listed

`GET /api/projects/{prefix}/cards` SHALL return the project's name and prefix with its workflows and card types, and no card content.

Source: code

#### Scenario: Decision project

- **WHEN** a client requests `GET /api/projects/decision/cards`
- **THEN** the response is 200 with name decision, the prefix, the workflows and the card types

### Requirement: A card is read with its rendered content

`GET /api/projects/{prefix}/cards/{key}` SHALL return the card's metadata, fields, links, its content both as source text and rendered, its attachments and its path.

Source: code

#### Scenario: Card decision_5

- **WHEN** a client requests `GET /api/projects/decision/cards/decision_5`
- **THEN** the response is 200 with key decision_5, `rawContent`, `adocContent` and `attachments`

### Requirement: A card can be read without calculated data

`GET .../cards/{key}?raw=true` SHALL return the card as stored, with empty links, notifications and policy checks and no workflow state.

Source: code

#### Scenario: Raw card

- **WHEN** a client requests `GET /api/projects/decision/cards/decision_5?raw=true`
- **THEN** the response is 200
- **AND** `links` is empty and `workflowState` is empty

### Requirement: Reading an unknown card is refused with 400

`GET .../cards/{key}` for a key that names no card SHALL be refused with status 400 and an `error` message.

Source: code

#### Scenario: Bogus key

- **WHEN** a client requests `GET /api/projects/decision/cards/bogus`
- **THEN** the response is 400

### Requirement: A card is updated by one patch

`PATCH .../cards/{key}` SHALL apply the given state, content, metadata fields, parent and index together as one change, as specified in `workflows`, `cards/editing`, `fields/field-values` and `cards/hierarchy`, and respond with the card as `GET` would.

Source: code

#### Scenario: Title changed

- **WHEN** a client patches decision_5 with `{"metadata": {"title": "New title"}}`
- **THEN** the response is 200 with title New title
- **AND** the card's other metadata fields are unchanged

#### Scenario: Labels changed

- **WHEN** a client patches decision_5 with `{"metadata": {"labels": ["urgent"]}}`
- **THEN** the response is 200 with labels urgent

### Requirement: A failed patch is refused with 400

A patch that names an unknown card, or whose changes the domain refuses, SHALL be refused with status 400 and the message as plain text, and SHALL change nothing.

Source: code

#### Scenario: Unknown card

- **WHEN** a client patches bogus_999 with `{"metadata": {"title": "Should Fail"}}`
- **THEN** the response is 400

### Requirement: A card is created from a template

`POST .../cards/{key}` with `{"template": ...}` SHALL create cards from the template as specified in `cards/creation`, under the card {key}, or at the root when {key} is `root`, and respond 200 with the created cards.

Source: code

#### Scenario: Create at root

- **WHEN** a client posts `{"template": "decision/templates/decision"}` to `POST /api/projects/decision/cards/root`
- **THEN** the response is 200 with the list of created cards

### Requirement: A card creation without a template is refused

`POST .../cards/{key}` without a template SHALL be refused with status 400, and a refusal by the domain SHALL be answered with 400 and an `error` message.

Source: code

#### Scenario: No template

- **WHEN** a client posts `{}` to `POST /api/projects/decision/cards/root`
- **THEN** the response is 400

### Requirement: A card is deleted

`DELETE .../cards/{key}` SHALL delete the card as specified in `cards/hierarchy` and respond 204 with no body, and a refusal SHALL be answered with 400 and an `error` message.

Source: code

#### Scenario: Delete a card

- **WHEN** a client deletes an existing card
- **THEN** the response is 204

#### Scenario: Delete an unknown card

- **WHEN** a client deletes bogus_999
- **THEN** the response is 400

### Requirement: Attachments are uploaded as multipart files

`POST .../cards/{key}/attachments` SHALL add every file sent in the multipart field `files` to the card as one change and respond 200 with the names of the added files.

Source: code

#### Scenario: Two files

- **WHEN** a client uploads a.png and b.png in the field files
- **THEN** the response is 200 listing a.png and b.png

### Requirement: An upload without files is refused with 400

`POST .../cards/{key}/attachments` with no file SHALL be refused with status 400 and an `error` message.

Source: code

#### Scenario: Empty upload

- **WHEN** a client posts a form with no files
- **THEN** the response is 400 with an `error` message

### Requirement: An attachment is removed by file name

`DELETE .../cards/{key}/attachments/{filename}` SHALL remove the attachment and respond 200 with a message.

Source: code

#### Scenario: Remove an attachment

- **WHEN** a client deletes attachment notes.pdf of decision_5
- **THEN** the response is 200

### Requirement: An attachment is served as a file

`GET .../cards/{key}/a/{attachment}` SHALL respond with the file's bytes, its media type in `Content-Type`, a `Content-Disposition` of attachment with the file name, and `Cache-Control: no-store`.

Source: code

#### Scenario: Image attachment

- **WHEN** a client requests `GET /api/projects/decision/cards/decision_1/a/the-needle.heic`
- **THEN** the response is 200 with the file's media type and `Cache-Control: no-store`

### Requirement: A missing attachment is answered with 404

`GET .../cards/{key}/a/{attachment}` for an attachment or card that does not exist, or a name that climbs out of the card's folder, SHALL be answered with status 404 and an `error` message.

Source: code

#### Scenario: Missing file

- **WHEN** a client requests `GET /api/projects/decision/cards/decision_1/a/bogus.gif`
- **THEN** the response is 404

### Requirement: Draft content is rendered on request

`POST .../cards/{key}/parse` with `{"content": ...}` SHALL respond 200 with `adocContent`, the content rendered in the context of card {key}, without saving it.

Source: code

#### Scenario: Parse a draft

- **WHEN** a client posts `{"content": "Hello"}` to the parse route of decision_5
- **THEN** the response is 200 with `adocContent`
- **AND** the card's stored content is unchanged

### Requirement: Parsing without content is refused with 400

`POST .../cards/{key}/parse` without `content` SHALL be refused with status 400, and a failure to render SHALL be answered with 500 and an `error` message.

Source: code

#### Scenario: No content

- **WHEN** a client posts `{}` to the parse route
- **THEN** the response is 400 with `error` Content is required

### Requirement: A link is created, changed and removed by card

`POST`, `PUT` and `DELETE` on `.../cards/{key}/links` SHALL create, change and remove a link between card {key} and `toCard` of the given `linkType` as specified in `links`, with an optional description and a direction of outbound or inbound, and respond 200 with a message.

Source: code

#### Scenario: Create an inbound link

- **WHEN** a client posts `{"toCard": "decision_6", "linkType": "decision/linkTypes/test", "direction": "inbound"}` to the links of decision_5
- **THEN** the response is 200
- **AND** decision_6 links to decision_5

#### Scenario: Change a link's type

- **WHEN** a client puts the new type with `previousToCard`, `previousLinkType` and `previousDirection` of the existing link
- **THEN** the response is 200 and the card has only the new link

### Requirement: A link request defaults to outbound

`POST` and `DELETE` on `.../links` without a `direction` SHALL act as outbound, and `PUT` SHALL require the direction and the previous link's three identifying values.

Source: code

#### Scenario: Missing fields on change

- **WHEN** a client puts `{"toCard": "decision_6", "linkType": "decision/linkTypes/test"}` to the links of decision_5
- **THEN** the response is 400

### Requirement: Labels are listed sorted

`GET .../labels` SHALL return the project's labels, listed as specified in `cards/editing`, as a JSON list of strings.

Source: code

#### Scenario: Labels

- **WHEN** a client requests `GET /api/projects/decision/labels`
- **THEN** the response is 200 with a list of strings in ascending order

### Requirement: The card tree is returned as nested cards

`GET .../tree` SHALL return the project's cards as a tree of their children, and a failure SHALL be answered with 500 and an `error` message.

Source: code

#### Scenario: Decision tree

- **WHEN** a client requests `GET /api/projects/decision/tree`
- **THEN** the response is 200 with cards whose keys start with decision_ and their children

### Requirement: Connectors are listed with their items

`GET .../connectors` SHALL return each connector's name, display name and the external items it offers, each with key and title.

Source: code

#### Scenario: Connectors

- **WHEN** a client requests `GET /api/projects/decision/connectors`
- **THEN** the response is 200 with a list of connectors

### Requirement: A card is exported as a PDF

`POST .../cards/export-pdf` with title, name, cardKey, exportChildCards and optionally version SHALL respond 200 with the PDF as `application/pdf` and `Cache-Control: no-store`.

Source: code

#### Scenario: Export card decision_5

- **WHEN** a client posts title Exported, name exported, cardKey decision_5 and exportChildCards false
- **THEN** the response is 200 with content type `application/pdf`

### Requirement: A PDF export request must be well formed

A PDF export request missing a required value, or with a title, name or version containing a line break, SHALL be refused with status 400.

Source: code

#### Scenario: Missing values

- **WHEN** a client posts `{"name": "test"}` to export-pdf
- **THEN** the response is 400

#### Scenario: Multiline title

- **WHEN** a client posts a title containing a line break
- **THEN** the response is 400

### Requirement: A failed PDF export is answered with 500 without server diagnostics

A PDF export that fails SHALL be answered with status 500 and an `error` message, and SHALL NOT include the renderer's diagnostics.

Source: code

#### Scenario: Renderer failure

- **WHEN** the PDF renderer fails on a card
- **THEN** the response is 500 with an `error` message
- **AND** the body contains no renderer diagnostics
