# ui/configuration-editors Specification

## Purpose

The structured editors of the configuration editor: workflow states, transitions and diagram, card type custom fields, field type enum values, link type settings, skill related tools and instruction preview, and the template card editor. What the project accepts for each edit, and what it does to existing cards, is specified by `workflows`, `card-types`, `fields/field-types`, `links`, `skills` and `templates`; the shell around the editors is `ui/configuration`. Who can change the configuration is decided as specified in `rest/auth`.

## Requirements

### Requirement: A workflow editor lists states and transitions in separate sections

The workflow editor SHALL show a States section and a Transitions section, and a Transitions section without transitions SHALL say that none are defined.

Source: docs

#### Scenario: Workflow without transitions

- **GIVEN** a workflow with states Open and Done and no transitions
- **WHEN** the user opens it in the editor
- **THEN** both states are listed in the States section
- **AND** the Transitions section says no transitions are defined

### Requirement: A state is added with a name and a category

The add-state form SHALL take a name and a category (Active by default; the categories are those of `workflows`) and enable Add state only for a valid name; adding reports State added and clears the form.

Source: both

#### Scenario: Adding a state

- **GIVEN** workflow `test/workflows/flow` is open
- **WHEN** the user enters name Review, keeps category Active and clicks Add state
- **THEN** a notice says State added
- **AND** state Review appears in the States list and the name input is empty

### Requirement: The state forms check the name before submitting

The state forms SHALL refuse an empty name and a name that `workflows` does not allow because another state has it, showing the reason beside the input and keeping the submit control disabled.

Source: code

#### Scenario: Duplicate state name

- **GIVEN** workflow with state Open
- **WHEN** the user enters Open in the add-state form
- **THEN** a message says a state with this name already exists
- **AND** Add state is disabled

### Requirement: A state is edited inline

Clicking a state SHALL open it for inline editing of its name and category; saving reports State updated, and saving with no change just closes the editor.

Source: both

#### Scenario: Renaming a state

- **GIVEN** workflow with state Review
- **WHEN** the user opens Review, changes its name to Approval and saves
- **THEN** a notice says State updated
- **AND** the States list shows Approval

### Requirement: States are reordered with up and down buttons

Each state row SHALL have move up and move down buttons, disabled at the first and last position, that change the order in the list.

Source: both

#### Scenario: Moving a state up

- **GIVEN** states listed as Open, Review, Done
- **WHEN** the user clicks move up on Review
- **THEN** the list reads Review, Open, Done

### Requirement: Deleting a state asks for a replacement state

Deleting a state SHALL open a confirmation that requires choosing a replacement state before the deletion can be confirmed; the effect on cards and transitions is specified by `workflows`.

Source: both

#### Scenario: Deleting a state

- **GIVEN** workflow with states Open, Review, Done
- **WHEN** the user clicks delete on Review, chooses Open as the state to move cards and transitions to, and confirms
- **THEN** a notice says State deleted
- **AND** Review is gone from the States list

#### Scenario: No replacement chosen

- **GIVEN** the deletion confirmation for Review is open
- **WHEN** no replacement state is chosen
- **THEN** the confirm control cannot be used

### Requirement: A transition is added with a name, source states and a target state

The add-transition form SHALL take a name, a target state and one or more source states, where the special choices Any state and New card are offered alongside the workflow's states; a source choice of Any state excludes the others, and choosing a state clears New card.

Source: both

#### Scenario: Adding a transition from any state

- **GIVEN** workflow with states Open and Done
- **WHEN** the user adds a transition named Close with source Any state and target Done
- **THEN** a notice says Transition added
- **AND** the Transitions list shows Close from Any state to Done

### Requirement: The transition forms check the name before submitting

The transition forms SHALL refuse an empty name and a name that `workflows` does not allow because another transition has it, showing the reason beside the input.

Source: code

#### Scenario: Duplicate transition name

- **GIVEN** workflow with transition Close
- **WHEN** the user enters Close as the name of a new transition
- **THEN** a message says a transition with this name already exists

### Requirement: A transition is edited, reordered and deleted in its row

Each transition row SHALL support inline editing, move up and move down, and deletion after confirmation, reporting Transition updated or Transition deleted.

Source: both

#### Scenario: Deleting a transition

- **GIVEN** workflow with transition Close
- **WHEN** the user clicks delete on Close and confirms
- **THEN** a notice says Transition deleted
- **AND** the Transitions list no longer shows Close

### Requirement: An editor rejection is reported and leaves the list unchanged

When the project refuses an edit made in a list editor, the editor SHALL show an error notice with the refusal and keep the list as it was.

Source: code

#### Scenario: Refused state change

- **GIVEN** the project refuses removing state Open
- **WHEN** the user confirms deleting Open with a replacement
- **THEN** an error notice with the refusal is shown
- **AND** Open is still listed

### Requirement: Only one row of a list is edited at a time

While one state, transition or new transition is being edited, the other rows and the add forms SHALL be disabled, and Escape SHALL cancel the edit in progress.

Source: code

#### Scenario: Editing locks the other rows

- **GIVEN** the user has opened state Review for editing
- **WHEN** the user looks at the add-state form and the other state rows
- **THEN** they are disabled
- **AND** pressing Escape closes the edit and enables them again

### Requirement: A workflow editor shows the workflow diagram

The workflow editor SHALL show a diagram of the workflow's states and transitions that opens in a larger viewer when activated, and a message that the diagram could not be rendered when it fails.

Source: code, jira (INTDEV-1179)

#### Scenario: Diagram of a workflow

- **GIVEN** workflow `test/workflows/flow` is open
- **WHEN** the editor has loaded
- **THEN** a Diagram section shows a state-machine image
- **AND** activating it opens a larger view

#### Scenario: Diagram cannot be rendered

- **GIVEN** the diagram cannot be produced
- **WHEN** the editor has loaded
- **THEN** the Diagram section says the workflow diagram failed to render

### Requirement: A card type editor lists custom fields by visibility

The card type editor SHALL list the custom fields in three groups, Always visible fields, Optionally visible fields and Not visible, with a message when the card type has none.

Source: both

#### Scenario: Card type without custom fields

- **GIVEN** card type `test/cardTypes/page` has no custom fields
- **WHEN** the user opens it in the editor
- **THEN** the editor says there are no custom fields yet

### Requirement: A custom field is added from the existing field types

The add form SHALL take a visibility group, a field type chosen from the project's field types, an optional display name and a calculated flag, with an override flag offered only while the field is calculated; Add reports Custom field added.

Source: both

#### Scenario: Adding a field

- **GIVEN** field type `test/fieldTypes/owner` exists
- **WHEN** the user picks Always visible, field type owner, display name Owner and clicks Add
- **THEN** a notice says Custom field added
- **AND** Owner appears in the Always visible fields group

#### Scenario: Override only for a calculated field

- **GIVEN** the add form is open and Is calculated is unchecked
- **WHEN** the user looks at the override option
- **THEN** it is disabled

### Requirement: A custom field is edited in its row

Opening a custom field SHALL allow changing its display name and its calculated and override flags, showing the field type read-only; saving reports Custom field updated.

Source: both, jira (INTDEV-1276)

#### Scenario: Renaming a field label

- **GIVEN** custom field Owner on card type page
- **WHEN** the user changes its display name to Responsible and saves
- **THEN** a notice says Custom field updated
- **AND** the row shows Responsible

### Requirement: A custom field is moved between visibility groups and within one

Each field row SHALL have buttons to move it to a higher or lower visibility group and up or down inside its group.

Source: both

#### Scenario: Making a field optional

- **GIVEN** field Owner in Always visible fields
- **WHEN** the user clicks move to lower visibility
- **THEN** Owner is shown in Optionally visible fields

### Requirement: Removing a custom field asks for confirmation

Removing a custom field SHALL ask for confirmation naming the field, then report Custom field deleted and, when unused values remain, offer removal as specified in `ui/configuration`.

Source: both

#### Scenario: Removing a field

- **GIVEN** field Owner on card type page
- **WHEN** the user clicks delete on Owner and confirms
- **THEN** a notice says Custom field deleted
- **AND** Owner is no longer listed

### Requirement: Field types of enum and list kind have an enum values editor

The field type editor SHALL show an Enum values section only when the data type is enum or list, with a message when there are none yet.

Source: both

#### Scenario: Enum field type

- **GIVEN** field type `test/fieldTypes/severity` with data type enum and no values
- **WHEN** the user opens it in the editor
- **THEN** an Enum values section says there are no enum values yet

#### Scenario: Text field type

- **GIVEN** field type `test/fieldTypes/note` with data type shortText
- **WHEN** the user opens it in the editor
- **THEN** no Enum values section is shown

### Requirement: An enum value is added with a value, display value and description

The add form SHALL take a value, a display value and a description, SHALL refuse before submitting a value that `fields/field-types` would refuse as a duplicate, and adding reports Enum value added.

Source: both

#### Scenario: Adding a value

- **GIVEN** enum field type severity
- **WHEN** the user enters value high with display value High and clicks Add
- **THEN** a notice says Enum value added
- **AND** High appears in the list

#### Scenario: Value already present

- **GIVEN** value high exists
- **WHEN** the user enters high again
- **THEN** a message says this value already exists

### Requirement: Enum values are edited, reordered and deleted in their rows

Each enum value row SHALL support inline editing, move up and down, and deletion after confirmation.

Source: both

#### Scenario: Reordering values

- **GIVEN** values low, medium, high
- **WHEN** the user clicks move up on high
- **THEN** the list reads low, high, medium

### Requirement: A link type editor offers its display names, description switch and card types

The link type editor SHALL offer inputs for the outbound and inbound display names, a switch for link descriptions and multi-selections of source and destination card types, each saved like the other metadata fields.

Source: docs, jira (INTDEV-1170)

#### Scenario: Choosing source card types

- **GIVEN** link type `test/linkTypes/mitigates` is open
- **WHEN** the user selects card type `test/cardTypes/control` as a source card type and saves
- **THEN** the selection shows control and the save buttons disappear

### Requirement: Related tools of a skill are listed, added, renamed and removed

The skill editor SHALL list a skill's related tools with a message when there are none, add a tool entered by name, rename a tool in its row and remove one after confirmation, each applied immediately.

Source: both

#### Scenario: Adding a tool

- **GIVEN** skill `test/skills/review` lists no tools
- **WHEN** the user enters get_card and clicks Add
- **THEN** a notice says the related tool was added
- **AND** get_card is listed

### Requirement: The related tools editor checks for duplicates before submitting

The editor SHALL refuse, before submitting, to add or rename a tool to a name that is already listed (which `skills` also refuses), saying that the tool is already listed.

Source: both

#### Scenario: Duplicate tool

- **GIVEN** skill lists get_card
- **WHEN** the user enters get_card in the add input
- **THEN** a message says this tool is already listed
- **AND** Add is disabled

### Requirement: Skill instructions can be previewed as rendered

The text editor for a skill's instructions SHALL offer a Preview toggle for users who can change the configuration that shows the rendered instructions from the current unsaved text, an optional card key to preview a card-specific skill, a message when the rendering is empty and the error when rendering fails; no toggle is offered on other files.

Source: both, jira (INTDEV-1337)

#### Scenario: Previewing unsaved instructions

- **GIVEN** the instructions of a skill are open with unsaved edits
- **WHEN** the user clicks Preview
- **THEN** the rendered result of the edited text is shown
- **AND** clicking Edit returns to the unsaved text

#### Scenario: Preview with a card key

- **GIVEN** Preview is shown for a skill enabled per card
- **WHEN** the user enters card key `test_abc123` in Card key (optional) and leaves the field
- **THEN** the instructions are rendered in the context of that card

#### Scenario: Other files have no preview

- **GIVEN** the query file of a skill is open
- **WHEN** the editor has loaded
- **THEN** no Preview toggle is shown

### Requirement: A template card opens in an edit-first card editor

Selecting a template card in the configuration tree SHALL open an editor with the title, metadata fields and AsciiDoc content open for editing, each metadata field saved independently, as for a regular card in `ui/card-editor`.

Source: both, jira (INTDEV-981, INTDEV-1312)

#### Scenario: Editing a field of a template card

- **GIVEN** template card with a custom field Owner is open
- **WHEN** the user changes Owner and presses Enter
- **THEN** the new value is saved
- **AND** the save controls for that field disappear

#### Scenario: Cancelling a field edit

- **GIVEN** Owner holds an unsaved change
- **WHEN** the user presses Escape
- **THEN** Owner shows its saved value

### Requirement: A template card can be previewed with unsaved changes

The template card editor SHALL offer a Preview toggle that shows the card as rendered with the current unsaved title, fields and content.

Source: code

#### Scenario: Preview of a draft title

- **GIVEN** the user typed title Draft title without saving
- **WHEN** the user clicks Preview
- **THEN** the preview heading reads Draft title

### Requirement: Content of a template card is saved with Save or the keyboard

The content editor of a template card SHALL save with the Save button or Ctrl+S, report success, and revert with Cancel; the editor SHALL show as unsaved only while it differs from the saved content.

Source: code

#### Scenario: Saving content with the keyboard

- **GIVEN** template card content has been changed
- **WHEN** the user presses Ctrl+S
- **THEN** a notice says the card was saved
- **AND** the editor no longer counts as unsaved

### Requirement: A template card is created from the New Resource menu while a template is open

While a template or template card is open, the New Resource menu in the app toolbar SHALL offer Template card, which opens a dialog for creating it; the menu item is disabled elsewhere, with a tooltip saying to navigate to a template or template card first.

Source: both, jira (INTDEV-975, INTDEV-1311, INTDEV-1359)

#### Scenario: Creating under an open template card

- **GIVEN** a template card is open in the configuration editor
- **WHEN** the user opens the New Resource menu and chooses Template card
- **THEN** a dialog headed Template card opens
- **AND** pressing Escape closes it

#### Scenario: Not available on an overview

- **GIVEN** the Workflows overview is open
- **WHEN** the user looks at Template card in the New Resource menu
- **THEN** it is disabled and its tooltip says to navigate to a template or template card first

### Requirement: Deleting a template card opens its parent and refreshes the tree

Deleting a template card SHALL open the editor of its parent template or template card instead of leaving the configuration editor, and the tree SHALL no longer list the deleted card.

Source: code, jira (INTDEV-1251, INTDEV-1360)

#### Scenario: Deleting a template card

- **GIVEN** template card `test_abc123` under template `test/templates/page` is open
- **WHEN** the user deletes it and confirms
- **THEN** the editor for template `test/templates/page` opens
- **AND** the tree no longer lists the card
