# rest/conventions Specification

## Purpose

The rules every route of the backend HTTP API shares: how a project is addressed, how requests are validated, how failures become status codes and error bodies, and how the API behaves in a static export. Route-specific behaviour is in the other `rest/` capabilities; the rules behind each refusal belong to the domain capabilities.

## Requirements

### Requirement: Project routes are scoped by the project prefix

Every route that works on one project SHALL be addressed as `/api/projects/{prefix}/...`, where `{prefix}` is the project's card key prefix.

Source: code

#### Scenario: Cards of the decision project

- **WHEN** a client requests `GET /api/projects/decision/cards`
- **THEN** the response is 200 with the project info of the project whose prefix is decision

### Requirement: An unknown project prefix is refused with 404

A request scoped to a prefix that names no project SHALL be refused with status 404 and an error body naming the prefix.

Source: code

#### Scenario: Unknown prefix

- **WHEN** a client requests `GET /api/projects/nonexistent/cards`
- **THEN** the response is 404
- **AND** the error message contains nonexistent

### Requirement: A project's data is not served under another prefix

A route scoped to one project SHALL only return data of that project.

Source: code

#### Scenario: Card of another project

- **GIVEN** projects decision and mini, and card decision_5 in decision
- **WHEN** a client requests `GET /api/projects/mini/cards/decision_5`
- **THEN** the response is not 200

### Requirement: Several projects are served by one backend

The backend SHALL serve every project of its directory side by side, each under its own prefix.

Source: code

#### Scenario: Two projects

- **GIVEN** projects decision and mini in one directory
- **WHEN** a client requests the tree of each
- **THEN** each response lists only cards of its own project

### Requirement: A renamed project is served under its new prefix only

After a project's prefix is changed, its routes SHALL be served under the new prefix and no longer under the old one.

Source: code

#### Scenario: Rename decision to renamed

- **GIVEN** the decision project
- **WHEN** its prefix is changed to renamed
- **THEN** `/api/projects/renamed/project` answers 200
- **AND** `/api/projects/decision/project` answers 404

### Requirement: Invalid request input is refused with 400

A request whose body, query or path parameters do not match the route's declared shape SHALL be refused with status 400 and a body with an `error` message naming the invalid input, before any domain operation runs.

Source: code

#### Scenario: Missing required field

- **WHEN** a client posts `{"name": "Missing Prefix"}` to `POST /api/projects`
- **THEN** the response is 400
- **AND** the body has an `error` message

### Requirement: A domain refusal is served with the status of its kind

A refusal raised by a domain operation SHALL be served with the status of its error kind: not found as 404, read-only and permission denied as 403, conflict and cycle as 409, validation and container mismatch as 400, and every other kind as 500.

Source: code

#### Scenario: Missing resource

- **WHEN** a client deletes `decision/linkTypes/nope` with `DELETE /api/projects/decision/resources/decision/linkTypes/nope`
- **THEN** the response is 404 with code not-found

#### Scenario: Cycle

- **WHEN** an operation is refused because it would create a cycle
- **THEN** the response is 409 with code cycle

### Requirement: Error bodies carry the code and the message

A domain error response SHALL be a JSON body with `error` and `message` holding the same text, a `code` naming the error kind, and `details` only when the error has details.

Source: code

#### Scenario: Card not found

- **WHEN** a domain operation refuses with a card-not-found error for card_1
- **THEN** the body has `error` and `message` with the same text
- **AND** `code` is not-found

### Requirement: An unexpected failure is served as 500 with code internal

An error that is not a domain error SHALL be served with status 500, code internal and its message.

Source: code

#### Scenario: Filesystem failure

- **WHEN** a request fails with an error that is not a domain error, such as a missing file
- **THEN** the response is 500
- **AND** `code` is internal

### Requirement: Remote detail of a module failure is not sent to the client

An error from reaching a module source SHALL be served with a message naming the module but SHALL NOT include the underlying remote output or location.

Source: code

#### Scenario: Unreachable module source

- **GIVEN** module modg whose source is `https://127.0.0.1:1/x.git`
- **WHEN** a client requests `GET /api/projects/test/project/modules/versions?module=modg`
- **THEN** the response is 500
- **AND** the body names modg
- **AND** the body does not contain 127.0.0.1

### Requirement: Some routes report failures as a plain error message

The card, card tree, resource list and creation routes SHALL report their own failures as a body with only an `error` message and the status stated for the route in its capability, without `code`.

Source: code

#### Scenario: Unknown card

- **WHEN** a client requests `GET /api/projects/decision/cards/bogus`
- **THEN** the response is 400
- **AND** the body has an `error` message and no `code`

### Requirement: An unknown API path is answered with 404

A request under `/api` that matches no route SHALL be answered with status 404.

Source: code

#### Scenario: Bogus path

- **WHEN** a client requests `GET /api/bogus`
- **THEN** the response is 404

### Requirement: Public application configuration is available without an identity

`GET /api/config` SHALL answer without requiring an identity, with whether the backend serves a static export and the configured logout address, default project and extension address when set.

Source: code

#### Scenario: Live backend

- **WHEN** a client requests `GET /api/config` without credentials
- **THEN** the response is 200
- **AND** `staticMode` is false

### Requirement: A static export serves its routes at concrete prefixes

In static export mode the backend SHALL serve the project routes at each exported prefix, and a prefix that was not exported SHALL be answered with 404.

Source: code

#### Scenario: Exported prefixes

- **GIVEN** a static export of projects decision and mini
- **WHEN** a client requests the cards of each, and of nonexistent
- **THEN** the first two answer 200 and the third answers 404

### Requirement: Routes that need a live service are not exported statically

In a static export, routes that depend on live services (the event stream, module version lookups) SHALL NOT be exported, and the template and connector lists SHALL be empty.

Source: code

#### Scenario: Templates in an export

- **GIVEN** a static export
- **WHEN** a client requests `GET /api/projects/decision/templates`
- **THEN** the response is 200 with an empty list
