# modules/installation Specification

## Purpose

Installing a module brings the resources of another project into this one, read-only, and records where it came from and which versions it may take. This capability covers importing from a hub, a git repository or a local folder, version binding, dependencies, listing and removing modules. Discovering modules is `modules/hubs`; moving an installed module to another version is `modules/updates`. That installed module resources and cards cannot be changed in the importing project is specified in `resources` ("Module resources are read-only", "Cards of installed modules are read-only"); the format version a module must have is in `projects/schema-migration`; the commit an install or removal makes is in `projects/change-tracking`.

## Requirements

### Requirement: A module is installed from a hub name, a git URL or a local folder

Installing a module SHALL accept the name of a module offered by the project's hubs, the URL of a git repository, or the path of a local folder, and SHALL make the module's resources part of the project.

Source: both

#### Scenario: Module installed from a folder

- **GIVEN** a project `test` and a module project `lib` with the workflow `flow`, the card type `page` and the template `tpl`
- **WHEN** the module is installed from its folder
- **THEN** the workflow `lib/workflows/flow` is listed among the project's workflows
- **AND** showing the module `lib` lists `lib/workflows/flow`, `lib/cardTypes/page` and `lib/templates/tpl`

#### Scenario: Module resources are usable

- **GIVEN** the module `lib` is installed with the template `lib/templates/tpl` holding a card titled From lib
- **WHEN** a card is created from `lib/templates/tpl`
- **THEN** the new card is titled From lib

### Requirement: A hub name takes precedence over a path of the same name

When the argument names a module in the cached hub list, installing SHALL use the hub's entry before treating the argument as a path, and SHALL take an argument the cached list lacks as a path.

Source: code

#### Scenario: Name found in the cached list

- **GIVEN** the cached hub list offers `mini` located at the module folder `minimal`
- **WHEN** `mini` is installed
- **THEN** the project declares the module `mini` with that location

#### Scenario: Name not in the list is taken as a path

- **GIVEN** the cached hub list offers only `other`
- **WHEN** `mini` is installed
- **THEN** the installation is refused with an error saying no project can be found at `mini`

### Requirement: A hub module's private flag is used unless overridden

Installing a module from a hub SHALL record the module as private when the hub marks it private, unless the caller states otherwise.

Source: code

#### Scenario: Hub flag taken

- **GIVEN** the cached hub list offers `mini`, marked private
- **WHEN** `mini` is installed
- **THEN** the declaration of `mini` is marked private

#### Scenario: Caller overrides the flag

- **GIVEN** the cached hub list offers `mini`, marked private
- **WHEN** `mini` is installed stating it is not private
- **THEN** the declaration of `mini` is not marked private

### Requirement: A private git module is cloned with the configured credentials

Installing a module from a git repository that requires authentication SHALL use the configured git user and token, and an error about an unreachable source MUST NOT reveal the credentials.

Source: both

#### Scenario: Credentials not leaked

- **GIVEN** a git URL carrying the user `user` and the token `secret` that cannot be reached
- **WHEN** the module is installed
- **THEN** the installation is refused with an error saying the source is unreachable
- **AND** the error text does not contain `secret`

### Requirement: Installing records the source in the project

Installing a module SHALL declare it in the project's modules with its name, its location and whether it is private, and SHALL NOT declare the modules it brings in as dependencies.

Source: both

#### Scenario: Declaration recorded

- **GIVEN** a project `test`
- **WHEN** the module `lib` is installed from a folder
- **THEN** the project declares one module `lib` with that folder as its location, not private

#### Scenario: Only the asked-for module is declared

- **GIVEN** the module `lib` declares a dependency on the module `base`
- **WHEN** `lib` is installed
- **THEN** the project declares only `lib`
- **AND** `base` is installed and listed in the inventory with the parent `lib`

### Requirement: Dependencies are installed with the module

Installing a module SHALL also install the modules it depends on, recursively, and a module depended on more than once SHALL be installed once.

Source: both, jira (INTDEV-866)

#### Scenario: Dependency installed

- **GIVEN** the module `lib` depends on `base`
- **WHEN** `lib` is installed
- **THEN** `base` is installed as well

### Requirement: A dependency on the importing project is not installed

When an installed module depends on the importing project itself, installing SHALL NOT install the project as a module nor change the project's prefix.

Source: code

#### Scenario: Module depending on the host

- **GIVEN** the module `lib` depends on the module `test`, and the project's prefix is `test`
- **WHEN** `lib` is installed
- **THEN** `test` is not installed as a module
- **AND** the project's prefix is still `test`

### Requirement: Installing a module that is already installed takes the source as it is now

Installing a module again from its declared source SHALL declare it once, refresh its content from the source, and drop modules the source no longer depends on.

Source: code

#### Scenario: Refreshed content

- **GIVEN** `lib` is installed and its source then changes its name to renamed lib
- **WHEN** `lib` is installed again from the same folder
- **THEN** the project declares `lib` once
- **AND** showing `lib` gives the name renamed lib

#### Scenario: Dropped dependency

- **GIVEN** `lib` is installed with the dependency `base`, and its source then drops that dependency
- **WHEN** `lib` is installed again
- **THEN** `base` is no longer installed
- **AND** `lib` is still installed

### Requirement: A module cannot be installed from another source than the declared one

Installing a module whose name is already declared with a different source MUST be refused with an error naming the conflicting source, leaving the project unchanged.

Source: both

#### Scenario: Same module, other folder

- **GIVEN** `lib` is installed from one folder
- **WHEN** a copy of `lib` in another folder is installed
- **THEN** the installation is refused with an error saying the source for `lib` conflicts
- **AND** the project is unchanged

### Requirement: Modules referring to one dependency must agree on its source and version

When several installed modules depend on the same module, they SHALL be installed with one source and one version that satisfies all their version constraints; otherwise the installation MUST be refused with the conflicting constraints reported.

Source: docs, jira (INTDEV-1342)

#### Scenario: Different sources for one dependency

- **GIVEN** the modules `a` and `b` both depend on `shared`, from different git URLs
- **WHEN** `a` and `b` are installed
- **THEN** the installation of the second is refused

### Requirement: Installation without a version takes the latest and binds its major version

Installing a module from a git repository that has version tags, without a version, SHALL install the latest version and record a range allowing that major version only; a source without version tags SHALL be installed as it is, with no version recorded.

Source: docs

#### Scenario: Default binding

- **GIVEN** a git module whose latest version is 1.4.2
- **WHEN** it is installed without a version
- **THEN** version 1.4.2 is installed
- **AND** the project records the range `^1.4.2` for it

#### Scenario: Module without version tags

- **GIVEN** a module in a local folder
- **WHEN** it is installed without a version
- **THEN** the module is installed as it is
- **AND** no version is recorded for it

### Requirement: Installation can pin a version or range

Installing with a version expression SHALL record that expression as the module's version binding and install the newest version satisfying it; the expression MAY be an exact version, a caret or tilde range, a comparison range or `*`.

Source: both

#### Scenario: Caret range

- **GIVEN** a git module with the versions 1.0.0, 1.4.0 and 2.0.0
- **WHEN** it is installed with the range `^1.0.0`
- **THEN** version 1.4.0 is installed
- **AND** the project records the range `^1.0.0`

### Requirement: A module without a declared version is treated as bound to 1.x

A module declared without a version SHALL be treated as bound to major version 1, and the next module operation SHALL record that binding.

Source: docs, jira (INTDEV-1376)

#### Scenario: Assumed binding recorded

- **GIVEN** a declared module with version tags 1.0.0 and 2.0.0 and no recorded version
- **WHEN** all modules are updated
- **THEN** the module stays within version 1
- **AND** the project records the range `1.x` for it

### Requirement: Installing a range that needs a downgrade is refused

Installing a module with a range whose newest satisfying version is older than the installed version MUST be refused, leaving the project unchanged.

Source: docs

#### Scenario: Downgrade refused

- **GIVEN** `lib` is installed at 1.4.0
- **WHEN** `lib` is installed with the exact version `1.0.0`
- **THEN** the installation is refused with an error saying a downgrade is not possible
- **AND** `lib` is still at 1.4.0

### Requirement: A module needs a prefix different from the project's

Installing a module without a card key prefix, or with the prefix of the project itself, MUST be refused with an error naming the problem, leaving the project unchanged.

Source: code

#### Scenario: Same prefix as the project

- **GIVEN** a project with the prefix `test`
- **WHEN** a module with the prefix `test` is installed
- **THEN** the installation is refused with an error naming `test`
- **AND** the project is unchanged

### Requirement: A missing source is refused

Installing from a path that does not exist, or from a folder name that is not valid, MUST be refused with an error saying so, leaving the project unchanged.

Source: code

#### Scenario: Path not there

- **GIVEN** a project and no folder `nothing`
- **WHEN** `nothing` is installed
- **THEN** the installation is refused with an error saying no project can be found there
- **AND** the project is unchanged

### Requirement: The install result reports validation problems the module brings

Installing a module SHALL report whether the project has validation errors that it did not have before; a valid module SHALL be reported as bringing none.

Source: code

#### Scenario: Valid module

- **GIVEN** a valid module
- **WHEN** it is installed
- **THEN** the result reports no new validation errors

#### Scenario: Module with an invalid workflow

- **GIVEN** a module containing a workflow with a property its format does not allow
- **WHEN** it is installed
- **THEN** the result reports new validation errors

### Requirement: Installed modules are listed with their versions

Listing modules SHALL return the installed modules by name in alphabetical order with their installed versions, a module without a version having none.

Source: both

#### Scenario: Two modules

- **GIVEN** the modules `zed` without a version and `abc` at 2.1.0 are installed
- **WHEN** the modules are listed
- **THEN** the result is `abc` at 2.1.0, then `zed` without a version

### Requirement: The inventory describes each module's range, parents and kind of source

The module inventory SHALL give for each installed module its name, installed version, declared range, whether it is declared by the project itself, the modules that depend on it, and the kind of its source.

Source: code

#### Scenario: Declared and private modules

- **GIVEN** `lib` installed from a folder with the range `^1.0.0` and `priv` installed as private
- **WHEN** the inventory is read
- **THEN** `lib` is a root with no parents, the range `^1.0.0` and a file source
- **AND** `priv` has a private source

### Requirement: Showing a module lists its resources

Showing a module SHALL list the resources it contributes by type, and showing a module the project does not have MUST be refused with an error saying it does not exist in the project.

Source: both, jira (INTDEV-930)

#### Scenario: Unknown module

- **GIVEN** a project without the module `nothing`
- **WHEN** the module `nothing` is shown
- **THEN** the request is refused with an error saying the module does not exist in the project

### Requirement: Removing a module removes its declaration and files

Removing a module SHALL remove its declaration and its resources from the project.

Source: both

#### Scenario: Module removed

- **GIVEN** `lib` is installed
- **WHEN** `lib` is removed
- **THEN** the project declares no modules
- **AND** the modules list is empty
- **AND** `lib/workflows/flow` is no longer among the project's workflows

### Requirement: Removing a module removes dependencies only it needed

Removing a module SHALL also remove the modules it brought in that no other installed module needs, and SHALL keep those another module needs.

Source: both, jira (INTDEV-897)

#### Scenario: Shared dependency kept

- **GIVEN** `lib` depends on `base` and `shared`, `other` depends on `shared`, and both are installed
- **WHEN** `lib` is removed
- **THEN** `base` is no longer installed
- **AND** `shared` is still installed and `other` is the only declared module

### Requirement: A module that another module needs cannot be removed

Removing a module that an installed module depends on MUST be refused with an error naming the dependent module and saying to remove it first, leaving the project unchanged.

Source: both, jira (INTDEV-1236)

#### Scenario: Dependency removal refused

- **GIVEN** `lib` depends on `base` and `lib` is installed
- **WHEN** `base` is removed
- **THEN** the removal is refused with an error saying `base` is required by `lib`
- **AND** `base` is still installed

### Requirement: Removing an unknown module is refused

Removing a module the project does not have MUST be refused with an error saying it is not part of the project, leaving the project unchanged.

Source: code

#### Scenario: Unknown module

- **GIVEN** a project without the module `nothing`
- **WHEN** `nothing` is removed
- **THEN** the removal is refused with an error saying it is not part of the project
