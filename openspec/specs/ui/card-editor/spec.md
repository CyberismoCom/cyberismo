# ui/card-editor Specification

## Purpose

How a user edits a card in place in the Cyberismo app: its title, its metadata fields, its AsciiDoc content and its attachments. Which edits the project accepts, and what they do to the card, is specified by the domain capabilities (`cards/editing`, `fields/field-values`, `cards/attachments`, `logic/operation-rules`); who can edit is decided as specified in `rest/auth`. This capability covers only the interaction in the app.

## Requirements

### Requirement: Editing controls are offered only to users who can edit

The card view SHALL offer title, field and content editing only to users who can edit, and SHALL show the title, fields and content read-only to other users.

Source: code

#### Scenario: User who cannot edit sees no edit controls

- **GIVEN** a user who cannot edit viewing a card
- **WHEN** the card view is shown
- **THEN** no content edit button is shown
- **AND** clicking the title or a field row does not open an editor

#### Scenario: User who can edit sees the content edit button

- **GIVEN** a user who can edit viewing a card
- **WHEN** the card view is shown
- **THEN** a content edit button is shown on the card content

### Requirement: The title is edited in place

Clicking the card title SHALL replace the heading with a title input prefilled with the current title, with save and cancel buttons.

Source: code

#### Scenario: Opening the title editor

- **GIVEN** a card titled Untitled page content
- **WHEN** the user clicks the title
- **THEN** a title input containing Untitled page content is shown with save and cancel buttons

### Requirement: Saving the title updates the card view and the tree

Saving the title, with the save button or Enter, SHALL close the title editor and show the new title both as the card heading and in the navigation tree.

Source: code

#### Scenario: Title saved with the save button

- **GIVEN** the title editor is open on a card titled Untitled page content
- **WHEN** the user enters Inline edited title and clicks save
- **THEN** the title editor closes
- **AND** the card heading reads Inline edited title
- **AND** the navigation tree shows Inline edited title

### Requirement: Cancelling the title edit restores the title

Cancelling the title edit, with the cancel button or Escape, SHALL close the title editor without saving and show the previous title.

Source: code

#### Scenario: Title edit cancelled with Escape

- **GIVEN** the title editor is open on a card titled Untitled page content
- **WHEN** the user enters Discarded escape and presses Escape
- **THEN** the title editor closes
- **AND** the card heading still reads Untitled page content

#### Scenario: Title edit cancelled with the cancel button

- **GIVEN** the title editor is open on a card titled Untitled page content
- **WHEN** the user enters Discarded cancel and clicks cancel
- **THEN** the title editor closes
- **AND** the card heading still reads Untitled page content

### Requirement: An empty title cannot be saved

The title save button SHALL be disabled while the title input is empty or contains only spaces.

Source: code

#### Scenario: Title cleared

- **GIVEN** the title editor is open
- **WHEN** the user clears the title input
- **THEN** the save button is disabled

### Requirement: Metadata fields are edited one row at a time

Clicking an editable row in the metadata section SHALL open an editor for that field in the row, suited to the field's data type, with save and cancel buttons; saving shows the new value in the row and cancelling restores the previous one.

Source: both

#### Scenario: Field row opened for editing

- **GIVEN** a card whose metadata section shows the editable field Labels
- **WHEN** the user clicks the Labels row
- **THEN** the Labels row shows an editor with a cancel button
- **AND** no other row is in edit mode

### Requirement: Labels are added in the metadata section

The labels field editor SHALL let the user type a label and add it, and the added label SHALL be shown in the metadata section after the editor closes.

Source: code

#### Scenario: Label added inline

- **GIVEN** the labels field editor is open on a card
- **WHEN** the user types testLabel, clicks add and closes the editor
- **THEN** the metadata section shows the label testLabel

### Requirement: Overridable calculated fields show the calculated value while overriding

For a calculated field that can be overridden, the field row SHALL show only the effective value in read mode, and the field editor SHALL show the calculated value next to the override being edited.

Source: code, jira (INTDEV-1276)

#### Scenario: No override stored

- **GIVEN** a card whose overridable calculated field has the calculated value 5 and no override
- **WHEN** the card view is shown
- **THEN** the field row shows 5 with no separate calculated value

#### Scenario: Override saved

- **GIVEN** the editor is open on that field
- **WHEN** the user enters 42 and saves
- **THEN** the editor shows the calculated value 5 while editing
- **AND** after saving the row shows 42 with no separate calculated value

### Requirement: A stored override can be cleared

The editor of an overridable calculated field SHALL offer a clear action that removes the stored override; the clear action SHALL be disabled when no override is stored and nothing has been entered.

Source: code, jira (INTDEV-1276)

#### Scenario: Clear disabled without an override

- **GIVEN** an overridable calculated field with no override
- **WHEN** the user opens its editor
- **THEN** the clear button is disabled

#### Scenario: Override cleared

- **GIVEN** an overridable calculated field with the stored override 42
- **WHEN** the user opens its editor, which is prefilled with 42, and clicks clear
- **THEN** the editor closes and the row shows the calculated value

### Requirement: A failed policy check can open the field it concerns

A failed policy check that names a field SHALL offer a link that opens that field's editor in the metadata section, and only that field's editor.

Source: code

#### Scenario: Go to the failing field

- **GIVEN** a card with a failed policy check that names the field `test/fieldTypes/failureTitle`
- **WHEN** the user clicks the check's go-to-field link in the card sidebar
- **THEN** the row of `test/fieldTypes/failureTitle` is in edit mode with save and cancel buttons
- **AND** no other field row is in edit mode

### Requirement: Content editing opens a source editor in place

Clicking the content edit button SHALL replace the rendered content with an AsciiDoc source editor containing the card's current source.

Source: both

#### Scenario: Content editor opened

- **GIVEN** a card whose content has the heading Updated content
- **WHEN** the user clicks the content edit button
- **THEN** a source editor is shown containing the text Updated content
- **AND** the rendered content is no longer shown

### Requirement: The content editor has a formatting toolbar

The content editor SHALL show a toolbar with undo, redo, headings of levels 1 to 3, bulleted list, numbered list, bold, italic, highlight, table, diagram and macro insertion actions, each of which inserts the corresponding AsciiDoc at the cursor or around the selection.

Source: both

#### Scenario: Bold applied to a selection

- **GIVEN** the content editor is open with the word risk selected
- **WHEN** the user clicks the bold button
- **THEN** the source shows risk marked as bold AsciiDoc

### Requirement: The unsaved content can be previewed

The content editor SHALL offer a preview toggle that shows the unsaved source rendered as the card would display it, and toggling back SHALL return to the source editor with the same unsaved text.

Source: both

#### Scenario: Preview and back

- **GIVEN** the content editor is open with unsaved text
- **WHEN** the user toggles preview
- **THEN** the source editor is hidden and the rendered text is shown
- **WHEN** the user toggles preview again
- **THEN** the source editor is shown with the same unsaved text

### Requirement: Saving content shows the rendered result

Saving content, with the save button, Ctrl+S or Ctrl+Enter (Cmd on macOS), SHALL close the source editor and show the saved content rendered; if saving fails, the editor SHALL stay open with the unsaved text and an error notification SHALL be shown.

Source: both

#### Scenario: Content saved

- **GIVEN** the content editor is open
- **WHEN** the user replaces the source with `== Updated content` and clicks save
- **THEN** the source editor closes
- **AND** the card shows a level-2 heading Updated content

#### Scenario: Save refused by the project

- **GIVEN** the content editor is open on a card whose content edits the project denies
- **WHEN** the user clicks save
- **THEN** an error notification with the refusal message is shown
- **AND** the source editor stays open with the unsaved text

### Requirement: Cancelling content editing discards the changes

Cancelling content editing, with the cancel button or Escape, SHALL close the source editor without saving, and reopening the editor SHALL show the saved source.

Source: both

#### Scenario: Cancelled with Escape

- **GIVEN** the content editor is open on content with the heading Updated content
- **WHEN** the user types discarded by escape and presses Escape
- **THEN** the source editor closes
- **AND** the card shows the heading Updated content and no text discarded by escape

#### Scenario: Cancelled with the cancel button and reopened

- **GIVEN** the user typed discarded by cancel in the content editor and clicked cancel
- **WHEN** the user opens the content editor again
- **THEN** the editor contains the saved source without discarded by cancel

### Requirement: Leaving a card closes its editor

Navigating to another card, or back in the browser history, SHALL close an open content editor that has no unsaved changes.

Source: code

#### Scenario: Navigating to another card

- **GIVEN** the content editor is open on a card with no unsaved changes
- **WHEN** the user selects the parent card in the navigation tree
- **THEN** the parent card is shown without a source editor

#### Scenario: Going back in history

- **GIVEN** the content editor is open on a card with no unsaved changes
- **WHEN** the user goes back in the browser
- **THEN** the previous page is shown without a source editor

### Requirement: Leaving with unsaved changes asks for confirmation

Navigating away from a card, or closing or reloading the page, while the title or content has unsaved changes SHALL ask the user to confirm; declining SHALL keep the user on the card with the changes.

Source: code, jira (INTDEV-348)

#### Scenario: Navigation declined

- **GIVEN** the content editor has unsaved changes
- **WHEN** the user selects another card in the navigation tree and declines the confirmation
- **THEN** the same card is still shown with the source editor and the unsaved text

### Requirement: Clicking outside the editor keeps it open

Clicking elsewhere on the card view while the content editor is open SHALL NOT close the editor.

Source: code

#### Scenario: Click on the metadata section

- **GIVEN** the content editor is open
- **WHEN** the user clicks the metadata section
- **THEN** the source editor is still shown

### Requirement: The attachments panel lists the card's attachments while editing

While the content editor is open, the card sidebar SHALL show an attachments panel with the number of attachments, a thumbnail for each image attachment and a file icon for other files.

Source: both

#### Scenario: Attachment count shown

- **GIVEN** a card with one attachment `cyberismo.png`
- **WHEN** the user opens the content editor
- **THEN** the attachments panel shows the count 1 and a thumbnail of `cyberismo.png`

### Requirement: Attachments are added through a dialog

The attachments panel, and the card toolbar's context menu, SHALL open an add-attachment dialog with file selection, add and cancel; adding SHALL show a success notification and the new attachment in the panel, and the dialog SHALL work again straight after a successful add.

Source: both

#### Scenario: Two attachments added in a row

- **GIVEN** the content editor is open on a card with no attachments
- **WHEN** the user adds `cyberismo.png` and then `notes.txt` through the panel's add button
- **THEN** a success notification is shown after each add
- **AND** the attachments panel shows the count 2

### Requirement: Adding an attachment from the toolbar opens the content editor

Adding an attachment from the card toolbar's context menu SHALL open the content editor, with the new attachment listed in the attachments panel.

Source: code

#### Scenario: Attachment added from the context menu

- **GIVEN** a card shown in view mode
- **WHEN** the user adds `cyberismo.png` through the context menu's add-attachment action
- **THEN** the source editor is open
- **AND** the attachments panel lists `cyberismo.png`

### Requirement: An attachment reference can be inserted into the content

Each attachment in the panel SHALL offer an insert action, and SHALL be draggable into the source editor, either of which inserts an AsciiDoc reference to the attachment at the cursor or drop position.

Source: both

#### Scenario: Image inserted and saved

- **GIVEN** the content editor is open and the attachments panel lists `cyberismo.png`
- **WHEN** the user clicks the insert action of `cyberismo.png` and saves
- **THEN** the card content shows the image `cyberismo.png`

### Requirement: Deleting an attachment asks for confirmation

Each attachment in the panel SHALL offer a delete action that asks for confirmation before deleting; after confirmation the attachment SHALL no longer be listed.

Source: both

#### Scenario: Attachment deleted

- **GIVEN** the content editor is open on a card with one attachment
- **WHEN** the user clicks delete on the attachment and accepts the confirmation
- **THEN** the attachments panel shows the count 0

### Requirement: An attachment can be downloaded

Each attachment in the panel SHALL offer a download action that downloads the file under its attachment name.

Source: both

#### Scenario: Attachment downloaded

- **GIVEN** the attachments panel lists `notes.txt`
- **WHEN** the user clicks the download action of `notes.txt`
- **THEN** the browser downloads a file named `notes.txt`
