# projects/setup Specification

## Purpose

Creating, opening, cloning, listing and configuring projects. This capability covers a project's own settings and its card-key prefix, and a directory that holds several projects; the project format version check is in `projects/schema-migration`, and installing modules into a project in `modules/installation`.

## Requirements

### Requirement: A new project has a name, a prefix and optional details

Creating a project SHALL write a project with the given name and card-key prefix and the optional category and description, and give back its location and prefix.

Source: both

#### Scenario: Create with all details

- **WHEN** a project is created with name New Project, prefix newp, category Development and description A new project
- **THEN** the project has those four settings
- **AND** the result names the project's location and the prefix newp

#### Scenario: Optional details left out

- **WHEN** a project is created with only a name and a prefix
- **THEN** the project has no category and an empty description

### Requirement: A new project is valid and committed

A created project SHALL pass project validation and, as a git repository, SHALL have its content committed as the initial commit authored by the acting user.

Source: code, jira (INTDEV-1249)

#### Scenario: Created project validates

- **WHEN** a project is created at an empty path
- **THEN** validating the project reports no errors
- **AND** the first commit is named Initial commit and has no uncommitted changes after it

### Requirement: A project prefix is three to ten lowercase letters

A project SHALL be refused a prefix that is not three to ten lowercase letters, with an error saying what the prefix must be, and nothing SHALL be written.

Source: code, jira (INTDEV-1092)

#### Scenario: Prefix too long

- **WHEN** a project is created with the prefix abcdefghijk
- **THEN** it is refused with an error saying the prefix must be from 3 to 10 characters
- **AND** the path does not exist

#### Scenario: Uppercase prefix

- **WHEN** a project is created with the prefix Test
- **THEN** it is refused with an error naming the invalid prefix Test

### Requirement: A project name has letters, spaces, periods, underscores and hyphens

A project name SHALL consist of 1 to 63 letters, spaces, periods, underscores and hyphens, and a name with other characters MUST be refused with nothing written.

Source: code

#### Scenario: Name with an exclamation mark

- **WHEN** a project is created with the name `New!`
- **THEN** it is refused with an error naming the invalid project name

### Requirement: A project is not created over an existing project

Creating a project at a path that already holds a project SHALL be refused and leave the existing project unchanged.

Source: code

#### Scenario: Path in use

- **GIVEN** a project New at a path
- **WHEN** a project Other is created at the same path
- **THEN** it is refused with an error saying the project exists
- **AND** the project at the path is still named New

### Requirement: A new project declares the default hub unless asked not to

Creating a project SHALL declare the default hub unless the caller asks for no default hub, and a default hub that cannot be read SHALL give a warning naming it instead of refusing the creation.

Source: code

#### Scenario: Default hub declared

- **WHEN** a project is created
- **THEN** the project's hubs are the default hub

#### Scenario: No default hub asked for

- **WHEN** a project is created asking for no default hub
- **THEN** the project declares no hubs

#### Scenario: Default hub unreachable

- **GIVEN** the default hub cannot be reached
- **WHEN** a project is created
- **THEN** the project is created and the result carries a warning that names the hub

### Requirement: A project created in a directory is listed under its prefix

Creating a project in a directory of projects SHALL place it in a folder named by its prefix and list it with its name, category and description.

Source: code

#### Scenario: Create in a directory

- **GIVEN** a directory with no projects
- **WHEN** the project newp named New is created in it
- **THEN** the directory lists `newp` with name New

### Requirement: A directory opens every project under it

A directory over a folder SHALL open and list every project found in the folder or below it, including projects several folders deep, or the folder itself when it is a project.

Source: code

#### Scenario: Two projects in a folder

- **GIVEN** a folder with the projects one and two
- **WHEN** the folder is opened as a directory
- **THEN** both are listed with their names

#### Scenario: Folder that is a project

- **WHEN** a folder that is itself the project solo is opened as a directory
- **THEN** only solo is listed

### Requirement: A project that cannot be loaded does not stop the others

A project in the directory that fails to load SHALL be reported with its prefix and the reason, the other projects SHALL still open, and opening the failed prefix SHALL be refused as not found.

Source: code

#### Scenario: One broken project

- **GIVEN** the projects broken and good, where broken fails its format check
- **WHEN** the folder is opened as a directory
- **THEN** only good is listed
- **AND** the failures name the prefix broken
- **AND** opening broken is refused as not found

### Requirement: A prefix is held by one project in a directory

When several projects in a folder have the same prefix the directory SHALL keep one and skip the others with a warning naming the prefix.

Source: code

#### Scenario: Copy of a project

- **GIVEN** a folder with the project dup and a copy of it
- **WHEN** the folder is opened as a directory
- **THEN** dup is listed once
- **AND** a warning says the other is skipped for the duplicate prefix dup

### Requirement: A project without a prefix is skipped or refused

A project whose configuration names no card-key prefix SHALL be skipped with a warning when found in a folder, and refused with an invalid-configuration error when it is the opened folder itself.

Source: code

#### Scenario: Skipped in a folder

- **GIVEN** a folder with the projects bad, whose configuration has no prefix, and good
- **WHEN** the folder is opened as a directory
- **THEN** only good is listed and a warning names the folder of bad

#### Scenario: Refused as the folder

- **WHEN** the folder of bad is opened as a directory
- **THEN** it is refused with an error saying the project configuration is invalid

### Requirement: A folder that cannot be scanned is refused

Opening a directory over a path that does not exist or is not a folder SHALL be refused.

Source: code

#### Scenario: Missing folder

- **WHEN** a directory is opened over `/nonexistent/cyberismo-folder`
- **THEN** it is refused with an error saying the folder does not exist or is not a directory

### Requirement: Opening a project requires a project folder

Opening a single project at a path that is a folder of projects rather than a project SHALL be refused with an error saying it is not a project.

Source: code

#### Scenario: Folder of projects

- **WHEN** a folder that holds the project one is opened as a project
- **THEN** it is refused with an error saying the path is not a project

### Requirement: Opening a prefix the directory does not have is refused

Opening or replacing a project by a prefix that the directory does not list SHALL be refused with a project-not-found error.

Source: code

#### Scenario: Unknown prefix

- **WHEN** the project `nope` is opened in a directory that does not list it
- **THEN** it is refused with a project-not-found error

### Requirement: A project can be cloned from a git repository into a directory

Cloning a repository into a directory SHALL add every project of the repository, skip those whose prefix the directory already has and report the skipped prefixes.

Source: code

#### Scenario: Clone with one duplicate

- **GIVEN** a directory with the project one and a repository with the projects one and two
- **WHEN** the repository is cloned
- **THEN** the project two is added and listed
- **AND** the result names one as a skipped duplicate

### Requirement: A clone without a usable project is refused and leaves nothing

Cloning a repository that has no project, or whose project configuration is broken, SHALL be refused with an error naming the repository and the directory SHALL be left as it was.

Source: code

#### Scenario: Repository without projects

- **WHEN** a repository whose only project has no prefix is cloned
- **THEN** it is refused with an error saying the clone holds no Cyberismo projects
- **AND** the directory holds only its earlier projects

### Requirement: A project's settings can be read

A project SHALL give its name, prefix, category and description, and its information with its location, hubs, modules and number of cards.

Source: both

#### Scenario: Project information

- **GIVEN** the project abc named Alpha with one hub, one module and three cards
- **WHEN** its information is read
- **THEN** it gives the name Alpha, prefix abc, the hub, the module and the card count 3

### Requirement: A project's name, description and category can be changed

Setting a project's name, description or category SHALL store it and leave the rest of the configuration as it was, and an empty description or category SHALL clear it.

Source: both

#### Scenario: Change the category

- **WHEN** the category is set to Safety
- **THEN** the project reads the category Safety
- **AND** its other settings are unchanged

#### Scenario: Clear the description

- **GIVEN** the description is About it
- **WHEN** the description is set to an empty string
- **THEN** the project reads an empty description

### Requirement: An invalid project name is refused

Setting a project name that is empty or breaks the project name rule MUST be refused, and the name SHALL stay as it was.

Source: code

#### Scenario: Name with an exclamation mark

- **GIVEN** the project is named Original
- **WHEN** the name is set to `not valid!`
- **THEN** it is refused with an error saying the name is not valid
- **AND** the project is still named Original

### Requirement: A project's git remote can be read and set

A project in a git repository SHALL give the URL of its remote, empty when it has none, and setting a URL SHALL replace any URL set before; a project that is not a git repository SHALL give no URL and refuse to set one.

Source: code

#### Scenario: Set a remote

- **GIVEN** a git repository without a remote
- **WHEN** the remote is set to `https://example.com/repo.git`
- **THEN** the project reads that URL

#### Scenario: Not a repository

- **GIVEN** a project that is not a git repository
- **WHEN** a remote is set
- **THEN** it is refused with an error saying the project is not a git repository

### Requirement: Renaming the prefix rewrites everything that carries it

Renaming a project's prefix SHALL change the prefix in the project's configuration, resource names and references, card keys, card metadata, attachment file names and card and resource contents, and SHALL leave a project that validates.

Source: both, jira (INTDEV-719)

#### Scenario: Rename with cards

- **GIVEN** the project old with a parent card and a child card
- **WHEN** the prefix is renamed to new
- **THEN** the cards are keyed new_ and keep their hierarchy
- **AND** validating the project reports no errors

#### Scenario: Attachment named after the prefix

- **GIVEN** a card with the attachment `old.png`
- **WHEN** the prefix is renamed to new
- **THEN** the attachment is named `new.png`

#### Scenario: Reference in content

- **GIVEN** card content that refers to the resource `old/templates/page`
- **WHEN** the prefix is renamed to new
- **THEN** the content refers to `new/templates/page`

### Requirement: A prefix rename needs a different valid prefix

A prefix rename to an empty prefix, an invalid prefix or the project's current prefix SHALL be refused and change nothing.

Source: code

#### Scenario: Same prefix

- **WHEN** the prefix of project old is renamed to old
- **THEN** it is refused with an error saying the prefix is already old

### Requirement: A prefix held by another project cannot be taken

Renaming a project in a directory to a prefix that another project of the directory has, or is being renamed to, SHALL be refused and rename nothing.

Source: code

#### Scenario: Prefix taken

- **GIVEN** a directory with the projects one and two
- **WHEN** one is renamed to two
- **THEN** it is refused as the prefix is taken
- **AND** both projects keep their prefixes

### Requirement: A versioned project is renamed only when forced

Renaming the prefix of a project that has a recorded version SHALL be refused with an error naming the version and the way to force it, unless forced, and a forced rename SHALL keep the project's version and change log.

Source: both

#### Scenario: Refused after publishing

- **GIVEN** the project old has the recorded version 1.2.0
- **WHEN** its prefix is renamed to new
- **THEN** it is refused with an error naming version 1.2.0
- **AND** nothing is moved

#### Scenario: Forced

- **WHEN** the same rename is forced
- **THEN** the cards are keyed new_ and the project still has version 1.2.0

### Requirement: A prefix rename is not a recorded configuration change

A prefix rename SHALL NOT add an entry to the project's configuration change log, as the prefix is the identity of the project.

Source: code

#### Scenario: Log unchanged

- **GIVEN** a project with a configuration change log
- **WHEN** the prefix is renamed
- **THEN** the log has the same entries as before
