# ui/navigation Specification

## Purpose

How a user finds and moves between cards in the app: the card tree, tree search, breadcrumbs, the status and progress markers in the tree, drag-and-drop moving, the resizable panel and the project switcher above the tree. Card hierarchy and move rules are defined in `cards/hierarchy`; the status indicator, progress and hidden cards come from `logic/derived-card-data`; who can edit is decided as specified in `rest/auth`.

## Requirements

### Requirement: The tree shows the project's cards hierarchically

The left panel SHALL show the cards of the project as a tree, leaving out the cards hidden as specified in `logic/derived-card-data`, each row showing the card title, or the card key when it has no title.

Source: both

#### Scenario: Two levels

- **GIVEN** a project with card Untitled page and child Untitled page content
- **WHEN** the card list is shown
- **THEN** the tree shows Untitled page and, after expanding it, Untitled page content below it

### Requirement: A card with children has an expand arrow

Only a card that has children SHALL show an expand and collapse arrow in the tree.

Source: both

#### Scenario: Leaf has no arrow

- **GIVEN** a tree whose top-level cards have no children
- **WHEN** the tree is shown
- **THEN** no top-level row shows an arrow

#### Scenario: Arrow appears after a move

- **GIVEN** Untitled page content is moved under Untitled page
- **WHEN** the move completes
- **THEN** the row Untitled page shows an arrow

### Requirement: Clicking a card row opens the card

Clicking a row in the tree SHALL open that card in the right panel, expand the row when it was collapsed, and mark the row as selected.

Source: both

#### Scenario: Row clicked

- **GIVEN** the tree shows Untitled page content
- **WHEN** the user clicks its row
- **THEN** the heading Untitled page content is shown in the right panel

### Requirement: The selected card is revealed in the tree

When a card is opened by any route, the tree SHALL expand the card's ancestors and mark its row as selected.

Source: code

#### Scenario: Card opened by address

- **GIVEN** a card two levels deep
- **WHEN** the user opens its address in a fresh page load
- **THEN** its ancestors are expanded and its row is selected

### Requirement: The project name heads the tree

The current project's name SHALL be shown as a heading above the tree.

Source: code

#### Scenario: Heading shown

- **GIVEN** the user viewing a card in project Basic Acceptance Test
- **WHEN** the card view is shown
- **THEN** the heading Basic Acceptance Test is shown above the tree

### Requirement: Each row shows a status dot for the card's status indicator

A tree row SHALL show a coloured dot for the card's status indicator as derived in `logic/derived-card-data`.

Source: both, jira (INTDEV-249)

#### Scenario: State changes

- **GIVEN** a project using the base module and a card in state Draft whose row shows one dot colour
- **WHEN** the user transitions it to Approved
- **THEN** the row's dot shows the colour of the Approved category

### Requirement: An error status indicator shows an error marker

A tree row SHALL show an error marker in place of the status dot while the card's status indicator is error.

Source: both

#### Scenario: Failing check

- **GIVEN** a project using the base module and a card Test notifications and policy checks with a failing policy check
- **WHEN** the tree is shown
- **THEN** its row shows an error marker instead of a status dot

### Requirement: A card with a progress value shows it as a percentage

A tree row SHALL show a percentage badge at its right edge when the card has a progress value as derived in `logic/derived-card-data`.

Source: both, jira (INTDEV-250)

#### Scenario: Progress 75

- **GIVEN** a card whose progress value is 75
- **WHEN** the tree is shown
- **THEN** its row shows 75%

### Requirement: Searching filters the tree by card title

Typing in the search field above the tree SHALL narrow the tree in real time to the cards whose title contains the text, ignoring case, together with all their ancestors, with matching branches expanded.

Source: both

#### Scenario: Descendant matches

- **GIVEN** a tree with Untitled page and child Untitled page content, and a card Other
- **WHEN** the user types CONTENT in the search field
- **THEN** the tree shows Untitled page and Untitled page content, expanded
- **AND** Other is not shown

### Requirement: Search is cleared with Escape or the clear button

Pressing Escape in the search field, or clicking its clear button, SHALL empty the field and restore the full tree.

Source: both

#### Scenario: Escape pressed

- **GIVEN** the search field contains content and the tree is filtered
- **WHEN** the user presses Escape
- **THEN** the field is empty and the full tree is shown

### Requirement: Breadcrumbs show the path to the open card

Above the card, a breadcrumb trail SHALL show the path from the project root to the open card, with a home icon for the root, each entry opening that card when clicked.

Source: both

#### Scenario: Ancestor clicked

- **GIVEN** the user viewing Untitled page content, a child of Untitled page
- **WHEN** the user clicks Untitled page in the breadcrumbs
- **THEN** Untitled page is shown

### Requirement: The last breadcrumb shows the card key

The last breadcrumb, for the open card itself, SHALL show the card title followed by the card key.

Source: code

#### Scenario: Key in breadcrumb

- **GIVEN** the user viewing card bat_abc123 titled Untitled page
- **WHEN** the breadcrumbs are shown
- **THEN** the last entry reads Untitled page - bat_abc123

### Requirement: Users who can edit can move cards by dragging

Users who can edit SHALL be able to drag a tree row onto another row to make it a child, or between rows to reorder it; other users SHALL NOT be able to drag rows.

Source: code

#### Scenario: User who cannot edit cannot drag

- **GIVEN** a user who cannot edit viewing the tree
- **WHEN** the user tries to drag a row
- **THEN** the row does not move

### Requirement: Module cards cannot be moved by dragging

Rows for cards of an installed module, which `cards/hierarchy` refuses to move, SHALL NOT be draggable and SHALL NOT accept drops.

Source: code

#### Scenario: Module card row

- **GIVEN** a user who can edit and a card imported from a module
- **WHEN** the user tries to drag the card row
- **THEN** the row does not move

### Requirement: The navigation panel can be resized

The user SHALL be able to resize the left panel by dragging the divider between it and the content.

Source: both

#### Scenario: Divider dragged

- **GIVEN** the card view on a wide window
- **WHEN** the user drags the divider to the right
- **THEN** the tree panel becomes wider

### Requirement: On a narrow window the tree opens in a drawer

Below the medium window width the tree panel SHALL be hidden behind a menu button in the application bar and open as a drawer that closes when a card is chosen or its close button is pressed.

Source: code

#### Scenario: Narrow window

- **GIVEN** a narrow window viewing a card
- **WHEN** the user clicks the menu button and then a card row
- **THEN** the drawer closes and the chosen card is shown

### Requirement: The tree panel lists recent projects and a switcher

Above the tree the app SHALL list the current project and the most recently used other projects, with a More projects entry opening the project dialog, except when the server offers exactly one project and no creation.

Source: code

#### Scenario: Single project

- **GIVEN** a server with one project and no project creation
- **WHEN** the card view is shown
- **THEN** no recent projects list or More projects entry is shown above the tree

### Requirement: The tree menu offers project export and configuration

A menu next to the project name SHALL offer Configuration, which opens the configuration editor, and, outside an exported static site, Export Project.

Source: code

#### Scenario: Menu in the live app

- **GIVEN** the live app
- **WHEN** the user opens the menu next to the project name
- **THEN** the entries Export Project and Configuration are shown

### Requirement: Cards at the same level are shown in rank order

The tree SHALL show the cards under the same parent, and the top-level cards, in the order of their rank.

Source: both

#### Scenario: Reordered sibling

- **GIVEN** the top-level cards First and Second, with Second ranked before First
- **WHEN** the tree is shown
- **THEN** Second is shown above First
