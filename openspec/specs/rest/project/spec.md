# rest/project Specification

## Purpose

The routes about projects themselves: the list of projects, creating and cloning projects, a project's settings, its modules and module hubs, and cleaning. What these operations do is specified in `projects/*`, `modules/hubs`, `modules/installation` and `modules/updates`; this capability covers the routes, request shapes, responses and statuses. Roles are in `rest/auth`.

## Requirements

### Requirement: The projects of the backend are listed

`GET /api/projects` SHALL return every project with its prefix and name, and `canCreateProjects`.

Source: code

#### Scenario: Single project

- **GIVEN** a backend serving only decision
- **WHEN** a client requests `GET /api/projects`
- **THEN** the response is 200 with one project and `canCreateProjects` false

### Requirement: Project creation is offered only in multi-project mode

`canCreateProjects` SHALL be true only when the backend manages a folder of projects, and creating or cloning a project otherwise SHALL be refused with status 403 and code permission-denied.

Source: code

#### Scenario: Single-project create

- **GIVEN** a single-project backend
- **WHEN** a client posts a valid project to `POST /api/projects`
- **THEN** the response is 403 with code permission-denied

### Requirement: A project is created

`POST /api/projects` with a name and a prefix, and optionally category, description and `skipDefaultHub`, SHALL create the project as specified in `projects/setup` and respond 201 with its prefix, name, category, description, failures and warnings.

Source: code

#### Scenario: New project

- **GIVEN** a multi-project backend
- **WHEN** a client posts name New Project and prefix newproj
- **THEN** the response is 201 with prefix newproj
- **AND** `GET /api/projects` lists newproj

### Requirement: Project creation input is validated

A project creation request with a missing name, or a name or prefix that is not valid as specified in `projects/setup`, SHALL be refused with status 400.

Source: code

#### Scenario: No prefix

- **WHEN** a client posts only the name Missing Prefix
- **THEN** the response is 400

### Requirement: A taken prefix is refused with 409

Creating a project with a prefix that exists SHALL be refused with status 409 and code conflict.

Source: code

#### Scenario: Duplicate prefix

- **WHEN** a client posts prefix decision
- **THEN** the response is 409 with code conflict

### Requirement: A project is cloned from a repository

`POST /api/projects/clone` with a `url` starting with `https://` or `git@` SHALL clone the repository as specified in `projects/setup` and respond 201 with the projects it registered.

Source: code

#### Scenario: Missing url

- **WHEN** a client posts `{}`
- **THEN** the response is 400

### Requirement: A clone that adds nothing is refused with 409

A clone whose projects all exist already SHALL be refused with status 409, code conflict and the skipped duplicates in `details`, and any other clone failure SHALL be answered with 500.

Source: code

#### Scenario: All duplicates

- **WHEN** a client clones a repository whose projects exist
- **THEN** the response is 409 with `details.skippedDuplicates`

### Requirement: A project's settings are read

`GET .../project` SHALL return the project's name, card key prefix, description, category, git remote address or null, and its modules.

Source: code

#### Scenario: Project info

- **WHEN** a client requests `GET /api/projects/decision/project`
- **THEN** the response is 200 with name, `cardKeyPrefix`, description, category, `gitRemoteUrl` and `modules`

### Requirement: A module's source location is not returned

A module in `GET .../project` SHALL show the module's version source without its location.

Source: code

#### Scenario: Module with a source

- **GIVEN** a module installed from a git source
- **WHEN** a client requests the project
- **THEN** no module entry contains the source location

### Requirement: A project's settings are changed by one patch

`PATCH .../project` with any of name, `cardKeyPrefix`, description, category and `gitRemoteUrl` SHALL apply them together and respond 200 with the project as `GET` would.

Source: code

#### Scenario: Name and prefix

- **WHEN** a client patches name Renamed and cardKeyPrefix renamed
- **THEN** the response is 200 with those values

#### Scenario: Clear description

- **WHEN** a client patches description to an empty string
- **THEN** the project's description is empty

### Requirement: A git remote must use https or ssh form

`gitRemoteUrl` SHALL start with `https://` or `git@`, otherwise the patch SHALL be refused with status 400.

Source: code

#### Scenario: Plain http remote

- **WHEN** a client patches gitRemoteUrl `http://example.com/x.git`
- **THEN** the response is 400

### Requirement: A module is imported from a git source

`POST .../project/modules` with a git `source` and an optional version `range` SHALL import the module and respond 200 with a message.

Source: code

#### Scenario: Non-git source

- **WHEN** a client posts source `/some/path`
- **THEN** the response is 400

### Requirement: A module source must not hold credentials

A `source` that carries a username or password SHALL be refused with status 400, and the response SHALL NOT repeat the secret.

Source: code

#### Scenario: Credentials in the URL

- **WHEN** a client posts source `https://user:tok@example.com/m.git`
- **THEN** the response is 400
- **AND** the body does not contain tok

### Requirement: A blank version range is refused

A `range` that is empty or only whitespace SHALL be refused with status 400.

Source: code

#### Scenario: Blank range

- **WHEN** a client posts range of two spaces to `POST .../project/modules/modg/update`
- **THEN** the response is 400

### Requirement: Modules are updated and removed

`POST .../modules/update` SHALL update every module, `POST .../modules/{module}/update` one module and `DELETE .../modules/{module}` SHALL remove one, each answering 200 with a message.

Source: code

#### Scenario: Remove a module

- **WHEN** a client deletes module modf
- **THEN** the response is 200

### Requirement: Importable modules are listed

`GET .../modules/importable` SHALL list the modules the project's hubs offer.

Source: code

#### Scenario: Importable

- **WHEN** a client requests `GET /api/projects/test/project/modules/importable`
- **THEN** the response is 200 with a list of modules

### Requirement: Versions of a module are looked up by name or by source

`GET .../modules/versions` SHALL require exactly one of `module` and `source` and respond 200 with the available versions.

Source: code

#### Scenario: Both given

- **WHEN** a client requests `modules/versions?module=modf&source=<git url>`
- **THEN** the response is 400

#### Scenario: Neither given

- **WHEN** a client requests `modules/versions` with no query
- **THEN** the response is 400

### Requirement: An update plan can be requested

`GET .../modules/update-plan` SHALL respond 200 with the plan for updating the project's modules, without applying it.

Source: code

#### Scenario: Plan

- **WHEN** a client requests `GET /api/projects/test/project/modules/update-plan`
- **THEN** the response is 200 and nothing is installed

### Requirement: Hubs are listed with their modules

`GET .../hubs` SHALL list each hub with its location and modules, marking those already imported, without contacting the hub when its data is cached.

Source: code

#### Scenario: Cached hub

- **WHEN** a client requests `GET /api/projects/test/project/hubs`
- **THEN** the response is 200 and no network request is made

### Requirement: A hub is added by an http or https address

`POST .../hubs` with a `location` that is an HTTP or HTTPS URL SHALL add the hub and respond 200 with a message and the hubs that could not be reached; any other `location` SHALL be refused with status 400.

Source: code

#### Scenario: Unreachable hub

- **WHEN** a client adds a hub that cannot be reached
- **THEN** the response is 200 listing it under `unreachable`
- **AND** the hub is configured

#### Scenario: Ftp address

- **WHEN** a client adds `ftp://example.com/hub`
- **THEN** the response is 400

### Requirement: A hub is removed by its location

`DELETE .../hubs?location=...` SHALL remove the hub, whatever its stored form, and respond 200 with a message; a request without `location` SHALL be refused with status 400.

Source: code

#### Scenario: No location

- **WHEN** a client deletes `.../hubs` without a query
- **THEN** the response is 400

### Requirement: Hubs can be refetched

`POST .../hubs/fetch` SHALL refetch every hub's data and respond 200 with a message and the hubs that could not be reached.

Source: code

#### Scenario: Refetch

- **WHEN** a client posts to `.../hubs/fetch`
- **THEN** the response is 200 with `unreachable`

### Requirement: Cleaning needs an explicit dry-run flag

`POST .../clean` SHALL require a boolean `dryRun` and otherwise be refused with status 400, so a missing body never cleans.

Source: code

#### Scenario: No body

- **WHEN** a client posts to `.../clean` without a body
- **THEN** the response is 400 and nothing is removed

### Requirement: Cleaning reports what it found or removed

`POST .../clean` with `dryRun` true SHALL report the dormant values specified in `fields/field-values` without removing them, and with `dryRun` false SHALL remove them; both SHALL answer 200, also when some cards could not be cleaned, listing them in `failedCards`.

Source: code

#### Scenario: Dry run

- **WHEN** a client posts `{"dryRun": true}`
- **THEN** the response is 200 with the findings
- **AND** no card changes
