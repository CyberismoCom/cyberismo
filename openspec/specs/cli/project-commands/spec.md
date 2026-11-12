# cli/project-commands Specification

## Purpose

The `cyberismo` commands that act on a whole project rather than on its cards, resources or modules: creating, renaming, migrating, exporting and serving projects, cleaning dormant values, and installing the agent bootstrap. The rules are specified in `projects/setup`, `projects/schema-migration`, `export/documents`, `fields/field-values`, `skills` and `ui/static-site`; output and exit codes follow `cli/conventions`.

## Requirements

### Requirement: Create project creates a project at a path

`cyberismo create project <name> <prefix> <path> [category] [description]` SHALL create the project in the folder at the path as specified in `projects/setup`, accepting `~` for the home folder, and print `Done`.

Source: both

#### Scenario: Project created

- **WHEN** the user runs `cyberismo create project "Demo" demo ./demo -s`
- **THEN** stdout is `Done`
- **AND** `./demo` is a project with prefix `demo` that `cyberismo validate -p ./demo` accepts

#### Scenario: Path under the home folder

- **WHEN** the user runs `cyberismo create project Home home ~/home -s`
- **THEN** the project exists in the `home` folder under the user's home folder

### Requirement: Create project refuses an invalid prefix and creates nothing

`cyberismo create project` given a prefix that is not valid SHALL fail with an error naming the prefix and create no folder.

Source: both

#### Scenario: Invalid prefix

- **WHEN** the user runs `cyberismo create project Golden "G!" golden`
- **THEN** stderr states that the prefix `G!` is invalid
- **AND** the exit code is 1
- **AND** the folder `golden` does not exist

### Requirement: Create project needs git

`cyberismo create project` run where git is not installed SHALL fail with `git is required to create a project, but it was not found. Install git and make sure it is on PATH.`

Source: code

#### Scenario: No git

- **GIVEN** git is not on PATH
- **WHEN** the user runs `cyberismo create project Gitless gitl gl`
- **THEN** stderr is that message
- **AND** the exit code is 1

### Requirement: Create project prints its warnings to stderr

Warnings from creating a project, such as a default hub that could not be added, SHALL be printed to stderr one per line, and the command SHALL still succeed.

Source: code

#### Scenario: Default hub unreachable

- **GIVEN** the default hub cannot be added
- **WHEN** the user runs `cyberismo create project Demo demo ./demo`
- **THEN** stderr states that the default hub could not be added
- **AND** the project is created

### Requirement: Create project offers modules to import unless skipped

After creating a project, `cyberismo create project` SHALL show the modules the hubs offer as a multiple-choice list and install those selected, unless `--skipModuleImport` (`-s`) is given; a module that fails to install SHALL be named in a warning on stderr and SHALL NOT fail the command.

Source: both, jira (INTDEV-1109)

#### Scenario: Selected modules installed

- **WHEN** the user runs `cyberismo create project Demo demo ./demo` and selects the module `base`
- **THEN** the module `base` is installed in the new project

#### Scenario: One module fails

- **GIVEN** the user selects modules `base` and `iso` and `iso` cannot be installed
- **WHEN** the installs finish
- **THEN** stderr includes `Failed to import module 'iso'` and `Some modules failed to import: iso`
- **AND** the exit code is 0

### Requirement: Create project can be run through the resource form

`cyberismo create resource project <name> <prefix> [category] [description]` SHALL create the project at the `-p` path as `create project` does, without the module prompt; a resource name of type `projects` SHALL be refused as no creatable resource.

Source: code

#### Scenario: Resource name of type projects

- **WHEN** the user runs `cyberismo create resource gold/projects/golden`
- **THEN** stderr states `Unknown type to create: 'projects'`
- **AND** the exit code is 1

### Requirement: Rename changes the project prefix

`cyberismo rename <to>` SHALL change the project prefix as specified in `projects/setup` and print `Done`; `--force` SHALL request the forced rename of a published project specified in `projects/setup`.

Source: both

#### Scenario: Prefix renamed

- **WHEN** the user runs `cyberismo rename cli`
- **THEN** stdout is `Done`
- **AND** `cyberismo validate` prints `Project structure validated`

### Requirement: Rename of a published project explains the consequence

After a forced rename of a project that had published a version, `cyberismo rename` SHALL print after `Done` a note that the version was published under the old prefix and that the next published version is a new module.

Source: code

#### Scenario: Forced rename after publishing

- **GIVEN** version 1.2.0 was published
- **WHEN** the user runs `cyberismo rename p --force`
- **THEN** stdout is `Done`, a blank line and a note starting `Version 1.2.0 was published under the old prefix.`

### Requirement: Migrate brings a project to the latest schema version

`cyberismo migrate` SHALL migrate the project at `-p` or the current project to the latest schema version as specified in `projects/schema-migration`, without opening the project first, and print the progress and `Successfully migrated from version <from> to <to>. Run 'cyberismo validate' to check the project.`

Source: both

#### Scenario: Older project migrated

- **GIVEN** a project at schema version 4
- **WHEN** the user runs `cyberismo migrate`
- **THEN** stdout starts with `Migrating from schema version 4 to 5`
- **AND** ends with `Successfully migrated from version 4 to 5. Run 'cyberismo validate' to check the project.`

#### Scenario: Current project

- **GIVEN** a project at the latest schema version
- **WHEN** the user runs `cyberismo migrate`
- **THEN** stdout is `Project is already at version 5. No migration needed.`
- **AND** the exit code is 0

### Requirement: Migrate refuses a project it cannot migrate

`cyberismo migrate` given a folder that is not a project, or a project with no schema version, SHALL fail with the reason on stderr and exit with code 1.

Source: code

#### Scenario: No schema version

- **GIVEN** a project whose configuration has no schema version
- **WHEN** the user runs `cyberismo migrate`
- **THEN** stderr is `Project has no schema version set`
- **AND** the exit code is 1

### Requirement: Export takes a format, an output path and an optional card

`cyberismo export <format> <output> [cardKey]` SHALL accept the formats `adoc`, `pdf` and `site`, and SHALL refuse any other format with an error listing the valid choices.

Source: both

#### Scenario: Unknown format

- **WHEN** the user runs `cyberismo export docx out`
- **THEN** stderr names the invalid choice and lists the formats
- **AND** the exit code is 1

### Requirement: Export adoc writes an AsciiDoc document folder

`cyberismo export adoc <output> [cardKey]` SHALL write the export of the project, or of the card and its subtree, as specified in `export/documents` into the output folder as `index.adoc` with an `a` folder for attachments, and print `Creating output file '<output>/index.adoc'` for a new document or `Using existing output file '<output>/index.adoc'` when it existed.

Source: code

#### Scenario: Project exported

- **WHEN** the user runs `cyberismo export adoc out`
- **THEN** stdout is `Creating output file 'out/index.adoc'`
- **AND** `out/a` is a folder

#### Scenario: Card exported over an existing document

- **GIVEN** `out/index.adoc` exists
- **WHEN** the user runs `cyberismo export adoc out <card1>`
- **THEN** stdout is `Using existing output file 'out/index.adoc'`
- **AND** the document holds only `<card1>` and its subtree

### Requirement: Export pdf writes a PDF file

`cyberismo export pdf <output> [cardKey]` SHALL write the PDF export as specified in `export/documents` to the output file, using the options `--title` (`-t`), `--name` (`-n`), `--date` (`-d`) and `--revremark` (`-m`) for the document, and print `Content exported as PDF to <output>`.

Source: code

#### Scenario: PDF exported with options

- **WHEN** the user runs `cyberismo export pdf ./test.pdf <card1> -t "Test Doc" -n BAT -d 2024-01-01 -m "Initial version"`
- **THEN** stdout is `Content exported as PDF to ./test.pdf`
- **AND** `./test.pdf` exists

### Requirement: Export pdf reports the number of rendering warnings

When the PDF export has rendering warnings the message SHALL end with ` with 1 rendering warning` or ` with <n> rendering warnings`.

Source: code

#### Scenario: Two warnings

- **GIVEN** rendering the PDF produces 2 warnings
- **WHEN** the user runs `cyberismo export pdf out.pdf`
- **THEN** stdout is `Content exported as PDF to out.pdf with 2 rendering warnings`

### Requirement: A failed PDF rendering prints the renderer's diagnostics

When the PDF renderer fails, `cyberismo export pdf` SHALL fail with the failure message followed by the renderer's diagnostic lines on stderr and exit with code 1.

Source: code

#### Scenario: Renderer fails

- **GIVEN** the renderer exits with code 1 and reports one error line
- **WHEN** the user runs `cyberismo export pdf out.pdf <card1>`
- **THEN** stderr is a failure message naming the renderer's exit code 1, followed by the error line
- **AND** the exit code is 1

### Requirement: Export site writes a static documentation site

`cyberismo export site <output> [cardKey]` SHALL export every project found in the project path, or in the current folder, as a static site into the output folder as specified in `ui/static-site`, show a progress bar, and print `Exported site to <output>` and `Run 'cyberismo preview <output>' to view the site`; `--recursive` (`-r`) includes the cards under the given card and `--default-project <prefix>` names the project the site opens first.

Source: both

#### Scenario: Site exported

- **WHEN** the user runs `cyberismo export site out`
- **THEN** stdout includes `Exported site to out` and `Run 'cyberismo preview out' to view the site`
- **AND** the exit code is 0

### Requirement: Export site reports projects that fail

`cyberismo export site` SHALL fail with exit code 1 and `No projects found in '<path>'.` when the path holds no project, and with `Export failed:` or `Export completed with errors:` followed by the errors per project when a project failed to load or to export.

Source: code

#### Scenario: No projects

- **WHEN** the user runs `cyberismo export site out -p /empty`
- **THEN** stderr is `No projects found in '/empty'.`
- **AND** the exit code is 1

#### Scenario: One project fails to export

- **GIVEN** the project `demo` fails to export
- **WHEN** the user runs `cyberismo export site out`
- **THEN** stderr starts with `Export completed with errors:` and lists the errors of `demo`
- **AND** the exit code is 1

### Requirement: Preview serves an exported site

`cyberismo preview [dir]` SHALL serve the exported site in the directory, or in the current directory, until the process is stopped.

Source: both

#### Scenario: Site previewed

- **GIVEN** an exported site in `out`
- **WHEN** the user runs `cyberismo preview out`
- **THEN** the site is served for viewing in a browser

### Requirement: App starts the web application for a project or a collection

`cyberismo app` SHALL start the web application on the project at `-p` or the current folder, serving a folder that is itself a project as a single project and any other folder as a collection of projects, and accept `--watch-resource-changes` (`-w`), `--autocommit` and `--autopush`.

Source: both

#### Scenario: Single project

- **WHEN** the user runs `cyberismo app -p ./demo`
- **THEN** the application serves the project `demo` only

#### Scenario: Collection

- **WHEN** the user runs `cyberismo app -p ./projects`
- **THEN** the application serves every project found in `./projects`

### Requirement: App reports projects with errors and asks whether to start

When some project fails to load or to validate, `cyberismo app` SHALL print the errors per project to stderr and ask `<n> of <total> projects have validation errors. Start anyway?`, starting when the user confirms or does not answer within 10 seconds and stopping when the user declines.

Source: code

#### Scenario: Project from a newer schema

- **GIVEN** the project `new` has schema version 999
- **WHEN** the user runs `cyberismo app -p ./projects`
- **THEN** stderr lists `new (1):` with a schema version mismatch message
- **AND** the prompt `1 of <total> projects have validation errors. Start anyway?` is shown

#### Scenario: User declines

- **WHEN** the user answers no to the prompt
- **THEN** the process exits without starting the application

### Requirement: App tells when no projects are found and when git identity is missing

`cyberismo app` SHALL print `No projects found. Starting with empty project collection.` when the folder holds no project, and `Warning: git user.name or user.email is not configured. Using defaults.` to stderr when git has no user name or email.

Source: code

#### Scenario: Empty folder

- **WHEN** the user runs `cyberismo app -p ./empty`
- **THEN** stdout includes `No projects found. Starting with empty project collection.`

### Requirement: Clean removes dormant field values and lists them

`cyberismo clean` SHALL remove the dormant field values as specified in `fields/field-values` and print one line `  <cardKey>: <field> (<reason>)` per value followed by `Removed <n> field value(s) from <m> card(s)`.

Source: both

#### Scenario: Values removed

- **GIVEN** card `<card1>` stores an empty value for the field `test/fieldTypes/note`
- **WHEN** the user runs `cyberismo clean`
- **THEN** stdout is `  <card1>: test/fieldTypes/note (null-value)` and `Removed 1 field value(s) from 1 card(s)`

### Requirement: Clean dry run lists what would be removed and changes nothing

`cyberismo clean --dry-run` SHALL print the same lines with `Would remove <n> field value(s) from <m> card(s)` and SHALL NOT change any card.

Source: both

#### Scenario: Dry run

- **GIVEN** card `<card1>` stores an empty value for the field `test/fieldTypes/note`
- **WHEN** the user runs `cyberismo clean --dry-run`
- **THEN** stdout ends with `Would remove 1 field value(s) from 1 card(s)`
- **AND** the card still stores the value

### Requirement: Clean reports nothing to clean, skipped cards and failures

`cyberismo clean` SHALL print `Nothing to clean` when no value is dormant, and SHALL append lines naming the cards skipped because their card type cannot be resolved and the cards whose values could not be removed, which are not counted as removed.

Source: code

#### Scenario: Nothing dormant

- **WHEN** the user runs `cyberismo clean` in a project with no dormant values
- **THEN** stdout is `Nothing to clean`

### Requirement: Install skills writes the agent bootstrap into a folder

`cyberismo install-skills [path]` SHALL write the bootstrap skill into `.claude/skills/dynamic-skill-discovery`, register the `cyberismo` MCP server in `.mcp.json` without changing other servers, and put a Cyberismo-managed block in `CLAUDE.md`, in the folder at the path or the current folder, and print `Installed skill discovery into '<path>':` followed by the written paths.

Source: both, jira (INTDEV-1336)

#### Scenario: Installed into the current folder

- **WHEN** the user runs `cyberismo install-skills`
- **THEN** stdout lists `.claude/skills/dynamic-skill-discovery/SKILL.md`, `.mcp.json` and `CLAUDE.md`
- **AND** `.mcp.json` registers `cyberismo` as an HTTP server at `http://localhost:3000/mcp`

#### Scenario: Existing servers and text kept

- **GIVEN** `.mcp.json` registers another server and `CLAUDE.md` holds the line `# Notes`
- **WHEN** the user runs `cyberismo install-skills`
- **THEN** the other server is still registered and `# Notes` is still in `CLAUDE.md`

### Requirement: Install skills is safe to repeat

Running `cyberismo install-skills` again SHALL replace only the managed block in `CLAUDE.md` and the `cyberismo` entry in `.mcp.json`, and SHALL overwrite the bootstrap skill file, leaving no duplicates.

Source: both

#### Scenario: Run twice

- **WHEN** the user runs `cyberismo install-skills` twice
- **THEN** `CLAUDE.md` holds one managed block and `.mcp.json` one `cyberismo` entry

### Requirement: Install skills accepts a platform and an MCP URL

`cyberismo install-skills --target <platform>` SHALL accept only `claude`, the default, and `--url <url>` SHALL register that MCP server URL instead of `http://localhost:3000/mcp`.

Source: both

#### Scenario: Custom URL

- **WHEN** the user runs `cyberismo install-skills --url http://localhost:4000/mcp`
- **THEN** `.mcp.json` registers `cyberismo` at `http://localhost:4000/mcp`

#### Scenario: Unsupported platform

- **WHEN** the user runs `cyberismo install-skills --target github`
- **THEN** stderr names the invalid choice
- **AND** the exit code is 1

### Requirement: Install skills creates the folder and reports write failures

`cyberismo install-skills <path>` SHALL create the folder when it does not exist, and SHALL fail with the error on stderr and exit code 1 when a file cannot be written.

Source: code

#### Scenario: New folder

- **WHEN** the user runs `cyberismo install-skills ./repo-root` and the folder does not exist
- **THEN** `./repo-root/.mcp.json` exists

#### Scenario: Unwritable MCP configuration

- **GIVEN** `.mcp.json` is a folder
- **WHEN** the user runs `cyberismo install-skills`
- **THEN** stderr states the write failure
- **AND** the exit code is 1

### Requirement: Show project prints the project information

`cyberismo show project` SHALL print the project's name, path, prefix, description, hubs, modules and number of cards as JSON.

Source: both

#### Scenario: Project shown

- **WHEN** the user runs `cyberismo show project`
- **THEN** stdout is JSON with `name`, `path`, `prefix`, `description`, `hubs`, `modules` and `numberOfCards`
