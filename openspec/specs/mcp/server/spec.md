# mcp/server Specification

## Purpose

How an AI assistant connects to Cyberismo over the Model Context Protocol: the HTTP endpoint and its sessions, who a call acts as, how a project is chosen, and the read-only resources and skill prompts the server offers. The tools are specified in `mcp/tools`; the roles that may connect are specified in `rest/auth`; the operations behind the resources and prompts are specified in `resources`, `skills` and `cards/editing`.

## Requirements

### Requirement: The server tells the assistant to discover projects first

The server SHALL announce itself as `cyberismo` with the tool version, and its instructions SHALL tell the assistant to call `list_projects` and to pass `projectPrefix` to every tool call.

Source: code

#### Scenario: Initialize

- **WHEN** a client initializes a session
- **THEN** the server name is `cyberismo`
- **AND** the instructions say `Call list_projects to discover available projects. Pass projectPrefix to every tool call.`

### Requirement: The endpoint is served at slash mcp for users who can edit

The MCP endpoint SHALL be served over HTTP at `/mcp` on the backend and SHALL accept only requests from users with the editor role or above, as specified in `rest/auth`.

Source: both

#### Scenario: Editor connects

- **GIVEN** a user with the editor role
- **WHEN** the client sends an initialize message with `POST /mcp`
- **THEN** the response status is 200 or 202

#### Scenario: Reader refused

- **GIVEN** a user with the reader role
- **WHEN** the client sends `POST /mcp`
- **THEN** the response is the role refusal specified in `rest/auth`

### Requirement: A session starts with an initialize message and is identified by a header

A `POST /mcp` initialize message without a session SHALL start a session, and the response SHALL carry the session id in the `mcp-session-id` header, which the client sends on every later request.

Source: code

#### Scenario: Session started

- **WHEN** the client posts an initialize message
- **THEN** the response has an `mcp-session-id` header

### Requirement: A request for an unknown session is refused with 404

A request that names a session id the server does not know, for example after a restart, SHALL be answered with status 404 and the body `{"error": "Unknown session ID"}`.

Source: code

#### Scenario: Stale session id

- **WHEN** the client sends `POST /mcp` with the header `mcp-session-id: gone`
- **THEN** the status is 404
- **AND** the body is `{"error": "Unknown session ID"}`

### Requirement: A session cannot be used by another user

A request that names the session of another user SHALL be answered as if the session did not exist.

Source: code

#### Scenario: Other user's session

- **GIVEN** a session started by user `dana-1`
- **WHEN** user `eli-2` sends `POST /mcp` with that session id
- **THEN** the status is 404

### Requirement: Only an initialize POST starts a session

A request without a session id that is not a POST SHALL be answered with status 405 and an error saying to use POST to initialize a session.

Source: code

#### Scenario: GET without a session

- **WHEN** the client sends `GET /mcp` without a session id
- **THEN** the status is 405

### Requirement: DELETE closes the session

A `DELETE /mcp` with the user's session id SHALL close the session and answer `{"message": "Session closed"}`; later requests with that id SHALL be answered with 404.

Source: code

#### Scenario: Session closed

- **GIVEN** an open session
- **WHEN** the client sends `DELETE /mcp` with the session id
- **THEN** the body is `{"message": "Session closed"}`
- **AND** a later `POST /mcp` with the same id gets status 404

### Requirement: The number of sessions is limited

The server SHALL answer a new initialize with status 503 when the server already holds the maximum number of sessions, or the user already holds the maximum number of sessions, and SHALL close sessions that have been idle for a set time.

Source: code

#### Scenario: Too many sessions for one user

- **GIVEN** a user who already holds the maximum number of sessions
- **WHEN** the user posts another initialize message
- **THEN** the status is 503
- **AND** the body is `{"error": "Too many active sessions for this user"}`

### Requirement: A call acts as the user of the request

Every tool call, resource read and prompt request SHALL act as the user of that request, with the MCP client name as the agent, so that a write is attributed to that user; a call with no authenticated user SHALL be refused with `MCP request has no authenticated user`.

Source: both, jira (INTDEV-1212)

#### Scenario: Commit follows the request's user

- **GIVEN** a session started by Dana Editor, who is renamed to Dana Renamed before the next request
- **WHEN** the client calls `edit_card_content` with autocommit on
- **THEN** the commit author is Dana Renamed

#### Scenario: No authenticated user

- **GIVEN** a client connected without a user
- **WHEN** it calls `list_projects`
- **THEN** the result is an error whose text contains `MCP request has no authenticated user`

### Requirement: A tool names its project with projectPrefix

Every tool except `list_projects` SHALL take `projectPrefix` and act on the project with that prefix, there being no default project even when only one exists.

Source: both, jira (INTDEV-1213)

#### Scenario: Valid prefix

- **GIVEN** projects `decision` and `other`
- **WHEN** the client calls `list_cards` with `projectPrefix` `decision`
- **THEN** the result lists the cards of `decision`

#### Scenario: Prefix omitted

- **WHEN** the client calls `list_cards` without `projectPrefix`
- **THEN** the call is refused as an invalid input

### Requirement: An unknown prefix lists the available projects

A call whose `projectPrefix` names no available project SHALL fail with an error that names the prefix, lists the available prefixes and tells the assistant to ask the user which project to use; when there are no projects the error SHALL be `No projects available.`

Source: code

#### Scenario: Unknown project

- **GIVEN** projects `decision` and `other`
- **WHEN** the client calls `get_card` with `projectPrefix` `fake`
- **THEN** the result is an error saying `Unknown project 'fake'. Available projects: decision, other. Ask the user which project to use before retrying.`

#### Scenario: No projects

- **GIVEN** the server holds no projects
- **WHEN** the client calls `list_cards` with any prefix
- **THEN** the error is `No projects available.`

### Requirement: The server offers read-only resources of the project

The server SHALL offer the resource `cyberismo:///projects`, listing the projects, and, per project, the resources `cyberismo:///projects/{projectPrefix}/<name>` for `project`, `cards`, `card-types`, `workflows`, `templates`, `calculations`, `field-types`, `graph-models`, `graph-views`, `link-types` and `reports`, each read as JSON.

Source: both

#### Scenario: Resource templates listed

- **WHEN** the client lists resource templates
- **THEN** the list holds the eleven per-project resources with the `cyberismo:///` scheme

#### Scenario: Card types read

- **WHEN** the client reads `cyberismo:///projects/decision/card-types`
- **THEN** the result is one JSON entry with `application/json` content holding an array of the card type definitions

### Requirement: A resource read of an unknown project fails like a tool call

Reading a project resource for a prefix that is not available SHALL fail with the unknown-project error of the tools.

Source: code

#### Scenario: Unknown project resource

- **WHEN** the client reads `cyberismo:///projects/fake/cards`
- **THEN** the read fails with `Unknown project 'fake'` and the available prefixes

### Requirement: Each enabled skill is a prompt

`prompts/list` SHALL return one prompt for every skill currently enabled in any available project, named after the skill's full resource name, with its display name as title and its description, and with an optional `cardKey` argument for a skill enabled for specific cards; the list SHALL be recomputed on every request.

Source: both, jira (INTDEV-1335)

#### Scenario: Prompts listed

- **GIVEN** a global skill `mod/skills/review` and a card skill `mod/skills/triage` are enabled
- **WHEN** the client lists prompts
- **THEN** the prompts `mod/skills/review` and `mod/skills/triage` are listed
- **AND** only `mod/skills/triage` has the `cardKey` argument

### Requirement: Getting a prompt returns the skill's rendered instructions

`prompts/get` for an enabled skill SHALL return one user message that starts with the skill's display name, name, category and related tools and then holds the rendered instructions, resolving the skill in whichever project owns it.

Source: both, jira (INTDEV-1335)

#### Scenario: Skill rendered

- **WHEN** the client gets the prompt `mod/skills/review`
- **THEN** the message starts with `# <display name>` and a line `- **name:** \`mod/skills/review\``
- **AND** the rendered instructions follow

### Requirement: A prompt that cannot be rendered answers with an explanation, not an error

`prompts/get` for a skill that is not enabled, that needs a card key, for a card that does not exist, or that is unknown SHALL return a message explaining which of these applies and how to proceed, and SHALL NOT fail.

Source: both, jira (INTDEV-1334, INTDEV-1335)

#### Scenario: Card skill without a card

- **WHEN** the client gets the prompt `mod/skills/triage` with no `cardKey`
- **THEN** the message is `Skill 'mod/skills/triage' is enabled for specific cards. Provide a 'cardKey' argument to render it.`

#### Scenario: Unknown skill

- **WHEN** the client gets the prompt `mod/skills/nothing`
- **THEN** the message says the skill is not a known skill and points to `prompts/list`
