# ui/configuration Specification

## Purpose

The configuration editor shell in the Cyberismo app: the resource tree, the overview page of each resource type, the forms that create resources, deletion, the text editor for file resources, and the prompts around unsaved changes and dormant field values. What each resource is and which edits the project accepts is specified by `resources` and the per-type domain capabilities (`card-types`, `fields/field-types`, `workflows`, `templates`, `links`); the structured editors are in `ui/configuration-editors` and the general settings page in `ui/project-settings`. Who can change the configuration is decided as specified in `rest/auth`.

## Requirements

### Requirement: The configuration editor opens at the configuration address of the project

Setting the path part of a project's address to `/configuration` SHALL open the configuration editor, showing the resource tree on the left and an editor panel on the right.

Source: docs

#### Scenario: Opening the configuration editor by address

- **GIVEN** a project with prefix `test`
- **WHEN** the user opens `/configuration` in the app
- **THEN** the address becomes `/projects/test/configuration`
- **AND** a tree of resource types is shown on the left with an empty editor panel on the right

### Requirement: The resource tree offers a way back to the cards

The configuration tree SHALL be titled with the project name and offer a back control that returns to the project's card view.

Source: code, jira (INTDEV-1323)

#### Scenario: Going back to the cards

- **GIVEN** the configuration editor of project Test Project is open
- **WHEN** the user clicks the back control in the tree header
- **THEN** the tree title read Configuration - Test Project before the click
- **AND** the card view of the project is shown

### Requirement: Selecting a resource type opens its overview

Selecting a resource type in the tree SHALL open the overview page of that type, headed with the type's name.

Source: docs, jira (INTDEV-977)

#### Scenario: Opening the workflows overview

- **GIVEN** the configuration editor is open
- **WHEN** the user selects Workflows in the tree
- **THEN** the address ends in `/configuration/workflows`
- **AND** the page heading names the workflows type

### Requirement: Selecting a module under a type filters the overview to that module

Selecting a module beneath a resource type in the tree SHALL open the overview of that type with only that module's section shown.

Source: code

#### Scenario: Opening only the base module's card types

- **GIVEN** the Card Types branch of the tree is expanded
- **WHEN** the user selects the module base beneath it
- **THEN** the card types overview shows only the section of module base
- **AND** the address carries the module filter

### Requirement: Selecting a resource opens its editor

Selecting a resource in the tree SHALL open the editor for that resource, and an unknown resource address SHALL show a not-found message instead of an editor.

Source: code

#### Scenario: Opening a workflow editor

- **GIVEN** the project has workflow `test/workflows/flow`
- **WHEN** the user selects it in the tree
- **THEN** the editor opens headed with `test/workflows/flow`
- **AND** the breadcrumbs read Configuration > test > workflows > flow

#### Scenario: Unknown resource address

- **WHEN** the user opens `/configuration/test/workflows/ghost`
- **THEN** a message says that resource `test/workflows/ghost` was not found

### Requirement: The overview groups resources by module with the local project first

The overview SHALL list one section per module that provides resources of the type, with the local project's section first and titled Local project.

Source: code

#### Scenario: Local project listed before modules

- **GIVEN** a project that imports module base
- **WHEN** the user opens the Card Types overview
- **THEN** the first section is titled Local project
- **AND** a section titled base follows

### Requirement: Overview cards show the display name and description in alphabetical order

Each resource in a section SHALL appear as a card showing its display name, or its identifier when it has none, and its description, sorted alphabetically by that title; selecting the card opens its editor.

Source: code

#### Scenario: Display name falls back to the identifier

- **GIVEN** a workflow `test/workflows/flow` without a display name
- **WHEN** the user opens the Workflows overview
- **THEN** a card titled flow is shown

### Requirement: Imported module sections show one row until expanded

A section of an imported module with more resources than fit in one row SHALL show only the first row and a View more control that reveals the rest; the local project section SHALL always show all its resources.

Source: code

#### Scenario: Expanding a module section

- **GIVEN** module base provides more card types than fit in one row
- **WHEN** the user opens the Card Types overview and clicks View more on the base section
- **THEN** every card type of base is shown

### Requirement: The overview can be filtered by module

The overview SHALL offer a checkbox per module and a Clear Filters control; with one or more modules checked only their sections are shown, expanded in full, and Clear Filters is disabled when none is checked.

Source: code

#### Scenario: Filtering to one module

- **GIVEN** the Card Types overview lists the local project and module base
- **WHEN** the user checks base
- **THEN** only the base section is shown, with all its card types
- **AND** Clear Filters is enabled

#### Scenario: Clearing the filter

- **GIVEN** base is checked
- **WHEN** the user clicks Clear Filters
- **THEN** all sections are shown again
- **AND** Clear Filters is disabled

### Requirement: The module filter is kept in the address

The checked modules SHALL be reflected in the address, so that reloading or sharing the address shows the same filtered overview.

Source: code

#### Scenario: Reloading a filtered overview

- **GIVEN** the user has checked base on the Card Types overview
- **WHEN** the user reloads the page
- **THEN** base is still checked and only its section is shown

### Requirement: Users who can change the configuration see a create card in the local project section

The local project section of an overview SHALL begin with a Create New card for that resource type only for users who can change the configuration.

Source: docs, jira (INTDEV-977)

#### Scenario: Create card for a user who can change the configuration

- **GIVEN** a user who can change the configuration
- **WHEN** the user opens the Workflows overview
- **THEN** a Create New Workflow card is the first card of the Local project section

#### Scenario: No create card without configuration rights

- **GIVEN** a user who cannot change the configuration
- **WHEN** the user opens the Workflows overview
- **THEN** no Create New card is shown

### Requirement: Creating a resource asks for an identifier

The create form of every resource type SHALL require an identifier and refuse to submit without one, showing that the identifier is required.

Source: docs

#### Scenario: Submitting without an identifier

- **GIVEN** the create form for a workflow is open
- **WHEN** the user submits it with an empty identifier
- **THEN** a message says that the identifier is required
- **AND** no workflow is created

### Requirement: Creating a field type asks for its data type

The create form for a field type SHALL ask for a data type in addition to the identifier.

Source: docs

#### Scenario: Field type form

- **GIVEN** the user clicks Create New Field Type
- **WHEN** the form opens
- **THEN** it has an identifier input and a data type choice

### Requirement: Creating a card type asks for its workflow

The create form for a card type SHALL ask for a workflow chosen from the workflows that exist; when none exists it SHALL say that a workflow must be created first.

Source: both

#### Scenario: No workflow to choose

- **GIVEN** a project with no workflows
- **WHEN** the user opens the create form for a card type
- **THEN** the form says no workflows are available and a workflow must be created first

### Requirement: A created resource opens in its editor

After a resource is created the app SHALL report success and open the new resource in its editor, and a refused creation SHALL be shown as an error notice.

Source: both

#### Scenario: Creating a workflow

- **GIVEN** the create form for a workflow is open
- **WHEN** the user enters identifier `review` and confirms
- **THEN** a success notice says the workflow was created
- **AND** the editor for `test/workflows/review` is open

#### Scenario: Creation refused

- **GIVEN** workflow `test/workflows/review` exists and its create form is open
- **WHEN** the user enters identifier `review` and confirms
- **THEN** an error notice with the refusal is shown

### Requirement: Resources of imported modules are read-only

The editor SHALL show the resources of installed modules, which `resources` makes read-only, with no update, cancel or delete controls and with every input disabled.

Source: both

#### Scenario: Opening a module's workflow

- **GIVEN** the project imports module base
- **WHEN** the user opens a workflow of base in the editor
- **THEN** all its inputs are disabled
- **AND** the toolbar offers no delete in its context menu

### Requirement: Editing controls are offered only to users who can change the configuration

The editors SHALL be read-only for users who cannot change the configuration: inputs are disabled and no update, add, delete or create control is offered.

Source: code

#### Scenario: Read-only card type editor

- **GIVEN** a user who cannot change the configuration
- **WHEN** the user opens card type `test/cardTypes/page`
- **THEN** every input is disabled
- **AND** no save, add or delete control is shown

### Requirement: Metadata fields of a resource are saved one at a time

Each metadata input of a resource editor SHALL show save and cancel buttons only while its value differs from the saved one; saving applies that field alone and cancelling restores the saved value, and Enter and Escape do the same.

Source: both

#### Scenario: Changing a display name

- **GIVEN** workflow `test/workflows/flow` is open with display name Flow
- **WHEN** the user changes the display name to Review flow
- **THEN** save and cancel buttons appear next to that input only

#### Scenario: Cancelling with Escape

- **GIVEN** the display name input holds the unsaved value Review flow
- **WHEN** the user presses Escape
- **THEN** the input shows Flow again
- **AND** the save and cancel buttons disappear

### Requirement: Validation errors of a resource are listed in its editor

When the project reports validation errors for the open resource, the editor SHALL list them in an expanded panel marked invalid.

Source: code

#### Scenario: Invalid resource

- **GIVEN** a resource for which validation reports an error
- **WHEN** the user opens it in the editor
- **THEN** an expanded panel lists that error under the heading for validation errors

### Requirement: Deleting a resource asks for confirmation and leaves the editor

Choosing Delete Resource in the toolbar's context menu SHALL ask for confirmation naming the resource; confirming deletes it, reports success and returns to the configuration root, and a refused deletion SHALL show the error and keep the editor open.

Source: both

#### Scenario: Deleting a workflow

- **GIVEN** the editor for `test/workflows/review` is open
- **WHEN** the user opens the context menu, chooses Delete Resource and confirms
- **THEN** a success notice names `test/workflows/review`
- **AND** the editor panel is empty and the resource is gone from the tree

#### Scenario: Deletion refused

- **GIVEN** the confirmation for deleting a workflow is open
- **WHEN** the project refuses the deletion
- **THEN** an error notice with the refusal is shown
- **AND** the editor remains open

### Requirement: File resources are edited as text

Resources that consist of files, such as a calculation's logic program, a report's templates or a skill's instructions, SHALL open in a text editor with Update and Cancel in the toolbar; Update stays disabled until the text differs from the saved text.

Source: both

#### Scenario: Saving a file

- **GIVEN** a calculation file is open in the text editor
- **WHEN** the user changes the text and clicks Update
- **THEN** a notice says the file was saved
- **AND** Update is disabled again

#### Scenario: Cancelling a file edit

- **GIVEN** the text has been changed but not saved
- **WHEN** the user clicks Cancel
- **THEN** the saved text is shown again

### Requirement: A save made elsewhere updates the open text without losing typing

When the open file is saved from elsewhere, the text editor SHALL show the new saved text unless the user has unsaved typing, which SHALL be kept and still shown as changed.

Source: code, jira (INTDEV-1368)

#### Scenario: Untouched text follows the new save

- **GIVEN** a file is open with no unsaved typing
- **WHEN** another writer saves different content to it
- **THEN** the editor shows the new content and Update stays disabled

#### Scenario: Typing is kept

- **GIVEN** the user has typed unsaved text in the open file
- **WHEN** another writer saves different content to it
- **THEN** the typed text remains and Update is enabled

### Requirement: Leaving unsaved edits asks for confirmation

Navigating away from the text editor or the template card editor with unsaved changes, or closing or reloading the tab, SHALL ask the user to confirm; declining stays on the page with the changes intact.

Source: code

#### Scenario: Navigating away with unsaved text

- **GIVEN** a file is open with unsaved changes
- **WHEN** the user selects another resource in the tree
- **THEN** a prompt warns of unsaved changes
- **AND** declining keeps the file open with the changes

### Requirement: Removing field values left unused is offered after edits that strand them

After the configuration changes that leave stored field values unused (deleting a field type, removing or making a custom field calculated, disabling an override, installing or updating modules), the app SHALL scan the project and, when unused values are found, offer to remove them stating how many values and cards are affected; nothing is offered when none are found or when the scan fails, and what counts as unused is defined in `fields/field-values`.

Source: code

#### Scenario: Offer after deleting a field type

- **GIVEN** cards store a value for field type `test/fieldTypes/risk`
- **WHEN** the user deletes that field type
- **THEN** a dialog offers to remove the dormant field values, stating the number of values and cards

#### Scenario: Nothing found

- **GIVEN** no card stores a value its card type no longer declares
- **WHEN** the user deletes a card type field
- **THEN** no dialog is shown

### Requirement: The removal offer reports its outcome

Confirming the offer SHALL remove the values and report success, or report a warning stating how many cards could not be updated, or an error; declining or a project switch SHALL drop the offer, and confirming again while the removal runs has no effect.

Source: code

#### Scenario: Confirming the removal

- **GIVEN** the dormant values dialog is open
- **WHEN** the user clicks Remove
- **THEN** a notice says the dormant field values were removed
- **AND** the dialog closes

#### Scenario: Some cards cannot be updated

- **GIVEN** the dialog is open and one card cannot be updated
- **WHEN** the user clicks Remove
- **THEN** a warning says 1 card could not be updated

### Requirement: A template card can be dragged within the template tree

Dragging a template card in the configuration tree SHALL move it to the drop position, and a drop that is not allowed, or into an imported module, SHALL be refused with an error notice and no change.

Source: code, jira (INTDEV-1250)

#### Scenario: Dropping into an imported module

- **GIVEN** a template card of the local project in the tree
- **WHEN** the user drops it onto a template of module base
- **THEN** an error notice says cards in imported modules cannot be moved
- **AND** the tree is unchanged
