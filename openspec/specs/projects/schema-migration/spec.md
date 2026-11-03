# projects/schema-migration Specification

## Purpose

A project records the version of the project format it is written in. This capability covers checking that version when a project is opened and migrating a project, step by step, to the format the tool uses. It is separate from `modules/versioning`, which covers the versions of a project's content.

## Requirements

### Requirement: A project records its format version

A project SHALL record the project format version it conforms to, and the tool SHALL define the one version it works with.

Source: jira (INTDEV-1085)

#### Scenario: New project at the tool's version

- **GIVEN** a project created by the tool
- **WHEN** its format version is read
- **THEN** it equals the format version the tool works with

### Requirement: A project at an older format version is not opened

Opening a project whose format version is older than the tool's MUST be refused with an error saying the version mismatch and that the project must be migrated.

Source: both

#### Scenario: Older project

- **GIVEN** a project whose format version is one below the tool's
- **WHEN** the project is opened
- **THEN** opening is refused with an error saying the versions mismatch and to run the migration

### Requirement: A project at a newer format version is not opened

Opening a project whose format version is newer than the tool supports MUST be refused with an error saying to upgrade the tool.

Source: both, jira (INTDEV-1085)

#### Scenario: Newer project

- **GIVEN** a project whose format version is one above the tool's
- **WHEN** the project is opened
- **THEN** opening is refused with an error saying the project is newer than the tool supports and to upgrade the tool

### Requirement: A project without a format version is not opened

Opening a project that records no format version MUST be refused with an error saying the version is missing and must be set by hand before migrating.

Source: code

#### Scenario: Missing version

- **GIVEN** a project whose configuration has no format version
- **WHEN** the project is opened
- **THEN** opening is refused with an error saying no format version is recorded

### Requirement: Migration brings a project to the tool's format version

Migrating a project SHALL apply the format changes from the project's version up to the tool's version and report the versions it migrated from and to, with a note to validate the project afterwards; the migrated project SHALL then open.

Source: both, jira (INTDEV-1086)

#### Scenario: One step behind

- **GIVEN** a project whose format version is one below the tool's
- **WHEN** the project is migrated
- **THEN** the result says it migrated successfully from that version to the tool's and suggests validating
- **AND** the project opens, at the tool's format version

### Requirement: Migration of a current project changes nothing

Migrating a project that is already at the tool's format version SHALL report that no migration is needed and SHALL change nothing.

Source: code

#### Scenario: Already current

- **GIVEN** a project at the tool's format version
- **WHEN** the project is migrated
- **THEN** the result says the project is already at that version and no migration is needed

### Requirement: Migrating a project from a newer or unversioned format is refused

Migrating a project whose format version is newer than the tool's, or that records none, MUST be refused with the same errors as opening it, changing nothing.

Source: code

#### Scenario: Newer project

- **GIVEN** a project whose format version is one above the tool's
- **WHEN** the project is migrated
- **THEN** the migration is refused with an error saying to upgrade the tool
- **AND** the project is unchanged

#### Scenario: Missing version

- **GIVEN** a project that records no format version
- **WHEN** the project is migrated
- **THEN** the migration is refused with an error saying no format version is set

### Requirement: Migration runs without opening the project

Migrating SHALL work on a project that opening refuses because of its format version.

Source: code

#### Scenario: Refused project migrated

- **GIVEN** a project whose format version is one below the tool's, so that opening it is refused
- **WHEN** the project is migrated
- **THEN** the migration succeeds
- **AND** the project then opens

### Requirement: Migration runs one format step at a time, in order

Migration SHALL apply the steps for each format version after the project's, up to the tool's, in ascending order, and SHALL record the new format version after each step succeeds.

Source: both, jira (INTDEV-1086)

#### Scenario: Version 1 to the latest

- **GIVEN** a project at format version 1
- **WHEN** the project is migrated
- **THEN** each step from version 2 up to the tool's version runs once, in ascending order
- **AND** the project records the tool's version

### Requirement: A missing step refuses the migration before anything runs

When any step between the project's version and the tool's is missing, migration MUST be refused with an error naming the missing step, before any step is applied.

Source: both

#### Scenario: Step 3 missing

- **GIVEN** a project at format version 1 and no step for version 3
- **WHEN** the project is migrated
- **THEN** the migration is refused with an error saying the step for version 3 is missing
- **AND** no step ran and the project is still at version 1

### Requirement: A failed step stops the migration and keeps earlier steps

When a step fails, migration MUST stop with an error naming the version it failed at and the cause; steps that had succeeded SHALL stay applied and recorded.

Source: both

#### Scenario: Step 3 fails

- **GIVEN** a project at format version 1 whose step for version 3 fails with boom
- **WHEN** the project is migrated
- **THEN** the migration ends with an error saying the migration to version 3 failed: boom
- **AND** the project records version 2

### Requirement: Migration also moves the installed modules

A migration SHALL apply to the whole project including the modules installed in it, so that installed modules stay at the same format version as the project.

Source: code, jira (INTDEV-1343)

#### Scenario: Module follows the project

- **GIVEN** a project at an older format version with the module `mod` installed at the same version
- **WHEN** the project is migrated
- **THEN** the project and `mod` are at the tool's format version

### Requirement: A module at an older format version is migrated before it is used

A module version taken from a source at an older format version SHALL be migrated to the tool's version before it is installed or updated to; one whose format version is newer than the tool supports, or is missing, MUST be refused with an error saying to upgrade the tool or that no version is set, leaving the project unchanged.

Source: both, jira (INTDEV-1343)

#### Scenario: Older module version installed

- **GIVEN** a module at format version 4
- **WHEN** it is installed
- **THEN** the installed copy is at the tool's format version

#### Scenario: Newer module refused at install

- **GIVEN** a module whose format version is one above the tool's
- **WHEN** it is installed
- **THEN** the installation is refused with an error saying to upgrade the tool
- **AND** the project is unchanged

#### Scenario: Newer module version refused at update

- **GIVEN** `lib` installed, and a published version of `lib` whose format version is above the tool's
- **WHEN** `lib` is updated to it
- **THEN** the update is refused with an error saying to upgrade the tool
- **AND** `lib` is unchanged
