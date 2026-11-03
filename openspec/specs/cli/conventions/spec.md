# cli/conventions Specification

## Purpose

The rules every `cyberismo` command shares: global options, how the project is located, what is printed on success and on failure, exit codes, deprecated spellings, who a write is attributed to, and the user preferences file. What each command does is specified in the other `cli/` capabilities; the operations they invoke are specified in the domain capabilities.

## Requirements

### Requirement: The version option prints the tool and schema versions

The `--version` (`-v`) option SHALL print the tool version and the project schema version on two lines and exit with code 0.

Source: code, jira (INTDEV-1015)

#### Scenario: Version printed

- **WHEN** the user runs `cyberismo --version`
- **THEN** stdout is `cyberismo version: <version>` followed by `Schema version: <version>`
- **AND** the exit code is 0

### Requirement: Unknown options are refused with a usage error

A command given an option it does not define SHALL print an `error:` line naming the option to stderr, print nothing to stdout and exit with code 1.

Source: code

#### Scenario: Unknown option

- **WHEN** the user runs `cyberismo --bogus`
- **THEN** stderr is `error: unknown option '--bogus'`
- **AND** the exit code is 1

### Requirement: The log level option accepts the six levels and defaults to fatal

The global `--log-level` (`-L`) option SHALL accept trace, debug, info, warn, error or fatal and SHALL default to fatal, so that a command prints no log output unless asked.

Source: both

#### Scenario: Invalid log level

- **WHEN** the user runs `cyberismo -L loud validate`
- **THEN** stderr names the invalid choice and lists the six levels
- **AND** the exit code is 1

### Requirement: The project path option selects the project

The `--project-path` (`-p`) option, accepted by every command that works on a project, SHALL make the command act on the project at that path, wherever the command is run from.

Source: both

#### Scenario: Run from outside the project

- **GIVEN** a project at `/work/demo` and the current directory `/tmp`
- **WHEN** the user runs `cyberismo show project -p /work/demo`
- **THEN** the project's information is printed
- **AND** the exit code is 0

### Requirement: Without a project path the nearest enclosing project is used

A command run without `-p` SHALL act on the nearest folder at or above the current directory that is a project; when there is none it SHALL print `No path defined with "-p" flag and could not find project. Sorry.` to stderr and exit with code 1.

Source: code

#### Scenario: Run inside a card folder

- **GIVEN** the current directory is `/work/demo/cardRoot`
- **WHEN** the user runs `cyberismo show project`
- **THEN** the project at `/work/demo` is shown

#### Scenario: Run outside any project

- **GIVEN** the current directory is not inside a project
- **WHEN** the user runs `cyberismo show project`
- **THEN** stderr is `No path defined with "-p" flag and could not find project. Sorry.`
- **AND** the exit code is 1

### Requirement: A path that is not a project is refused

A command given `-p` with a folder that is not a project SHALL print an `Input validation error` naming the folder to stderr and exit with code 1.

Source: code

#### Scenario: Not a project folder

- **WHEN** the user runs `cyberismo show project -p nope`
- **THEN** stderr is `Input validation error: folder name 'nope' is invalid`
- **AND** the exit code is 1

### Requirement: A command with nothing to report prints Done

A command that succeeds and has no result to show SHALL print `Done` to stdout and exit with code 0.

Source: code

#### Scenario: Move prints Done

- **WHEN** the user runs `cyberismo move <card2> root`
- **THEN** stdout is `Done`
- **AND** the exit code is 0

### Requirement: Commands that show data print indented JSON

A command that returns structured data SHALL print it to stdout as JSON indented by two spaces.

Source: code

#### Scenario: Listing card types

- **WHEN** the user runs `cyberismo show cardTypes`
- **THEN** stdout is the JSON array `["test/cardTypes/page"]`, indented over several lines

### Requirement: A failed command prints its message to stderr and exits with code 1

A command whose operation fails SHALL print the failure message to stderr, print nothing to stdout and exit with code 1, whatever the kind of failure.

Source: code

#### Scenario: Card does not exist

- **WHEN** the user runs `cyberismo remove card test_nope`
- **THEN** stderr states that card `test_nope` does not exist in the project
- **AND** stdout is empty
- **AND** the exit code is 1

### Requirement: A failure without a message prints a generic message

A command that fails without a message of its own SHALL print `Command failed` to stderr and exit with code 1.

Source: code

#### Scenario: Failure with no message

- **GIVEN** an operation that fails with an empty message
- **WHEN** the command reports the failure
- **THEN** stderr is `Command failed`
- **AND** the exit code is 1

### Requirement: A deprecated spelling still works and warns on stderr

A deprecated command spelling SHALL perform the same operation as its replacement, SHALL print a deprecation warning naming the replacement to stderr, and SHALL NOT be listed in help.

Source: both, jira (INTDEV-1439)

#### Scenario: Deprecated listing of modules

- **WHEN** the user runs `cyberismo show modules`
- **THEN** stdout holds the module list
- **AND** stderr says `'cyberismo show modules' is deprecated. Use 'cyberismo module list'`
- **AND** `cyberismo --help` does not list the spelling

### Requirement: Commands that may leave dormant field values say so

After a command that can leave dormant field values behind, as specified in `fields/field-values`, the command SHALL print a note, after `Done` or its result, giving the number of values and cards and the `cyberismo clean` commands, only when the project holds such values.

Source: code

#### Scenario: Note after removing a field type

- **GIVEN** cards store 2 values of field type `test/fieldTypes/risk`
- **WHEN** the user runs `cyberismo remove fieldType test/fieldTypes/risk`
- **THEN** stdout is `Done` followed by a blank line and a note counting the dormant values and cards and naming `cyberismo clean --dry-run` and `cyberismo clean`

#### Scenario: No note when nothing is dormant

- **GIVEN** no card stores a dormant value
- **WHEN** the user runs `cyberismo remove fieldType test/fieldTypes/risk`
- **THEN** stdout is `Done` only

### Requirement: Autocommit and autopush are global options

The global `--autocommit` option SHALL turn on autocommit for the command's writes as specified in `projects/change-tracking`, and `--autopush` SHALL additionally push the commits to the remote; both are off by default.

Source: code

#### Scenario: Create version with autocommit

- **GIVEN** a git-tracked project
- **WHEN** the user runs `cyberismo --autocommit create version patch`
- **THEN** the project history gains a commit for the version bump

### Requirement: A write is attributed to the git author of the caller

A write command SHALL act, as the acting user of `projects/change-tracking`, as the git author resolved from the environment variables `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`, else the `author.*` git settings, else the `user.*` git settings, and SHALL act as the system when no name and email is found.

Source: code

#### Scenario: Author from the environment

- **GIVEN** `GIT_AUTHOR_NAME` is Dana and `GIT_AUTHOR_EMAIL` is dana@example.com
- **WHEN** the user runs a write command with `--autocommit`
- **THEN** the commit author is Dana <dana@example.com>

#### Scenario: author settings win over user settings

- **GIVEN** git settings `author.name` Ann and `user.name` Bob, both with emails
- **WHEN** the user runs a write command with `--autocommit`
- **THEN** the commit author is Ann

### Requirement: Git credentials come from the environment

Commands that fetch from private git sources SHALL take the user name and access token from the environment variables `CYBERISMO_GIT_USER` and `CYBERISMO_GIT_TOKEN`.

Source: both

#### Scenario: Private module install

- **GIVEN** `CYBERISMO_GIT_USER` and `CYBERISMO_GIT_TOKEN` are set
- **WHEN** the user runs `cyberismo module install https://example.com/mod.git true`
- **THEN** the clone is made with those credentials

### Requirement: Help is available for every command

`--help` (`-h`) and `cyberismo help [command]` SHALL print usage, arguments and options of the command to stdout and exit with code 0; a command group lists its subcommands.

Source: both, jira (INTDEV-715)

#### Scenario: Group help

- **WHEN** the user runs `cyberismo create --help`
- **THEN** stdout lists the `create` subcommands such as `card`, `attachment` and `project`
- **AND** the exit code is 0

### Requirement: Subcommands of a group accept the project path option

A subcommand of a command group (such as `create`, `add`, `rank`, `module`) SHALL accept `-p` after the subcommand arguments.

Source: code

#### Scenario: Group subcommand with -p

- **WHEN** the user runs `cyberismo create label <card1> urgent -p /work/demo`
- **THEN** the label is added in the project at `/work/demo`

### Requirement: The user preferences file is created with defaults

A command that needs the user's preferences SHALL read `.cyberismo/cards.prefs.json` in the user's home folder, creating it with default editor commands for darwin, linux and win32 when it does not exist and keeping it unchanged when it does.

Source: code

#### Scenario: First use

- **GIVEN** the home folder has no `.cyberismo/cards.prefs.json`
- **WHEN** the user runs `cyberismo edit <card1>`
- **THEN** the file now exists with an editor command for each platform

#### Scenario: Unreadable preferences

- **GIVEN** the preferences file holds invalid JSON
- **WHEN** the user runs `cyberismo edit <card1>`
- **THEN** stderr states that the preferences file could not be read, naming its path
- **AND** the exit code is 1
