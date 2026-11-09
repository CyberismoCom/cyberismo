# Spec Delta

## ADDED Requirements

### Requirement: A logic failure is served with the status of its kind

A failure of the logic backend that reaches the edge SHALL be served with the error code `logic`, its kind and
diagnostics in the details, and the status of its kind: invalid 400, nonTotal 422, unavailable 503 with a
`Retry-After` header, internal 500.

#### Scenario: Logic failure statuses

- **WHEN** a logic failure of each kind reaches the edge
- **THEN** it is served with the status of its kind, the code `logic` and the kind in its details
- **AND** only the unavailable one carries `Retry-After`

#### Scenario: Card tree while the logic backend is unavailable

- **GIVEN** a server whose logic backend answers queries as unavailable
- **WHEN** a client requests `GET /api/projects/decision/tree`
- **THEN** the response is 503 with a `Retry-After` header, the code `logic` and the kind unavailable

## MODIFIED Requirements

### Requirement: Some routes report failures as a plain error message

The card, card tree, resource list and creation routes SHALL report their own failures as a body with only an `error` message and the status stated for the route in its capability, without `code`. A logic failure SHALL instead be served with the status of its kind.

Source: code

#### Scenario: Unknown card

- **WHEN** a client requests `GET /api/projects/decision/cards/bogus`
- **THEN** the response is 400
- **AND** the body has an `error` message and no `code`
