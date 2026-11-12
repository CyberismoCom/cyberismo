# rest/events Specification

## Purpose

The project change event stream: a long-lived response through which a client is told that cards of a project changed. Which changes are emitted is specified in `projects/change-tracking`; how the app reacts is in `ui/collaboration`. Specific presence behaviour is outside this open-source contract.

## Requirements

### Requirement: A project has a change event stream

`GET /api/projects/{prefix}/events` SHALL open a server-sent event stream for the project, for any identity allowed to read it.

Source: code

#### Scenario: Open the stream

- **WHEN** a signed-in client requests `GET /api/projects/decision/events`
- **THEN** the response is 200 with content type `text/event-stream`

### Requirement: The stream starts with a connection handle

The stream SHALL begin with an event named `ready` whose data is a JSON object with a `connectionId`.

Source: code

#### Scenario: First event

- **WHEN** a client opens the stream
- **THEN** the first event is `ready` with a `connectionId` string

### Requirement: The stream carries a heartbeat

The stream SHALL send an event named `hb` with empty data every 30 seconds.

Source: code

#### Scenario: Thirty seconds idle

- **GIVEN** an open stream with no changes
- **WHEN** 30 seconds pass
- **THEN** the next event is `hb` with empty data

### Requirement: A card change is announced

When a change event of the project names a card, as specified in `projects/change-tracking`, the stream SHALL send an event named `card.updated` with the `cardKey`.

Source: code, jira (INTDEV-1344)

#### Scenario: Another user patches a card

- **GIVEN** a client with an open stream
- **WHEN** another client patches decision_5
- **THEN** the stream receives `card.updated` with cardKey decision_5

### Requirement: Each card is announced once per change

A single change that names a card more than once SHALL produce one `card.updated` event for that card.

Source: code

#### Scenario: Card named twice

- **WHEN** one change names decision_5 twice
- **THEN** one `card.updated` event is sent for decision_5

### Requirement: The stream ends with a rotation notice

The stream SHALL end after at most 30 minutes, and sooner when the caller's credential is about to expire, with a last event named `rotating`, after which the client reconnects.

Source: code

#### Scenario: Stream lifetime reached

- **GIVEN** an open stream
- **WHEN** its lifetime is reached
- **THEN** the last event is `rotating` and the response ends

### Requirement: The stream is not part of a static export

`GET .../events` SHALL NOT be exported in a static export and SHALL answer 404 there.

Source: code

#### Scenario: Export context

- **WHEN** the events route is requested during static generation
- **THEN** the response is 404
