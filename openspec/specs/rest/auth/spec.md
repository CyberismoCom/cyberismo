# rest/auth Specification

## Purpose

How the backend HTTP API identifies the caller and decides what the caller may do: requests carry an identity from a configured provider, roles are ordered, and each route needs a minimum role. Domain capabilities hold no role concept; this capability owns the minimum role of every route.

## Requirements

### Requirement: Every API request carries an identity from the configured provider

Every request under `/api` other than `/api/config` SHALL be authenticated by the configured identity provider, and a request the provider does not identify SHALL be refused with status 401.

Source: code

#### Scenario: No identity

- **GIVEN** an identity provider that identifies no one
- **WHEN** a client requests `GET /api/projects/decision/cards`
- **THEN** the response is 401 with the body `{"error": "Unauthorized"}`

### Requirement: The current identity can be read

`GET /api/auth/me` SHALL return the caller's id, email, name and role.

Source: code

#### Scenario: Signed-in editor

- **GIVEN** an identity with id u1, name Dana Editor and role editor
- **WHEN** the client requests `GET /api/auth/me`
- **THEN** the response is 200 with those four values

### Requirement: Roles are ordered reader, editor, admin

The roles reader, editor and admin SHALL be ordered so that each role may do everything the roles below it may do.

Source: code

#### Scenario: Admin passes an editor route

- **GIVEN** an identity with role admin
- **WHEN** it patches a card
- **THEN** the request is not refused for its role

### Requirement: A route below the caller's role is refused with 403

A request to a route whose minimum role is above the caller's role SHALL be refused with status 403 and the body `{"error": "Forbidden"}` before any change.

Source: code

#### Scenario: Reader edits a card

- **GIVEN** an identity with role reader
- **WHEN** it sends `PATCH /api/projects/decision/cards/decision_5`
- **THEN** the response is 403

### Requirement: The connector role sits outside the order

The connector role SHALL be accepted only by routes that name it, and SHALL NOT pass a route merely because its minimum role is reader or editor.

Source: code

#### Scenario: Connector reads cards

- **GIVEN** an identity with role connector
- **WHEN** it requests `GET /api/projects/decision/cards`
- **THEN** the response is 403

#### Scenario: Connector creates a calculation

- **GIVEN** an identity with role connector
- **WHEN** it posts `{"identifier": "test"}` to `POST /api/projects/decision/calculations`
- **THEN** the response is 200

### Requirement: Reading routes need the reader role

The routes that only read SHALL need at least the reader role: project, card, tree, label, connector, template, card type, field type, link type, logic program and resource tree reads, resource validation, workflow graphs, card parsing, PDF export, module catalogues, hubs, and the list of projects.

Source: code

#### Scenario: Reader lists labels

- **GIVEN** an identity with role reader
- **WHEN** it requests `GET /api/projects/decision/labels`
- **THEN** the response is 200

### Requirement: Card changes need the editor role

Creating, updating and deleting cards, adding and removing attachments, and creating, updating and removing links SHALL need at least the editor role.

Source: code

#### Scenario: Editor patches a card

- **GIVEN** an identity with role editor
- **WHEN** it patches card decision_5 with a new title
- **THEN** the response is 200

### Requirement: Creating and cloning projects need the editor role

`POST /api/projects` and `POST /api/projects/clone` SHALL need at least the editor role.

Source: code

#### Scenario: Reader creates a project

- **GIVEN** an identity with role reader
- **WHEN** it posts a valid project to `POST /api/projects`
- **THEN** the response is 403

### Requirement: Configuration changes need the admin role

Creating resources, deleting resources, changing project settings, importing, updating and removing modules, managing hubs, cleaning the project, adding template cards, changing field visibility, and skill previews SHALL need the admin role.

Source: code

#### Scenario: Editor cleans the project

- **GIVEN** an identity with role editor
- **WHEN** it posts `{"dryRun": true}` to `POST /api/projects/test/project/clean`
- **THEN** the response is 403

#### Scenario: Editor previews a skill

- **GIVEN** an identity with role editor
- **WHEN** it posts to a skill preview route
- **THEN** the response is 403

### Requirement: Calculation creation and resource operations accept the connector role

`POST` on calculations and on a resource's operation route SHALL accept the admin role and the connector role, and no other.

Source: code

#### Scenario: Editor posts an operation

- **GIVEN** an identity with role editor
- **WHEN** it posts an operation to `/api/projects/decision/resources/decision/cardTypes/decision/operation`
- **THEN** the response is 403

#### Scenario: Connector posts an operation

- **GIVEN** an identity with role connector
- **WHEN** it posts an operation to that route
- **THEN** the response is not 403

### Requirement: Module version lookups need the admin role

`GET .../project/modules/versions` and `GET .../project/modules/update-plan` SHALL need the admin role.

Source: code

#### Scenario: Editor looks up versions

- **GIVEN** an identity with role editor
- **WHEN** it requests `GET /api/projects/test/project/modules/versions?module=modf`
- **THEN** the response is 403

### Requirement: A write is attributed to the requesting identity

A change made through the API SHALL be made with the caller's identity, name and email as the acting user specified in `projects/change-tracking`.

Source: code

#### Scenario: Committed as the user

- **GIVEN** a project with commits per write and an editor named Dana Editor with email dana@example.com
- **WHEN** the editor patches a card's labels
- **THEN** the latest commit's author is Dana Editor <dana@example.com>
