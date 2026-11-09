# Spec Delta

## Purpose

The backend server as a component a distribution starts: which logic backend it opens its projects with, and how a
container healthcheck sees that it is live.

## ADDED Requirements

### Requirement: The server opens its projects with the logic backend it is given

A server created with a logic backend factory SHALL open every project of its folder with that factory; one created
without it SHALL use clingo.

#### Scenario: Project opened with the given logic backend

- **GIVEN** a folder with the decision project
- **WHEN** a server is created for it with a recording logic backend factory
- **THEN** the factory made one backend, labelled decision
- **AND** the project's card tree is served

### Requirement: The server reports that it is live

`GET /livez` SHALL answer 200 with status ok without requiring an identity whenever the process serves HTTP,
without checking the logic backend or any other dependency.

#### Scenario: Live without credentials

- **WHEN** a client requests `GET /livez` without credentials
- **THEN** the response is 200 with status ok
