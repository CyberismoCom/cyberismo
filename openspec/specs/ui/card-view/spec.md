# ui/card-view Specification

## Purpose

What a user sees when a card is open in the app: title, metadata section, linked items, rendered content, sidebar, and the card toolbar with its state selector and actions (create, move, delete, export, logic program). Editing in place is specified in `ui/card-editor`. The rules behind each action are defined in domain capabilities: `workflows` (transitions), `links`, `cards/creation`, `cards/hierarchy`, `logic/operation-rules`, `logic/policy-checks`, `export/documents` and `macros`. Who can edit is decided as specified in `rest/auth`; this spec says only "users who can edit".

## Requirements

### Requirement: The card view shows title, metadata, links, content and sidebar

Opening a card SHALL show its title as a heading, a metadata section, a linked items section and the rendered content, with a sidebar beside them on wide windows.

Source: both

#### Scenario: Page content card

- **GIVEN** a card of type Page content created from its template
- **WHEN** the card is opened
- **THEN** a level 1 heading Untitled page content is shown
- **AND** the headings Context, Decision and Consequences are shown in the content
- **AND** a Table of contents entry for each of them is shown in the sidebar

### Requirement: The metadata section shows always-visible fields and hides the rest behind Show more

The metadata section SHALL always show the last updated time, labels and the fields marked as always visible, and SHALL show the remaining fields, the card type and the creation time only after the user presses Show more; pressing it again hides them.

Source: both

#### Scenario: Collapsed by default

- **GIVEN** a card opened in a fresh page load
- **WHEN** the card view is shown
- **THEN** the metadata section shows Last updated and Labels
- **AND** the Card type row is not shown

#### Scenario: Show more pressed

- **GIVEN** the metadata section is collapsed
- **WHEN** the user presses Show more
- **THEN** the Card type row is shown

### Requirement: Show less is disabled while a hidden field is being edited

While the user is editing a field that would be hidden by collapsing, the Show less button SHALL be disabled.

Source: code

#### Scenario: Editing an optional field

- **GIVEN** the metadata section is expanded and the user is editing an optionally visible field
- **WHEN** the section is shown
- **THEN** the Show less button is disabled

### Requirement: Fields the user may not edit are shown read-only

A field row SHALL NOT open an editor for users who cannot edit, for calculated fields without override (see `card-types`), or for fields whose edit the project denies on that card (see `logic/operation-rules`).

Source: code

#### Scenario: Denied field

- **GIVEN** a user who can edit viewing a card where the project denies editing the field Title text
- **WHEN** the user clicks the Title text row
- **THEN** no editor opens

### Requirement: The linked items section shows a count and collapses by default

The linked items section SHALL show the number of links as a badge and list the links only after the user presses Show more, and SHALL read No linked items when the card has none.

Source: both

#### Scenario: Card with one link

- **GIVEN** a card with one link, opened in a fresh page load
- **WHEN** the card view is shown
- **THEN** the linked items section shows a count of 1 and a Show more button
- **AND** no link rows are shown

#### Scenario: Card without links

- **GIVEN** a card with no links
- **WHEN** the card view is shown
- **THEN** the linked items section reads No linked items

### Requirement: A link row shows link type, target key, title and description

Each link SHALL be shown with the display name of the link type for that direction, the key of the other card as a clickable link, its title, and the link description when there is one.

Source: both

#### Scenario: Outbound link

- **GIVEN** a card with an Outbound link to Untitled page
- **WHEN** the links are expanded
- **THEN** a row shows Outbound, the key of Untitled page and the title Untitled page
- **AND** clicking the key opens Untitled page

#### Scenario: Inbound link on the other card

- **GIVEN** the target card of that link
- **WHEN** its links are expanded
- **THEN** a row shows Inbound and the title of the first card

### Requirement: Links can be added through a form with type, target and description

The linked items section SHALL let users who can edit open a link form from the link button in the card toolbar or the add button in the section, with a link type selection, a searchable target card field and, when the link type allows it, a description.

Source: both

#### Scenario: Link added

- **GIVEN** a user who can edit viewing Updated title with a link type Outbound available
- **WHEN** the user opens the link form from the toolbar, selects Outbound, selects Untitled page as the target and clicks Add link
- **THEN** after closing the form the links show an Outbound row with the title Untitled page

### Requirement: The link button is disabled when no link can be made

The toolbar link button SHALL be disabled while the card's type has no usable link type or the project has no other card to link to.

Source: both

#### Scenario: Only one card in the project

- **GIVEN** a project with a single card Untitled page and no children
- **WHEN** the card is shown
- **THEN** the toolbar link button is disabled

### Requirement: Calculated links are shown locked

Links produced by calculation SHALL be shown with a lock mark and SHALL NOT offer edit or delete.

Source: both

#### Scenario: Calculated link in edit mode

- **GIVEN** a card with a calculated link
- **WHEN** a user who can edit opens the link editing mode
- **THEN** the calculated link row shows a lock mark with the note that it cannot be edited or deleted

### Requirement: A link is deleted after confirmation

Deleting a user-created link SHALL ask for confirmation in a dialog with Cancel and Delete buttons, and after deletion SHALL show a success notice and remove the row.

Source: both

#### Scenario: Link deleted

- **GIVEN** a user who can edit in link editing mode on a card with one link
- **WHEN** the user clicks the delete icon of the link and confirms with Delete
- **THEN** a Link deleted successfully notice is shown
- **AND** no link rows remain

### Requirement: A refused link change is shown as an error notice

When the project refuses to create, change or delete a link, the app SHALL show the refusal as an error notice and keep the form open.

Source: code

#### Scenario: Refused link

- **GIVEN** the link form with a combination the project refuses
- **WHEN** the user clicks Add link
- **THEN** an error notice names the reason given by the project
- **AND** the form stays open

### Requirement: The sidebar shows a table of contents that follows scrolling

The sidebar SHALL list the level 1 to 3 headings of the content as a table of contents, link each entry to its heading, and highlight the entry of the heading being read.

Source: both

#### Scenario: Table of contents entries

- **GIVEN** a card whose content has headings Context, Decision and Consequences
- **WHEN** the card is shown
- **THEN** the sidebar shows the title Table of contents with entries Context, Decision and Consequences

### Requirement: Notifications and policy checks are listed in the sidebar

The sidebar SHALL list the card's notifications, its failed policy checks with their failure text, and its passed policy checks, each with a count; passed checks SHALL be collapsed until expanded.

Source: both

#### Scenario: Card with all three

- **GIVEN** the card Test notifications and policy checks
- **WHEN** the card is shown
- **THEN** the sidebar shows Notifications with the entry Category 1 - Notification title
- **AND** Failed policy checks shows Category 3 - Failing check title with the label FAIL
- **AND** Passed policy checks is collapsed until clicked, then shows Category 2 - Successful check title with the label PASS

### Requirement: On a narrow window the sidebar moves into the content column

On a narrow window the notifications and checks, and the table of contents, SHALL appear as collapsible panels above the content instead of in a sidebar.

Source: code

#### Scenario: Narrow window

- **GIVEN** a narrow window and a card with notifications
- **WHEN** the card is shown
- **THEN** a Notifications and checks panel with a count badge is shown above the content, collapsed

### Requirement: Card content is sanitised before it is shown

The app SHALL strip scripts, event handler attributes, forms and embedded objects from rendered card content, and SHALL show allowed embedded frames in a sandbox limited to approved video hosts.

Source: code

#### Scenario: Script in a passthrough block

- **GIVEN** a card whose content has a passthrough block containing a script element
- **WHEN** the card is shown
- **THEN** no script runs and no script element is in the content
- **AND** no browser dialog opens

#### Scenario: Frame from an unapproved host

- **GIVEN** a card whose content embeds a frame from a host that is not an approved video host
- **WHEN** the card is shown
- **THEN** the frame is blocked

### Requirement: Links to other cards in content navigate inside the app

A link in the rendered content that points to a card of the project SHALL open that card without a full page load.

Source: code

#### Scenario: Native cross reference

- **GIVEN** card A whose content links to card B with the AsciiDoc notation xref:bat_b.adoc[Go to B]
- **WHEN** the user clicks Go to B
- **THEN** the address becomes that of card B and card B is shown

### Requirement: The state selector shows the current state and its transitions

The card toolbar SHALL show the card's current workflow state as a coloured button, and opening it SHALL list the transitions available from that state, each with its target state.

Source: both

#### Scenario: Draft card

- **GIVEN** a card in state Draft of a workflow with transitions Approve and Archive
- **WHEN** the user opens the state button
- **THEN** a menu lists Approve and Archive

### Requirement: Choosing a transition changes the state at once

Choosing a transition in the menu SHALL change the card's state immediately as defined in `workflows`, and the state button SHALL show the new state.

Source: both

#### Scenario: Approve

- **GIVEN** a card in state Draft
- **WHEN** the user chooses Approve
- **THEN** the state button reads Approved

### Requirement: Side effects of a transition are visible on other cards

Changes that a transition makes to other cards, as defined in `logic/operation-rules`, SHALL be visible when those cards are opened, with no further user action.

Source: both

#### Scenario: Cascade to descendants

- **GIVEN** a parent card Side effects parent with child and grandchild, all in Draft
- **WHEN** the user approves the parent
- **THEN** opening Side effects child and Side effects grandchild shows their state button as Approved

### Requirement: Users who cannot edit cannot change the state

The state button SHALL be disabled for users who cannot edit, and a transition refused by the project SHALL be shown as an error notice.

Source: code

#### Scenario: User who cannot edit

- **GIVEN** a user who cannot edit viewing a card
- **WHEN** the toolbar is shown
- **THEN** the state button is shown disabled

### Requirement: The workflow diagram can be viewed from the state menu

The state menu SHALL offer View workflow, which opens a diagram of the card's workflow in a viewer.

Source: code, jira (INTDEV-1179)

#### Scenario: View workflow

- **GIVEN** a card with a workflow
- **WHEN** the user opens the state menu and chooses View workflow
- **THEN** a viewer shows the workflow diagram

### Requirement: The new card dialog lists templates by category

The new card dialog SHALL list the available templates as selectable tiles grouped by category, filter them by name or category as the user types, show No templates available when nothing matches, and enable Create only while a template is selected.

Source: both

#### Scenario: Create disabled until chosen

- **GIVEN** the new card dialog is open
- **WHEN** no template is selected
- **THEN** the Create button is disabled

#### Scenario: Filter with no match

- **GIVEN** the new card dialog is open
- **WHEN** the user types zzz in the template search
- **THEN** the message No templates available is shown

### Requirement: A refused card creation is shown as an error notice

When the project refuses to create the cards, the new card dialog SHALL show the refusal as an error notice and stay open with the template still selected.

Source: code

#### Scenario: Creation refused

- **GIVEN** the new card dialog is open with template Page content selected
- **WHEN** the user clicks Create and the project refuses the creation
- **THEN** an error notice names the reason given by the project
- **AND** the dialog stays open

### Requirement: A new card is created under the open card and then opened

Creating from the dialog SHALL create the cards as defined in `cards/creation` under the card being viewed, show a Card created successfully notice, and open the first new card; the option Create on top level SHALL create them at the project root instead.

Source: both

#### Scenario: Create at top level

- **GIVEN** the user viewing Untitled page with the new card dialog open
- **WHEN** the user selects Page content, ticks Create on top level and clicks Create
- **THEN** a Card created successfully notice is shown
- **AND** the new card appears at the top level of the tree

### Requirement: The card menu offers actions according to role and card

The card toolbar's more-actions menu SHALL offer Move, Add attachment and Delete card only to users who can edit, SHALL NOT offer Move for a card of an installed module (which `cards/hierarchy` refuses to move), and SHALL offer View logic program and Export Card to everyone.

Source: code

#### Scenario: Module card

- **GIVEN** a user who can edit viewing a card imported from a module
- **WHEN** the user opens the more-actions menu
- **THEN** Move is not offered
- **AND** Add attachment, View logic program, Export Card and Delete card are offered

#### Scenario: User who cannot edit

- **GIVEN** a user who cannot edit
- **WHEN** the user opens the more-actions menu
- **THEN** only View logic program and Export Card are offered

### Requirement: The move dialog offers destinations with search, recents and the full tree

The Move dialog SHALL offer the cards the open card may be moved under as defined in `cards/hierarchy`, in a Recents tab and an All tree, plus a Project top level destination, with a search field and a Move button enabled only while a destination is selected.

Source: both

#### Scenario: Move to a card

- **GIVEN** the user viewing Untitled page content with the Move dialog open
- **WHEN** the user opens All, selects Untitled page and clicks Move
- **THEN** a Card moved successfully notice is shown
- **AND** the tree shows Untitled page with an expand arrow

### Requirement: Moving a template card offers template destinations

For a card that belongs to a template, the Move dialog SHALL list the project's templates and their cards as destinations instead of the project's card tree, as allowed by `cards/hierarchy`, and a template row SHALL act as a move to that template's top level.

Source: both, jira (INTDEV-1250)

#### Scenario: Template card

- **GIVEN** a user who can change the configuration viewing a template card in the configuration editor
- **WHEN** the user opens Move and All
- **THEN** the dialog lists bat/templates/page and bat/templates/checks
- **AND** selecting bat/templates/checks enables the Move button

### Requirement: Deleting a card asks for confirmation unless it was just created

Delete card SHALL open a confirmation dialog naming the card, except for a card created in the current session, which SHALL be deleted at once; after deletion the app SHALL show a Card deleted successfully notice and open the parent card, or the card list.

Source: both

#### Scenario: Delete with confirmation

- **GIVEN** a user who can edit viewing Updated title, which was not created in this session
- **WHEN** the user chooses Delete card and confirms
- **THEN** a Card deleted successfully notice is shown

#### Scenario: Last card

- **GIVEN** a project with only one card
- **WHEN** the user deletes it
- **THEN** the message Project is empty is shown

### Requirement: Deleting a card with descendants requires an acknowledgement

When the card has descendants, the delete dialog SHALL state that the tree under it will be deleted and keep the Delete button disabled until the user ticks an acknowledgement naming the number of cards.

Source: code

#### Scenario: Card with two descendants

- **GIVEN** a card with two descendants and the delete dialog open
- **WHEN** the dialog is shown
- **THEN** the Delete button is disabled
- **AND** ticking I acknowledge I want to delete 3 cards enables it

### Requirement: A card or the whole project can be exported from a dialog

Export Card in the card menu, and Export Project in the tree menu, SHALL open a dialog asking for a title, a file name and an optional version, with an option to include child cards that is always on for the project export, and Export SHALL close the dialog and start the export as defined in `export/documents`.

Source: code

#### Scenario: Project export dialog

- **GIVEN** the live app
- **WHEN** the user chooses Export Project
- **THEN** a dialog titled Export Project shows Title, Name and Version fields
- **AND** no separate include child cards option is shown

### Requirement: The logic program of a card can be viewed

View logic program SHALL open a dialog showing the card's logic program text, with a Close button.

Source: code

#### Scenario: Dialog opened

- **GIVEN** a card
- **WHEN** the user chooses View logic program
- **THEN** a dialog titled Logic program shows the program text
