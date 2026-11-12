# modules/updates Specification

## Purpose

Updating moves installed modules to newer versions within the ranges the project bound them to, and carries the changes the module's authors recorded into the project's own data. This capability covers update targets, resolving one coherent set of versions or refusing with the conflicts, the preview of an update, and replaying recorded changes. First installation is `modules/installation`; how authors record those changes is `modules/versioning`; the format version a new module version must have is in `projects/schema-migration`; the commit an update makes is in `projects/change-tracking`.

## Requirements

### Requirement: An update moves a module to the newest version its range allows

Updating a module SHALL install the newest published version that satisfies the version range recorded for it, and SHALL keep the recorded range.

Source: both

#### Scenario: Newest in range

- **GIVEN** `lib` is installed at 1.0.0 with the range `^1.0.0`, and its source publishes 1.0.0, 1.2.0, 1.4.0 and 2.0.0
- **WHEN** `lib` is updated
- **THEN** `lib` is at 1.4.0
- **AND** its recorded range is still `^1.0.0`

### Requirement: An update can target an exact version inside the range

Updating a module with a version SHALL install exactly that version and SHALL NOT change the recorded range; the version MUST be exact, published by the source, inside the range and not older than the installed one.

Source: both

#### Scenario: Exact version

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 1.2.0 and 1.4.0 published
- **WHEN** `lib` is updated to 1.2.0
- **THEN** `lib` is at 1.2.0
- **AND** its recorded range is `^1.0.0`

### Requirement: A version outside the range is refused

Updating to a version that does not satisfy the module's recorded range MUST be refused with an error naming the range, leaving the project unchanged.

Source: both

#### Scenario: Version in the next major

- **GIVEN** `lib` at 1.4.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the update is refused with an error saying 2.0.0 does not satisfy `^1.0.0`
- **AND** `lib` is still at 1.4.0

### Requirement: A version the source does not publish is refused

Updating to a version the module's source does not list MUST be refused with an error that lists the versions the source does publish, leaving the project unchanged.

Source: both

#### Scenario: Unlisted version

- **GIVEN** `lib` at 1.4.0, and its source publishing 1.0.0, 1.2.0, 1.4.0 and 2.0.0
- **WHEN** `lib` is updated to 1.1.0
- **THEN** the update is refused with an error saying version 1.1.0 is not available
- **AND** `lib` is still at 1.4.0

### Requirement: An update never downgrades

Updating to a version older than the installed one MUST be refused with an error saying a downgrade is not possible, leaving the project unchanged.

Source: both

#### Scenario: Older version

- **GIVEN** `lib` at 1.4.0 with the range `^1.0.0`
- **WHEN** `lib` is updated to 1.0.0
- **THEN** the update is refused with an error saying it cannot downgrade from 1.4.0 to 1.0.0
- **AND** `lib` is still at 1.4.0

### Requirement: Updating without a module updates every declared module

Updating with no module named SHALL move every module the project declares to the newest version its range allows.

Source: both

#### Scenario: Two modules

- **GIVEN** `lib` and `tool` installed at 1.0.0, and 1.1.0 of `lib` and 1.3.0 of `tool` published within their ranges
- **WHEN** all modules are updated
- **THEN** `lib` is at 1.1.0 and `tool` at 1.3.0

### Requirement: A new range can be declared together with the update

Updating a module with a new range SHALL record that range for the module and move it to the newest version satisfying it, even across a major version; a blank range MUST be refused with an error saying the range cannot be empty, leaving the project unchanged.

Source: both

#### Scenario: Blank range

- **GIVEN** `base` declared with the range `^1.0.0`
- **WHEN** `base` is updated with the range `  `
- **THEN** the update is refused with an error saying the version range cannot be empty

#### Scenario: Move to the next major

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** `lib` is updated with the range `^2.0.0`
- **THEN** `lib` is at 2.0.0
- **AND** its recorded range is `^2.0.0`

### Requirement: An update never crosses a major version on its own

An update SHALL NOT move a module outside the range recorded for it; a module for which newer versions exist outside its range SHALL stay where it is.

Source: docs

#### Scenario: Held back by range

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** all modules are updated
- **THEN** `lib` is not moved to 2.0.0

### Requirement: An update with nothing newer changes nothing

Updating a module that is already at the newest version its range allows SHALL leave the project unchanged and produce no commit.

Source: code

#### Scenario: Already newest

- **GIVEN** `lib` at 1.0.0, its newest version, with autocommit on
- **WHEN** `lib` is updated
- **THEN** the project's content is unchanged
- **AND** no commit is made

### Requirement: Only declared modules can be named in an update

Updating a module the project does not declare MUST be refused with an error saying it is not part of the project; a module that is installed only because another module needs it MUST be refused with an error naming that module, leaving the project unchanged.

Source: both

#### Scenario: Unknown module

- **GIVEN** a project that does not declare `nothing`
- **WHEN** `nothing` is updated
- **THEN** the update is refused with an error saying `nothing` is not part of the project

#### Scenario: Transitive module

- **GIVEN** `app` depends on `base`, and the project declares only `app`
- **WHEN** `base` is updated
- **THEN** the update is refused with an error naming `app`

### Requirement: An unreachable source refuses the update

Updating a module whose source cannot be reached MUST be refused with an error saying so, leaving the project unchanged.

Source: both

#### Scenario: Source down

- **GIVEN** `lib` declared and its source unreachable
- **WHEN** `lib` is updated
- **THEN** the update is refused with an error saying the source is unreachable
- **AND** `lib` is unchanged

### Requirement: An update brings in and drops dependencies of the new version

Updating a module to a version with different dependencies SHALL install the modules the new version adds and remove the modules it no longer needs.

Source: both, jira (INTDEV-826)

#### Scenario: Dependency swapped

- **GIVEN** `app` at 1.0.0 depends on `old`, and 1.1.0 depends on `base`
- **WHEN** `app` is updated
- **THEN** `base` is installed at 1.0.0 and `old` is no longer installed
- **AND** only `app` is declared

### Requirement: Updates resolve one coherent set of versions or are refused

An update SHALL result in exactly one version of each installed module such that every declared range and every dependency constraint is satisfied; when no such set exists the update MUST be refused with the conflicting requirements reported, and nothing changes.

Source: both, jira (INTDEV-1342)

#### Scenario: Cascade satisfied

- **GIVEN** `A` at 1.6.0 depending on `B >=1.3.0`, and `C` at 1.2.0 bound to `^1.0.0`, where `A` 1.8.0 needs `B >=1.4.0` and `B` 1.4.0 needs `C >=1.3.0`
- **WHEN** `A` is updated to 1.8.0
- **THEN** the update moves `A` to 1.8.0, `B` to 1.4.0 and `C` to 1.3.0

#### Scenario: No coherent set

- **GIVEN** `A` and `C` installed, where the version of `A` asked for needs a `B` that in turn needs a `C` newer than `C`'s own range allows
- **WHEN** `A` is updated
- **THEN** the update is refused with a conflict naming the modules whose requirements clash
- **AND** nothing is changed

### Requirement: An update moves only the modules it must

An update SHALL move only the modules that the requested move forces, each to the version closest to the installed one that satisfies the constraints, and SHALL NOT push a module past its own recorded range.

Source: both, jira (INTDEV-1342)

#### Scenario: Bystander kept inside its pin

- **GIVEN** `A` bound to `^1.0.0` and `P` bound to exactly 1.0.0, where the newer `A` needs `P` 1.1.0 or later
- **WHEN** `A` is updated
- **THEN** the update is refused with a conflict naming the pin of `P`
- **AND** `P` is still at 1.0.0

### Requirement: Dependencies float to the newest version their parents allow

When modules are updated or installed, a dependency that is not directly declared SHALL be given the newest version its dependants' constraints allow, not the oldest.

Source: code, jira (INTDEV-1413)

#### Scenario: Transitive floats up

- **GIVEN** `app` depending on `base ^1.0.0`, with `base` 1.0.0, 1.2.0 and 1.4.0 published and `base` 1.0.0 installed
- **WHEN** all modules are updated
- **THEN** `base` is at 1.4.0

### Requirement: A version that cannot be replayed is blocked at planning

An update to a version whose recorded changes cannot be applied to the installed version MUST be refused before any change is made, with the reason named: the histories diverged, a part of the chain is missing, or the target is older.

Source: both, jira (INTDEV-1342, INTDEV-1349)

#### Scenario: Gap in the chain

- **GIVEN** `lib` installed at 1.0.0 and version 3.0.0 whose only sealed change record starts at 2.0.0
- **WHEN** `lib` is updated to 3.0.0
- **THEN** the update is refused with an error saying there is no migration path from 1.0.0 to 3.0.0
- **AND** no file is changed

#### Scenario: Diverged histories

- **GIVEN** `mod` installed at 1.1.0 with a change record 1.0.0 to 1.1.0 that version 2.0.0 does not contain
- **WHEN** `mod` is updated to 2.0.0
- **THEN** the update is refused with an error naming the missing record
- **AND** no file is changed

### Requirement: A split of workflow ownership across modules is refused

An update that would change the states of a workflow owned by one module and the workflow of a card type owned by another module SHALL be refused before any change is made.

Source: code

#### Scenario: Workflow in one module, card type in another

- **GIVEN** `wf` at 2.0.0 records a change of the states of its workflow, and `ct` at 2.0.0 records a change of the workflow of its card type
- **WHEN** both are updated
- **THEN** the update is refused with a conflict for `ct`

### Requirement: An update names the module whose prefix changed

An update whose new version declares a different card key prefix than the module's installed name MUST be refused with an error naming the module and the prefix, leaving the project unchanged.

Source: both, jira (INTDEV-1366)

#### Scenario: Prefix changed upstream

- **GIVEN** `decision` installed at 1.0.0, and its 2.0.0 declares the prefix `decrec`
- **WHEN** `decision` is updated to 2.0.0
- **THEN** the update is refused with an error saying `decision` now declares the prefix `decrec`
- **AND** `decision` is still at 1.0.0 and `decrec` is not installed

### Requirement: Preview reports what an update would do without doing it

Previewing an update SHALL return the modules that would move with their installed and new version and whether the move leaves the compatible range of the installed version, the modules that would be removed, the ranges that would be recorded, and the conflicts if the update is blocked, and SHALL NOT fetch module content or change the project.

Source: both, jira (INTDEV-1435, INTDEV-1342)

#### Scenario: Preview of an in-range move

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 1.4.0 published
- **WHEN** an update of all modules is previewed
- **THEN** the preview is ok with the change `lib` from 1.0.0 to 1.4.0, not breaking, nothing removed and no conflicts
- **AND** the project's files are unchanged

#### Scenario: Preview of a new range

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** an update of `lib` with the range `^2.0.0` is previewed
- **THEN** the preview records the range `^2.0.0` for `lib` as a range to write
- **AND** the change `lib` to 2.0.0 is breaking

#### Scenario: Preview of a removal

- **GIVEN** `app` depends on `old` at 1.0.0 and its 1.1.0 has no dependencies
- **WHEN** an update of all modules is previewed
- **THEN** the preview lists `old` as removed

### Requirement: Preview names the newest version of each module and what holds it back

Previewing an update SHALL give for each declared module its installed version, its range, the newest version its source publishes, and whether a newer version exists outside the range.

Source: both, jira (INTDEV-1435)

#### Scenario: Newer outside the range

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** an update is previewed
- **THEN** the row for `lib` has installed 1.0.0 and latest 2.0.0
- **AND** the row says a newer version is held back by the range

### Requirement: Preview and update agree

Previewing an update SHALL give the moves that the same update then performs, and SHALL be refused with the same error as the update where the update is refused.

Source: both, jira (INTDEV-1435)

#### Scenario: Preview then update

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 1.4.0 published
- **WHEN** an update of `lib` is previewed and then performed
- **THEN** `lib` is at the version the preview gave

#### Scenario: Same refusal

- **GIVEN** `lib` at 1.0.0 with the range `^1.0.0`, and 2.0.0 published
- **WHEN** an update of `lib` to 2.0.0 is previewed and then performed
- **THEN** both are refused with the same error

### Requirement: The versions a source offers can be listed

Listing versions SHALL return the versions published by a declared module's source, or by a source not yet installed, newest first, without changing the project; a module the project does not have MUST be refused with an error naming it, and an unreachable source MUST be reported without revealing its credentials.

Source: both, jira (INTDEV-1440)

#### Scenario: Declared module

- **GIVEN** `lib` declared with a source publishing 1.0.0, 1.2.0, 1.4.0 and 2.0.0
- **WHEN** the versions of `lib` are listed
- **THEN** the result is 2.0.0, 1.4.0, 1.2.0, 1.0.0

#### Scenario: Credentials not leaked

- **GIVEN** a source URL carrying the token `secret` that cannot be reached
- **WHEN** the versions of that source are listed
- **THEN** the request is refused with an error saying the source is unreachable
- **AND** the error text does not contain `secret`

### Requirement: An update replays the recorded changes of the versions it passes

Updating a module SHALL apply, in version order and oldest module dependency first, the configuration changes that the module's authors recorded for the versions between the installed one and the new one to the project's own data, and report for each module how many records were replayed.

Source: both, jira (INTDEV-1349)

#### Scenario: Rename carried into the project

- **GIVEN** `lib` at 1.0.0, a local card type `test/cardTypes/consumer` using the workflow `lib/workflows/flow`, and `lib` 2.0.0 recording a rename of that workflow to `lib/workflows/moved`
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the card type `test/cardTypes/consumer` uses `lib/workflows/moved`
- **AND** the update result lists one replay for `lib` from 1.0.0 to 2.0.0 with one record

### Requirement: Replaying a deletion removes what it leaves unusable

When a replayed change deletes a module resource, the project's resources that can no longer work without it SHALL be removed together with the cards that depend on them.

Source: both, jira (INTDEV-1349)

#### Scenario: Deleted workflow

- **GIVEN** the local card type `test/cardTypes/consumer` using `lib/workflows/flow`, with a card of that card type, and `lib` 2.0.0 recording the deletion of that workflow
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the card type `test/cardTypes/consumer` no longer exists
- **AND** the card no longer exists

### Requirement: Records an update does not understand are skipped and reported

A recorded change of an operation that is retired or unknown to the tool SHALL be skipped and reported by name, and the other records SHALL still be replayed.

Source: both

#### Scenario: Retired and unknown records

- **GIVEN** `lib` 2.0.0 records a rename, a retired project rename and an operation the tool does not know
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the rename is replayed
- **AND** the result lists the retired operation `project_rename` and the unknown operation `resource_frobnicate` as skipped

### Requirement: A record that cannot be replayed stops the update and says what ran before

When replaying a recorded change fails, the update MUST stop, report the failure naming the module, the record and its position, and report which replays had been applied before it.

Source: both

#### Scenario: Malformed record

- **GIVEN** `lib` 2.0.0 records a rename without a target
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the update is refused with a replay failure
- **AND** the failure's result lists no replays as applied

### Requirement: An update that would leave the project invalid is refused and changes nothing

When replaying leaves the project with validation errors, the update MUST be refused with an error naming the invalid resources, and the project SHALL be left as it was before the update.

Source: docs

#### Scenario: Card of a deleted card type

- **GIVEN** a card of `lib/templates/tpl`'s card type, and `lib` 2.0.0 recording the deletion of its workflow
- **WHEN** `lib` is updated to 2.0.0
- **THEN** the update is refused with an error that names `lib/workflows/flow`
- **AND** `lib` is still at its previous version
