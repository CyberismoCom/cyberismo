# ui/project-settings Specification

## Purpose

The General page of the configuration editor: the project's own settings, the Modules section (install, change version, check for updates, update, remove) and the Hubs section (add, refresh, remove, install from a hub). What installing, updating and removing modules, and reading hubs, do to the project is specified by `modules/installation`, `modules/updates`, `modules/hubs` and `projects/setup`; who can change the configuration is decided as specified in `rest/auth`. This capability covers only what the page shows and how it is used.

## Requirements

### Requirement: The General page shows the project settings, each saved on its own

The General page SHALL show the project name, card key prefix, category and description as inputs that each show save and cancel buttons only while changed, applying that setting alone.

Source: code

#### Scenario: Changing the project name

- **GIVEN** the General page of project Test Project is open
- **WHEN** the user changes the project name to Renamed project and clicks save
- **THEN** the project name input shows Renamed project
- **AND** the tree header reads Configuration - Renamed project

### Requirement: The General page is read-only for users who cannot change the configuration

For users who cannot change the configuration, the settings inputs SHALL be disabled and the Modules and Hubs sections SHALL offer no change.

Source: code

#### Scenario: General page without configuration rights

- **GIVEN** a user who cannot change the configuration
- **WHEN** the user opens the General page
- **THEN** all settings inputs are disabled
- **AND** Install module, the hub location input and every delete control are disabled

### Requirement: The git remote can be edited only in a git project

The Git remote URL input SHALL be editable only when the project is a git repository, and otherwise SHALL show Not a git repository disabled.

Source: code

#### Scenario: Project without git

- **GIVEN** a project that is not a git repository
- **WHEN** the user opens the General page
- **THEN** the Git remote URL input reads Not a git repository and is disabled

### Requirement: The SSH public key can be copied

In a git project that has an SSH public key for pushing, the General page SHALL show the key read-only with a Copy control whose tooltip changes to Copied! after copying.

Source: code

#### Scenario: Copying the key

- **GIVEN** a git project with an SSH public key
- **WHEN** the user clicks Copy beside SSH public key
- **THEN** the key is on the clipboard
- **AND** the tooltip reads Copied!

### Requirement: The Modules section lists installed modules with their versions

The Modules section SHALL list each installed module as a card with its name, card key prefix, installed version, declared version range and, when the range is assumed, the assumed range, or say that no modules are installed.

Source: code

#### Scenario: No modules

- **GIVEN** a project that imports no modules
- **WHEN** the user opens the General page
- **THEN** the Modules section says there are no modules

#### Scenario: Installed module

- **GIVEN** the project imports module base at version 1.2.0 declared as ^1.0.0
- **WHEN** the user opens the General page
- **THEN** a card shows base, card key prefix, Installed: 1.2.0 and Range: ^1.0.0

### Requirement: A module pulled in by another module is not managed directly

A module that is installed only because another module needs it SHALL show Managed by naming those modules and offer no update, change version or delete, since `modules/installation` refuses to remove it.

Source: code

#### Scenario: Transitive module

- **GIVEN** module core is installed only because module base needs it
- **WHEN** the user opens the General page
- **THEN** the core card reads Managed by base
- **AND** the core card has no action buttons

### Requirement: Install module opens a dialog that lists versions of a source

Install module SHALL open a dialog asking for a module URL, with List versions fetching the versions of that source, a Version choice defaulting to the newest stable version, and an Install button enabled only once the listing has settled.

Source: code, jira (INTDEV-1230)

#### Scenario: Listing versions

- **GIVEN** the install dialog is open
- **WHEN** the user enters `https://github.com/example/mod.git` and clicks List versions
- **THEN** a Version choice lists the available versions, newest first, with the newest stable one selected

#### Scenario: Changing the URL invalidates the listing

- **GIVEN** versions of one source are listed
- **WHEN** the user edits the module URL
- **THEN** the Version choice is hidden and Install is disabled until the versions are listed again

### Requirement: A version binding is chosen with the version

After versions are listed the dialog SHALL offer three bindings, compatible updates, patch updates only and pinned, state the range it will declare and the version it will install, and use that range when installing.

Source: code

#### Scenario: Pinning a version

- **GIVEN** versions are listed and 1.2.0 is selected
- **WHEN** the user selects the binding Pin to this version
- **THEN** the dialog states Declares 1.2.0; installs 1.2.0, the newest matching version

### Requirement: A source with credentials is refused

When the entered module URL contains a user name or password, which `rest/project` refuses, the dialog SHALL say so before anything is sent and disable listing and installing.

Source: code

#### Scenario: URL with credentials

- **GIVEN** the install dialog is open
- **WHEN** the user enters `https://user:secret@example.com/mod.git`
- **THEN** a message says sources with credentials are not accepted
- **AND** List versions is disabled

### Requirement: Listing failures and empty listings are shown in the dialog

The dialog SHALL show an error with a Retry control when the versions cannot be listed, and a warning when the source has no version tags saying the module will be installed without a version range.

Source: code

#### Scenario: Listing fails

- **GIVEN** the source cannot be reached
- **WHEN** the user clicks List versions
- **THEN** an error says versions could not be listed, with the reason and a Retry button

#### Scenario: Repository without tags

- **GIVEN** a source with no version tags
- **WHEN** the user lists its versions
- **THEN** a warning says it will be installed without a version range
- **AND** Install is enabled

### Requirement: Installing reports its outcome and closes the dialog

Install SHALL show progress, and on success close the dialog and report Module installed successfully; on failure it SHALL show the error and keep the dialog open, and the dialog cannot be closed while installing.

Source: code

#### Scenario: Successful install

- **GIVEN** versions are listed and 1.2.0 is selected
- **WHEN** the user clicks Install
- **THEN** the dialog closes
- **AND** a notice says Module installed successfully and the module card appears

### Requirement: Change version re-declares a module installed from git

A root module installed from a public git source SHALL offer Change version, opening a dialog titled with the module name that lists only versions at or above the installed one, since `modules/updates` never downgrades, and says so.

Source: code

#### Scenario: Changing version

- **GIVEN** module base is installed at 1.2.0
- **WHEN** the user clicks Change version of base
- **THEN** the dialog lists only versions from 1.2.0 up
- **AND** it says a module is never downgraded

#### Scenario: No newer versions

- **GIVEN** no version at or above 1.2.0 is available
- **WHEN** the dialog has listed versions
- **THEN** it says no versions at or above the installed one are available

### Requirement: Updating applies to one module or to all

Each directly managed module SHALL have an Update button and the section an Update all modules button, which is shown whenever modules are installed; Update all modules reports All modules updated successfully, and failures are shown as error notices.

Source: code

#### Scenario: Update all

- **GIVEN** two modules are installed
- **WHEN** the user clicks Update all modules
- **THEN** a notice says All modules updated successfully

#### Scenario: Update refused

- **GIVEN** updating base fails
- **WHEN** the user clicks Update on base
- **THEN** an error notice with the reason is shown

### Requirement: Module updates may leave unused field values to remove

After installing, changing the version of or updating modules the app SHALL offer to remove field values left unused as specified in `ui/configuration`.

Source: code

#### Scenario: Offer after update

- **GIVEN** an update leaves a card holding a value its card type no longer declares
- **WHEN** the update completes
- **THEN** a dialog offers to remove the dormant field values

### Requirement: Check for updates shows what would change without changing anything

Check for updates, offered to users who can change the configuration when a directly managed module is installed, SHALL show per module the latest compatible version with an Up to date mark when nothing would change, and the latest available version with a mark that it is newer than the declared range allows when the newest release is outside the range.

Source: code

#### Scenario: Module with an update available

- **GIVEN** base is at 1.2.0 declared ^1.0.0, the newest compatible is 1.4.0 and the newest release is 2.0.0
- **WHEN** the user clicks Check for updates
- **THEN** the base card shows Latest compatible: 1.4.0 and Latest available: 2.0.0
- **AND** the latest available line is marked as newer than the declared range allows

#### Scenario: Module already current

- **GIVEN** base is at its newest compatible version
- **WHEN** the user clicks Check for updates
- **THEN** the base card shows an Up to date mark

#### Scenario: Not offered without configuration rights

- **GIVEN** a user who cannot change the configuration
- **WHEN** the user opens the General page
- **THEN** there is no Check for updates button and no source is contacted

### Requirement: A blocked or failed check is explained

When the check finds updates blocked by conflicts the section SHALL say updates are blocked and name each conflicting module with its reason instead of versions, and when the check cannot run it SHALL say it could not check for updates with the reason.

Source: code

#### Scenario: Blocked updates

- **GIVEN** updating base conflicts with module core
- **WHEN** the user clicks Check for updates
- **THEN** a warning says updates are blocked by conflicts and names core with its reason
- **AND** no latest versions are shown on the cards

### Requirement: A check result applies only to the modules it was made for

Check results SHALL be dropped from the cards when the set of installed modules, their versions or their ranges change after the check.

Source: code

#### Scenario: Result discarded after an update

- **GIVEN** a check result is shown
- **WHEN** the user updates base
- **THEN** the latest-version lines of the cards disappear until the next check

### Requirement: Module changes wait while a check runs

While a check for updates runs, Install module, Update, Change version and Delete SHALL be disabled.

Source: code

#### Scenario: Update disabled during a check

- **GIVEN** a check is in progress
- **WHEN** the user looks at the Update button of base
- **THEN** it is disabled

### Requirement: Removing a module requires acknowledging that its resources go

Delete on a directly managed module SHALL open a confirmation naming the module that keeps the Delete button disabled until the user ticks an acknowledgement that removing it deletes all resources it provides; success reports that the module was removed.

Source: code

#### Scenario: Removing a module

- **GIVEN** module base is installed
- **WHEN** the user clicks Delete on base, ticks the acknowledgement and clicks Delete
- **THEN** a notice says module base was removed successfully
- **AND** its card is gone

#### Scenario: Not acknowledged

- **GIVEN** the removal dialog is open
- **WHEN** the acknowledgement is not ticked
- **THEN** Delete is disabled

### Requirement: The Hubs section says when there are no hubs

A project without hubs SHALL show a message saying there are none and offer no Update hubs button.

Source: code

#### Scenario: No hubs

- **GIVEN** a project without hubs
- **WHEN** the user opens the General page
- **THEN** the Hubs section says there are no hubs
- **AND** there is no Update hubs button

### Requirement: A hub is added by its location

The Hubs section SHALL add a hub from a location typed in its input, with the add button or Enter, only when the location is not empty, report Hub added successfully and list the hub with its display name, location and the modules it offers.

Source: code, jira (INTDEV-1231, INTDEV-1076)

#### Scenario: Adding a hub

- **GIVEN** the hub location input is empty
- **WHEN** the user enters `http://hub.example/` and clicks the add button
- **THEN** a notice says Hub added successfully
- **AND** a hub card titled with the hub's display name shows each of its modules with its card key prefix

#### Scenario: Empty location

- **GIVEN** the hub location input is empty
- **WHEN** the user looks at the add button
- **THEN** it is disabled

### Requirement: A hub that cannot be read is reported but still listed

When a hub cannot be read while adding or refreshing, the app SHALL name the hubs that could not be read in an error notice, say that the other hubs were updated and keep the hub listed with a message that no modules are available from it, as `modules/hubs` keeps an unreachable hub.

Source: code

#### Scenario: Unreachable hub

- **GIVEN** nothing listens at `http://127.0.0.1:1/`
- **WHEN** the user adds it as a hub
- **THEN** an error notice says it could not be read and other hubs were updated
- **AND** its card says no modules are available from this hub

### Requirement: All hubs are refreshed together

When at least one hub is listed the section SHALL offer one Update hubs button for all hubs, reporting Hubs updated successfully when every hub could be read.

Source: code

#### Scenario: Refreshing hubs

- **GIVEN** one reachable hub is listed
- **WHEN** the user clicks Update hubs
- **THEN** a notice says Hubs updated successfully

### Requirement: A hub is removed after confirmation

Delete on a hub SHALL ask for confirmation naming the hub and, once confirmed, report its removal and remove its card; with no hubs left the empty message returns.

Source: code, jira (INTDEV-1231)

#### Scenario: Removing the last hub

- **GIVEN** one hub card titled Local test hub
- **WHEN** the user clicks Delete on it and confirms
- **THEN** a notice says hub Local test hub was removed successfully
- **AND** the Hubs section says there are no hubs

### Requirement: A hub module is installed from its card

Each module a hub offers SHALL show an Install control that opens the install dialog titled with the module and with its location filled in and locked, or a mark that the module is already imported when it is.

Source: code

#### Scenario: Installing from a hub

- **GIVEN** hub card lists module Base test module not yet imported
- **WHEN** the user clicks Install Base test module
- **THEN** an install dialog titled Install Base test module opens with the module URL read-only

#### Scenario: Already imported module

- **GIVEN** the hub lists a module that is already installed
- **WHEN** the user looks at its tile
- **THEN** a check mark with the tooltip Module is already imported to the project replaces the install control
