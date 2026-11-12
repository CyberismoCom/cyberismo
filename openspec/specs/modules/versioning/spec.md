# modules/versioning Specification

## Purpose

A project that others use as a module publishes versions. This capability covers bumping the project's version, how recorded configuration changes are classified and gate the size of the bump, sealing the change record per version, and tagging the version for publication. How consumers apply the record is `modules/updates`; the commit a bump makes is in `projects/change-tracking`.

## Requirements

### Requirement: A bump computes the next version from the current one

A version bump of type patch, minor or major SHALL raise the project's version by that part and reset the lower parts, and return the previous and the new version.

Source: both

#### Scenario: Patch bump

- **GIVEN** a project at version 1.2.3
- **WHEN** a patch bump is made
- **THEN** the result is previous 1.2.3 and new 1.2.4

#### Scenario: Minor bump

- **GIVEN** a project at version 1.2.3
- **WHEN** a minor bump is made
- **THEN** the result is previous 1.2.3 and new 1.3.0

#### Scenario: Major bump

- **GIVEN** a project at version 1.2.3
- **WHEN** a major bump is made
- **THEN** the result is previous 1.2.3 and new 2.0.0

### Requirement: The first bump gives 1.0.0

A bump of a project that has no version SHALL give version 1.0.0 whatever the bump type.

Source: code

#### Scenario: First patch bump

- **GIVEN** a project without a version
- **WHEN** a patch bump is made
- **THEN** the result is no previous version and new 1.0.0

### Requirement: An unknown bump type is refused

A bump of a type other than patch, minor or major MUST be refused with an error naming the type, leaving the version unchanged.

Source: code

#### Scenario: Type huge

- **GIVEN** a project at version 1.2.3
- **WHEN** a bump of type huge is made
- **THEN** the bump is refused with an error saying the bump type huge is invalid
- **AND** the version is still 1.2.3

### Requirement: A project with validation errors cannot be versioned

A bump of a project that has validation errors MUST be refused with an error saying so, leaving the version unchanged; what makes the project invalid is specified in `validation`.

Source: code

#### Scenario: Card in an unknown state

- **GIVEN** a project at 1.2.3 with a card in the workflow state Nowhere
- **WHEN** a major bump is made
- **THEN** the bump is refused with an error saying the project has validation errors
- **AND** the version is still 1.2.3

### Requirement: A project with uncommitted changes cannot be versioned

A bump of a project whose content has uncommitted changes MUST be refused with an error saying so.

Source: code

#### Scenario: Edited card

- **GIVEN** a project at 1.2.3 with an uncommitted edit to a card
- **WHEN** a minor bump is made
- **THEN** the bump is refused with an error mentioning uncommitted changes

### Requirement: Configuration changes that ask something of consumers are recorded

Every configuration change that asks something of consumers of the project as a module SHALL be recorded as a change record entry; a change that asks nothing of them, such as creating a resource, adding a workflow state or editing a display name, SHALL NOT be recorded.

Source: docs, jira (INTDEV-584, INTDEV-1441)

#### Scenario: Creates admitted in a patch

- **GIVEN** a project at 1.0.0
- **WHEN** a resource of each type is created and a patch bump is made
- **THEN** the new version is 1.0.1

### Requirement: Recorded changes are classified as migratable or breaking

A recorded change SHALL be classified migratable when Cyberismo can carry it out on consumers' data, namely renaming a resource or renaming a workflow state, and breaking when it deletes consumers' card data or leaves their content referring to something that no longer exists; a change whose replacement the author may leave out SHALL be classified breaking.

Source: docs, jira (INTDEV-1441)

#### Scenario: Rename is migratable

- **GIVEN** a project at 1.2.3 whose workflow `test/workflows/flow` is renamed
- **WHEN** a patch bump is made
- **THEN** the bump is refused because the patch version cannot carry the rename
- **AND** the message says to use a minor version

#### Scenario: Deleting a report is breaking

- **GIVEN** a project at 1.2.3 whose report `test/reports/status` is deleted
- **WHEN** a minor bump is made
- **THEN** the bump is refused because the minor version cannot carry the deletion
- **AND** the message says to use a major version

### Requirement: Breaking changes are those that orphan data or dangle references

The deletion of a card type, field type, workflow or link type, the change of a card type's workflow, the removal of a workflow state or of an enum value, and the change of a field's data type SHALL be classified breaking, and so SHALL the deletion of a template, calculation, report, graph model, graph view or skill.

Source: docs, jira (INTDEV-1441)

#### Scenario: Data type change

- **GIVEN** a project at 1.2.3 whose field type `test/fieldTypes/priority` has its data type changed from shortText to integer
- **WHEN** a minor bump is made
- **THEN** the bump is refused, naming `test/fieldTypes/priority` and the data type change, and saying to use a major version

#### Scenario: Enum value removal

- **GIVEN** a project at 1.2.3 whose field type `test/fieldTypes/priority` has the enum value low removed
- **WHEN** a minor bump is made
- **THEN** the bump is refused, naming `test/fieldTypes/priority` and the enum value removal, and saying to use a major version

#### Scenario: Card type workflow change

- **GIVEN** a project at 1.2.3 whose card type `test/cardTypes/page` has its workflow changed
- **WHEN** a minor bump is made
- **THEN** the bump is refused, naming `test/cardTypes/page` and the workflow change, and saying to use a major version

### Requirement: The body of a resource is not classified

Editing the content of a resource, such as the query of a report or the logic of a calculation, SHALL NOT be recorded or classified; judging such a change is left to the author's choice of bump.

Source: docs

#### Scenario: Report query edit

- **GIVEN** a project at 1.2.3 whose report `test/reports/status` has its content edited
- **WHEN** a patch bump is made
- **THEN** the new version is 1.2.4

### Requirement: The size of the bump must fit the recorded changes

A patch bump SHALL be allowed only when no change is recorded, a minor bump only when the recorded changes are migratable, and a major bump for any recorded changes; a bump that is too small MUST be refused with an error that lists each offending entry and names the larger bump needed, leaving the version unchanged.

Source: both, jira (INTDEV-1441, INTDEV-1332)

#### Scenario: Two edits of one resource listed apart

- **GIVEN** a project at 1.2.3 with a recorded enum value removal and a recorded data type change on `test/fieldTypes/priority`
- **WHEN** a patch bump is made
- **THEN** the bump is refused with two entries for `test/fieldTypes/priority`, one for each edit

#### Scenario: Major bump carries both kinds

- **GIVEN** a project at 1.2.3 with a recorded rename and a recorded deletion
- **WHEN** a major bump is made
- **THEN** the new version is 2.0.0

### Requirement: Entries the tool cannot classify are treated as breaking

A recorded entry of an unknown operation, of a retired operation, or that cannot be routed SHALL be treated as breaking, and the refusal SHALL say it is unrecognised or retired.

Source: code

#### Scenario: Unknown operation

- **GIVEN** a project at 1.2.3 with a recorded entry of an operation the tool does not know, targeting `test/fieldTypes/x`
- **WHEN** a minor bump is made
- **THEN** the bump is refused with an entry naming `test/fieldTypes/x` and saying it is unrecognised and treated as breaking
- **AND** a major bump is allowed

### Requirement: The first version is exempt from the gate

The first bump of a project SHALL be allowed whatever changes are recorded.

Source: both, jira (INTDEV-1332)

#### Scenario: Breaking change before the first version

- **GIVEN** a project without a version whose report `test/reports/status` is deleted
- **WHEN** a patch bump is made
- **THEN** the new version is 1.0.0

### Requirement: A minor or major bump seals the recorded changes

A minor or major bump, and the first bump, SHALL seal the changes recorded since the previous seal into one record covering the versions after the previously sealed version (none before the first) up to the new version, and SHALL leave no recorded change pending; a patch bump SHALL seal nothing.

Source: both, jira (INTDEV-1332)

#### Scenario: Minor bump seals

- **GIVEN** a project at 1.2.3 with a recorded rename
- **WHEN** a minor bump is made
- **THEN** one sealed record covers everything up to 1.3.0
- **AND** no recorded change is pending

#### Scenario: Patch bump does not seal

- **GIVEN** a project at 1.2.3 with nothing recorded
- **WHEN** a patch bump is made
- **THEN** no sealed record exists

### Requirement: Sealed records form one unbroken line of versions

Sealed records SHALL be ordered by the versions they cover, each starting at the version the previous one ended at, and a version at or below the last sealed one MUST NOT be sealed.

Source: jira (INTDEV-1332)

#### Scenario: Chain through consecutive seals

- **GIVEN** `lib` published with sealed records covering up to 1.1.0 and then up to 2.0.0, and installed at 1.0.0
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the changes of both records are replayed, the older first

### Requirement: Publishing tags the current version and pushes the tag

Publishing SHALL create a tag for the project's current version on the commit the project is at and push it to the named remote, or the default remote when none is named.

Source: both, jira (INTDEV-1087)

#### Scenario: Tag pushed

- **GIVEN** a project at 1.2.3 with a remote `origin`
- **WHEN** the project is published
- **THEN** the tag `v1.2.3` exists in the project and in `origin`
- **AND** the result names version 1.2.3, remote `origin`, not a dry run

### Requirement: A dry run publishes nothing

A dry run SHALL report the version and remote that publishing would use and SHALL NOT create or push a tag.

Source: code

#### Scenario: Dry run

- **GIVEN** a project at 1.2.3 with a remote `origin`
- **WHEN** a dry-run publish is made
- **THEN** the result names version 1.2.3, remote `origin`, a dry run
- **AND** no tag exists in the project or in `origin`

### Requirement: Publishing without a version is refused

Publishing a project that has no version MUST be refused with an error saying no version is set, creating no tag.

Source: both

#### Scenario: No version

- **GIVEN** a project without a version
- **WHEN** the project is published
- **THEN** the publish is refused with an error saying no version is set
- **AND** no tag is created

### Requirement: A version is published only once

Publishing a version that is already tagged MUST be refused with an error saying to bump the version first, for a real publish and for a dry run alike.

Source: code

#### Scenario: Second publish

- **GIVEN** a project at 1.2.3 already published
- **WHEN** it is published again
- **THEN** the publish is refused with an error saying version v1.2.3 is already published

### Requirement: A failed push keeps the tag and says how to push it

When the tag is created but cannot be pushed, publishing MUST end with an error that says the version was tagged, why the push failed, and the command that pushes the tag, and the tag SHALL remain.

Source: code

#### Scenario: Remote unreachable

- **GIVEN** a project at 1.2.3 whose remote cannot be pushed to
- **WHEN** the project is published
- **THEN** the publish ends with an error saying v1.2.3 was tagged but could not be pushed to `origin`, with the push command
- **AND** the tag `v1.2.3` exists in the project
