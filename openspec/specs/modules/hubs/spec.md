# modules/hubs Specification

## Purpose

Hubs are the published lists of modules a project can discover and import from. This capability covers declaring and removing a project's hubs, reading what each hub offers, and which modules are offered for import. Importing a module is `modules/installation`; the commit a hub change makes is in `projects/change-tracking`.

## Requirements

### Requirement: A project declares its hubs

A project SHALL keep a list of hubs, each identified by its location, and listing the hubs SHALL return them as declared.

Source: both

#### Scenario: Hubs listed as declared

- **GIVEN** a project declaring the hub `https://a.example.com/hub/` with the display name Mine and the hub `https://b.example.com/hub/`
- **WHEN** the hubs are listed
- **THEN** the result is both hubs, the first with display name Mine, in declaration order

### Requirement: Adding a hub stores its location as a directory

Adding a hub SHALL store its location as the URL of the hub's directory, so that a trailing slash, surrounding whitespace, repeated closing slashes or the URL of the hub's module list file all name the same hub.

Source: both

#### Scenario: Plain URL stored with a closing slash

- **GIVEN** a project without hubs
- **WHEN** the hub `https://h.example.com/m` is added
- **THEN** the project declares the hub `https://h.example.com/m/`

#### Scenario: Module list URL stored as its directory

- **GIVEN** a project without hubs
- **WHEN** the hub `https://h.example.com/m/moduleList.json` is added
- **THEN** the project declares the hub `https://h.example.com/m/`

### Requirement: Adding a hub does not require that it is reachable

Adding a hub SHALL NOT read the hub's contents; an unreachable hub is still added.

Source: code

#### Scenario: Hub added while offline

- **GIVEN** a project and a hub location that cannot be reached
- **WHEN** the hub is added
- **THEN** the hub is declared
- **AND** no module list is read

### Requirement: Adding a malformed or unsupported hub location is refused

Adding a hub whose location is empty, is not a URL, or uses a protocol other than HTTP or HTTPS MUST be refused with an error naming the problem, leaving the project unchanged.

Source: code

#### Scenario: Empty location

- **GIVEN** a project declaring one hub
- **WHEN** a hub with an empty location is added
- **THEN** the addition is refused with an error saying an empty hub cannot be added
- **AND** the project still declares only the one hub

#### Scenario: Unsupported protocol

- **GIVEN** a project declaring one hub
- **WHEN** the hub `ftp://h.example.com/` is added
- **THEN** the addition is refused with an error saying only HTTP and HTTPS are supported
- **AND** the project still declares only the one hub

### Requirement: A hub is declared at most once

Adding a hub that the project already declares, under any spelling that names the same directory, MUST be refused with an error saying it already exists as a hub, leaving the project unchanged.

Source: code

#### Scenario: Same hub under another spelling

- **GIVEN** a project declaring `https://a.example.com/hub/`
- **WHEN** the hub `https://a.example.com/hub/moduleList.json` is added
- **THEN** the addition is refused with an error saying the hub already exists
- **AND** the project still declares only `https://a.example.com/hub/`

### Requirement: Removing a hub takes it out of the project

Removing a hub SHALL remove it from the project's declared hubs, whether it is named by its stored location or by the same location without the closing slash.

Source: both

#### Scenario: Hub removed by location without slash

- **GIVEN** a project declaring `https://a.example.com/hub/` and `https://b.example.com/hub/`
- **WHEN** the hub `https://a.example.com/hub` is removed
- **THEN** the project declares only `https://b.example.com/hub/`

### Requirement: Removing a hub the project lacks is refused

Removing a hub that is not declared by the project MUST be refused with an error saying it is not part of the project, leaving the project unchanged.

Source: code

#### Scenario: Unknown hub

- **GIVEN** a project declaring `https://a.example.com/hub/`
- **WHEN** the hub `https://b.example.com/hub/` is removed
- **THEN** the removal is refused with an error saying the hub is not part of the project
- **AND** the project still declares `https://a.example.com/hub/`

### Requirement: Removing a hub stops offering modules only that hub offered

After a hub is removed, the modules it offered SHALL no longer be offered for import unless another remaining hub also offers them.

Source: code

#### Scenario: Module offered by two hubs survives

- **GIVEN** hubs A offering `one` and `shared`, and B offering `two` and `shared`, both read
- **WHEN** hub A is removed
- **THEN** the importable modules are `two` and `shared`

### Requirement: Reading hubs caches what each offers

Reading the hubs SHALL cache the modules each hub offers, and when several hubs offer a module of the same name the first hub in declaration order SHALL win.

Source: both

#### Scenario: First hub wins a shared name

- **GIVEN** hub A offering `base` and `shared`, and hub B offering `shared` and `extra`
- **WHEN** the hubs are read
- **THEN** the importable modules are `base`, `shared`, `extra`
- **AND** the modules shown for hub A are `base` and `shared`, and for hub B `shared` and `extra`

### Requirement: Hub reading reports each failing hub and keeps the rest

When reading hubs, a hub that cannot be read SHALL be reported with its location and the reason, in declaration order, while the other hubs are still read and cached and what a failing hub offered earlier is kept.

Source: both

#### Scenario: One hub down

- **GIVEN** hubs A, B and C, where A cannot be reached and B offers `base`
- **WHEN** the hubs are read
- **THEN** failures are reported for A and C, in that order, A's naming the network problem
- **AND** the importable modules are `base`

#### Scenario: Earlier contents kept after a failed re-read

- **GIVEN** hub A was read and offered `base`
- **WHEN** a forced re-read of A fails
- **THEN** a failure is reported for A
- **AND** the importable modules still include `base`

### Requirement: A hub is read again only when it has a newer version

Reading hubs SHALL replace the cached contents of a hub only when the hub reports a higher version than the cached one, unless the read is forced.

Source: both, jira (INTDEV-1075, INTDEV-1076)

#### Scenario: Same version ignored, newer taken, forced taken

- **GIVEN** hub A read at version 1 offering `old`
- **WHEN** A is read again offering `changed` at version 1, then offering `newer` at version 2, then offering `forced` at version 2 with the read forced
- **THEN** the importable modules are `old` after the first re-read, `newer` after the second and `forced` after the third

### Requirement: A hub location names its module list in several forms

A hub location given with a trailing slash, without one, or pointing at the module list file SHALL all be read as the same hub.

Source: code

#### Scenario: Location without trailing slash

- **GIVEN** a project declaring the hub `https://hub.test/c` serving a list offering `base`
- **WHEN** the hubs are read
- **THEN** no failure is reported
- **AND** the importable modules are `base`

### Requirement: Importable modules exclude installed ones by default

Listing importable modules SHALL return the names of the cached modules the project has not installed, MAY include the installed ones when asked for all, and MAY return full details instead of names; it SHALL return nothing when no hub has been read and SHALL NOT read any hub itself.

Source: code

#### Scenario: Installed module excluded

- **GIVEN** the cached modules `have` and `want`, with `have` installed
- **WHEN** the importable modules are listed
- **THEN** the result is `want`

#### Scenario: Everything the hubs offer

- **GIVEN** the cached modules `have` and `want`, with `have` installed
- **WHEN** the importable modules are listed for all
- **THEN** the result is `have` and `want`

#### Scenario: Nothing read yet

- **GIVEN** a project whose hubs have not been read
- **WHEN** the importable modules are listed for all, with details
- **THEN** the result is empty

### Requirement: Hub details show each hub with its modules without reading it

Showing the hubs with their modules SHALL return each declared hub with the modules cached for it, preferring the display name configured by the project over the one the hub gave, and SHALL NOT read any hub.

Source: code

#### Scenario: Configured name first

- **GIVEN** a project declaring hub A with the display name Mine, whose cached contents name it Theirs and offer `one`
- **WHEN** the hubs are shown with their modules
- **THEN** hub A is shown as Mine with the module `one`

#### Scenario: Nothing cached

- **GIVEN** a project declaring hub A with nothing cached
- **WHEN** the hubs are shown with their modules
- **THEN** hub A is shown with no modules

### Requirement: The module list is read on demand when none is cached

Ensuring a module list exists SHALL read the hubs when nothing is cached and SHALL do nothing when a list is cached.

Source: both, jira (INTDEV-1076)

#### Scenario: Read once

- **GIVEN** a project declaring hub A offering `base` and no cached list
- **WHEN** the module list is ensured twice
- **THEN** the hub is read only on the first call
- **AND** the importable modules are `base`

### Requirement: Installing, updating or removing a module reads the hubs first

Installing, updating or removing a module SHALL first read the project's hubs, taking the contents of a hub whose version is newer than the cached one, before acting on the module.

Source: code, jira (INTDEV-1076)

#### Scenario: Newer hub contents taken by an install

- **GIVEN** hub A cached at version 1 offering `old`, and now serving version 2 offering `new`
- **WHEN** a module is installed from a local folder
- **THEN** the importable modules include `new`
