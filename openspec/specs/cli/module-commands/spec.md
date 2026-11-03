# cli/module-commands Specification

## Purpose

The `cyberismo` commands for modules and hubs: installing, updating, listing and removing modules, the update plan output, hubs, and publishing a version of a project that others use as a module. The rules are specified in `modules/hubs`, `modules/installation`, `modules/updates` and `modules/versioning`; output and exit codes follow `cli/conventions`.

## Requirements

### Requirement: Module install installs a module from a source

`cyberismo module install <source>` SHALL install the module from a hub module name, a git URL or a local path as specified in `modules/installation`, and print `Done`.

Source: both, jira (INTDEV-1439)

#### Scenario: Local module installed

- **WHEN** the user runs `cyberismo module install ./module-test`
- **THEN** stdout is `Done`
- **AND** `cyberismo module list` includes the module `test`

#### Scenario: Install failure

- **WHEN** the user runs `cyberismo module install ./missing`
- **THEN** stderr states why the module could not be installed
- **AND** the exit code is 1

### Requirement: A version or range is appended to the source with an at sign

`cyberismo module install <source>@<version>` SHALL install the module with that version or range as specified in `modules/versioning`, taking the part after the last at sign as the version, except that the at sign of an SSH git address such as `git@github.com:foo/bar.git` is part of the source.

Source: both

#### Scenario: Range pinned

- **WHEN** the user runs `cyberismo module install base@^1.0.0`
- **THEN** the module `base` is installed with the range `^1.0.0`

#### Scenario: SSH address without a version

- **WHEN** the user runs `cyberismo module install git@github.com:foo/bar.git`
- **THEN** the whole argument is used as the source and no version is requested

### Requirement: The credentials argument selects authenticated cloning

`cyberismo module install <source> [useCredentials]` SHALL clone with the credentials from the environment when the second argument is `true` and without them when it is `false`; when it is omitted, the hub's private flag applies as specified in `modules/installation`.

Source: both

#### Scenario: Private module

- **WHEN** the user runs `cyberismo module install https://example.com/mod.git true`
- **THEN** the clone is made with the credentials from the environment

### Requirement: Module install without a source offers the importable modules

`cyberismo module install` with no source SHALL list the modules the hubs offer for selection, and install the selected one as if its source had been given; when there are none it SHALL fail with `No modules available`.

Source: code

#### Scenario: Module picked from the list

- **GIVEN** the hubs offer a private module `Secure Dev`
- **WHEN** the user runs `cyberismo module install` and selects `Secure Dev`
- **THEN** the module is installed using its private setting

#### Scenario: Nothing to offer

- **GIVEN** the hubs offer no modules
- **WHEN** the user runs `cyberismo module install`
- **THEN** stderr is `No modules available`
- **AND** the exit code is 1

### Requirement: Module install and update report the migrations replayed

After a module install or update the command SHALL print one line per module whose recorded changes were replayed, in the form `Replayed migrations for module '<prefix>': <from> -> <to> (<n> seal(s))`, and a warning to stderr for each module whose replay was skipped.

Source: code

#### Scenario: Replay reported

- **GIVEN** updating module `base` from 1.0.0 to 1.1.0 replays 2 sealed change sets
- **WHEN** the user runs `cyberismo module update`
- **THEN** stdout includes `Replayed migrations for module 'base': 1.0.0 -> 1.1.0 (2 seal(s))`

#### Scenario: Skipped entries

- **GIVEN** the replay ignores 1 retired entry
- **WHEN** the command prints the replay line
- **THEN** the line ends with `; ignored 1 entry for retired operations (<operation>)`

### Requirement: New validation errors after an install are reported on stderr

When a module install or update leaves new validation errors in the project, the command SHALL print `There are new validations errors after importing the module. Check the project` to stderr.

Source: code

#### Scenario: Validation errors introduced

- **GIVEN** the installed module makes the project invalid
- **WHEN** the user runs `cyberismo module install ./module-test`
- **THEN** stderr includes `There are new validations errors after importing the module. Check the project`

### Requirement: A failed install or update still prints what ran

When a module install or update fails because a replay or a validation failed, the command SHALL print the replay lines of the work done before the failure and then fail with the error and exit code 1.

Source: code

#### Scenario: Replay fails

- **GIVEN** an update replays module `base` and then fails for module `iso`
- **WHEN** the user runs `cyberismo module update`
- **THEN** stdout includes the replay line for `base`
- **AND** stderr states the failure
- **AND** the exit code is 1

### Requirement: Module update updates all modules or one module

`cyberismo module update [moduleName] [version]` SHALL update all installed modules, or the named module, optionally to the given exact version, as specified in `modules/updates`, and print `Done`.

Source: both, jira (INTDEV-901)

#### Scenario: All modules updated

- **WHEN** the user runs `cyberismo module update`
- **THEN** stdout is `Done`

#### Scenario: One module at a version

- **WHEN** the user runs `cyberismo module update base 1.2.0`
- **THEN** only the module `base` is updated, to 1.2.0

### Requirement: A target version needs a module name

`cyberismo module update` given a version but no module name SHALL fail with `A target version can only be specified together with a module name` and change nothing.

Source: both

#### Scenario: Version alone

- **WHEN** the user runs `cyberismo module update "" 1.2.0`
- **THEN** stderr is `A target version can only be specified together with a module name`
- **AND** the exit code is 1

### Requirement: Dry run prints the update plan and changes nothing

`cyberismo module update --dry-run [moduleName] [version]` SHALL print the update plan as specified in `modules/updates`, change nothing, and exit with code 0 when the plan can be applied.

Source: both, jira (INTDEV-1435)

#### Scenario: Unversioned module refetched

- **GIVEN** the installed module `test` has no version
- **WHEN** the user runs `cyberismo module update --dry-run`
- **THEN** stdout lists under `Would update:` the line `test    (unversioned)  refetched`
- **AND** the exit code is 0

### Requirement: A blocked dry run prints the conflicts and exits with code 1

When the plan cannot be applied, `cyberismo module update --dry-run` SHALL print `Cannot update:` with one line `<module>: <reason>` per conflict and `Nothing was changed.` to stdout, and exit with code 1.

Source: both

#### Scenario: Conflict

- **GIVEN** two modules require incompatible versions of `base`
- **WHEN** the user runs `cyberismo module update --dry-run`
- **THEN** stdout starts with `Cannot update:` and lists the conflict of `base`
- **AND** stdout ends with `Nothing was changed.`
- **AND** the exit code is 1

### Requirement: The plan lists moves, removals, recorded ranges and held-back modules

The plan output SHALL list, each under its own heading and separated by blank lines, the modules that would move (`Would update:`, with `from  →  to`, and `(breaking)` on a breaking move), the modules that would be removed (`Would remove:`), the version ranges that would be recorded (`Would record version ranges:`) and the modules held back by their range (`Held back by the declared range:`, with the newest available version and the range).

Source: both

#### Scenario: Breaking move

- **GIVEN** the plan moves `base` from 1.4.0 to 2.0.0 as a breaking change
- **WHEN** the plan is printed
- **THEN** a line under `Would update:` reads `base    1.4.0  →  2.0.0  (breaking)`

#### Scenario: Held back

- **GIVEN** `iso` has 3.0.0 available but is bound to `^2.0.0`
- **WHEN** the plan is printed
- **THEN** a line under `Held back by the declared range:` reads `iso    3.0.0 available (range ^2.0.0)`

### Requirement: The plan ends with an apply hint only when it would act

A plan that would move, remove or record something SHALL end with the lines `Migration and schema compatibility is only checked when applying; the update can still be refused.` and `Nothing was changed. To apply, run the same command without --dry-run.`; a plan that does nothing and holds nothing back SHALL print only `All modules are up to date.`

Source: code

#### Scenario: Nothing to do

- **GIVEN** every module is at the newest version its range allows and none is held back
- **WHEN** the user runs `cyberismo module update --dry-run`
- **THEN** stdout is `All modules are up to date.`

### Requirement: Module remove removes an imported module

`cyberismo module remove <name>` SHALL remove the imported module as specified in `modules/installation` and print `Done`.

Source: both

#### Scenario: Module removed

- **WHEN** the user runs `cyberismo module remove test`
- **THEN** stdout is `Done`
- **AND** `cyberismo module list` no longer lists `test`

#### Scenario: Name missing

- **WHEN** the user runs `cyberismo module remove`
- **THEN** stderr states that the argument `name` is missing
- **AND** the exit code is 1

### Requirement: Module list prints the imported modules

`cyberismo module list` SHALL print the modules imported into the project as JSON.

Source: both

#### Scenario: Listed from outside

- **WHEN** the user runs `cyberismo module list -p cyberismo-cli-module` from the parent folder
- **THEN** stdout is a JSON array containing an entry with `"name": "test"`

### Requirement: Show reads modules and hubs

`cyberismo show module <name>` SHALL print one installed module as JSON, `show hubs` SHALL print the project's hubs after refreshing the module lists, and `show importableModules` SHALL print the modules the hubs offer that are not yet installed, with `--showAll` (`-a`) including installed ones and `--details` (`-d`) adding their details.

Source: code

#### Scenario: Importable modules with all

- **WHEN** the user runs `cyberismo show importableModules -a`
- **THEN** stdout is a JSON array that includes modules already installed

### Requirement: Add hub adds a hub to the project

`cyberismo add hub <location>` SHALL add the hub as specified in `modules/hubs` and print `Hub '<location>' was added to the project`, where `default` as the location means the default hub.

Source: both

#### Scenario: Default hub added

- **WHEN** the user runs `cyberismo add hub default`
- **THEN** stdout is `Hub '<default hub URL>' was added to the project`

### Requirement: Remove hub removes a hub from the project

`cyberismo remove hub <location>` SHALL remove the hub as specified in `modules/hubs` and print `Done`, where `default` means the default hub.

Source: both

#### Scenario: Default hub removed

- **GIVEN** the default hub is added
- **WHEN** the user runs `cyberismo remove hub default`
- **THEN** stdout is `Done`

#### Scenario: Location missing

- **WHEN** the user runs `cyberismo remove hub`
- **THEN** stderr is `error: missing argument <location>`
- **AND** the exit code is 1

### Requirement: Fetch hubs refreshes the module lists and names unreadable hubs

`cyberismo fetch hubs` SHALL refresh the module lists of all hubs and print `Done`; when a hub cannot be read it SHALL fail with one line `<location>: <message>` per hub followed by `Modules from the hubs that could be read were refreshed.`

Source: both

#### Scenario: One hub unreachable

- **GIVEN** the hub `https://bad.example/hub.json` is unreachable
- **WHEN** the user runs `cyberismo fetch hubs`
- **THEN** stderr lists `https://bad.example/hub.json: <message>` and `Modules from the hubs that could be read were refreshed.`
- **AND** the exit code is 1

### Requirement: Create version bumps the project version

`cyberismo create version <major|minor|patch>` SHALL bump the project version as specified in `modules/versioning` and print `Bumped to v<new>`, with ` (was v<old>)` appended when a version existed.

Source: both, jira (INTDEV-1087)

#### Scenario: First version

- **GIVEN** the project has no version
- **WHEN** the user runs `cyberismo create version patch`
- **THEN** stdout is `Bumped to v1.0.0`

#### Scenario: Invalid bump

- **WHEN** the user runs `cyberismo create version huge`
- **THEN** stderr names the invalid choice and lists major, minor and patch
- **AND** the exit code is 1

### Requirement: Publish creates the version tag and pushes it

`cyberismo publish [--remote <name>]` SHALL publish the current version as specified in `modules/versioning` and print `Published v<version>`; the remote defaults to `origin`.

Source: both

#### Scenario: Published

- **GIVEN** the project is at version 1.0.0
- **WHEN** the user runs `cyberismo publish`
- **THEN** stdout is `Published v1.0.0`

### Requirement: Publish dry run says what would happen

`cyberismo publish --dry-run` SHALL change nothing and print `Would publish v<version> (create tag and push to remote '<remote>')`.

Source: both

#### Scenario: Dry run

- **GIVEN** the project is at version 1.0.0
- **WHEN** the user runs `cyberismo publish --dry-run`
- **THEN** stdout is `Would publish v1.0.0 (create tag and push to remote 'origin')`

### Requirement: Deprecated module spellings run the new commands

`cyberismo import module`, `update-modules` and `remove module` SHALL behave as `module install`, `module update` and `module remove`, and `check-updates [moduleName]` SHALL behave as `module update --dry-run`, each with the deprecation warning of `cli/conventions`.

Source: both, jira (INTDEV-1439, INTDEV-1435)

#### Scenario: check-updates

- **WHEN** the user runs `cyberismo check-updates`
- **THEN** stdout equals that of `cyberismo module update --dry-run`
- **AND** stderr says `'cyberismo check-updates' is deprecated. Use 'cyberismo module update --dry-run'`
