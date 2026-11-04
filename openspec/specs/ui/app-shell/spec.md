# ui/app-shell Specification

## Purpose

The frame around every screen of the Cyberismo app: layout, application bar, theme, keyboard shortcuts, choosing and creating a project, pages for unknown addresses, and returning to the last visited page. What the screens inside the frame show is specified in `ui/navigation`, `ui/card-view` and `ui/card-editor`; which projects exist and how they are created is specified in `projects/setup`; who can edit or change the configuration is decided as specified in `rest/auth`.

## Requirements

### Requirement: The app uses a two-column layout

The app SHALL show a navigation panel on the left and the selected card or configuration page on the right, with a toolbar above the right-hand content.

Source: docs

#### Scenario: Card opened

- **GIVEN** a project with a card titled Untitled page
- **WHEN** the user opens the card
- **THEN** the card tree is shown on the left
- **AND** the card title and content are shown on the right under a toolbar

### Requirement: The application bar shows the logo, theme toggle and user menu

The application bar SHALL show the Cyberismo logo, the theme toggle and the user menu at the top of every project screen.

Source: both

#### Scenario: Bar contents

- **GIVEN** a user viewing any card
- **WHEN** the page is shown
- **THEN** the application bar shows the Cyberismo logo, a theme toggle button and the user menu

### Requirement: The logo returns to the card list

Clicking the Cyberismo logo SHALL open the card list of the current project.

Source: code

#### Scenario: Logo clicked on a configuration page

- **GIVEN** the user is on a configuration page
- **WHEN** the user clicks the Cyberismo logo
- **THEN** the card list is shown

### Requirement: The theme toggle cycles system, light and dark

Each press of the theme toggle SHALL switch the colour scheme to the next mode in the order system, light, dark, and back to system.

Source: both

#### Scenario: Toggle pressed from system mode

- **GIVEN** the colour scheme follows the system
- **WHEN** the user presses the theme toggle twice
- **THEN** the app is shown in the dark scheme
- **AND** the toggle's label offers switching to the system scheme

### Requirement: The create buttons are offered only to users who may use them

The application bar SHALL show the New Card button on card screens only to users who can edit, and on configuration screens a New Resource menu only to users who can change the configuration.

Source: code

#### Scenario: No create button without edit rights

- **GIVEN** a user who cannot edit viewing a card
- **WHEN** the application bar is shown
- **THEN** no New Card button is shown

#### Scenario: Create button for a user who can edit

- **GIVEN** a user who can edit viewing a card
- **WHEN** the application bar is shown
- **THEN** a New Card button is shown

### Requirement: The C key opens the new card dialog

Pressing C outside a text field SHALL open the new card dialog for users who can edit, and SHALL do nothing for other users.

Source: both, jira (INTDEV-754)

#### Scenario: C pressed by a user who can edit

- **GIVEN** a user who can edit viewing a card with no text field focused
- **WHEN** the user presses C
- **THEN** the new card dialog opens

#### Scenario: C pressed while typing

- **GIVEN** the card search field is focused
- **WHEN** the user types c
- **THEN** the letter is entered in the search field
- **AND** no dialog opens

### Requirement: The Home key opens the first card in the tree

Pressing Home outside a text field SHALL open the first card of the navigation tree.

Source: both

#### Scenario: Home pressed on a later card

- **GIVEN** a project whose tree starts with Untitled page, and the user viewing another card
- **WHEN** the user presses Home
- **THEN** Untitled page is shown

### Requirement: Shortcuts are ignored while focus is in a text field

Keyboard shortcuts SHALL NOT act while the focus is in a text input or an editor.

Source: both

#### Scenario: Home pressed in the title input

- **GIVEN** the title editor is open on a card that is not first in the tree
- **WHEN** the user presses Home
- **THEN** the cursor moves in the title input
- **AND** the card stays the same

### Requirement: A single available project opens directly

Opening the app root SHALL open the only available project at its remembered page, without asking the user to choose.

Source: code

#### Scenario: One project

- **GIVEN** a server with one project, bat
- **WHEN** the user opens the app root
- **THEN** the address becomes a page under /projects/bat/cards

### Requirement: Without a resolvable project the selection page is shown

When no project can be chosen automatically, opening the app root SHALL show a Select a project page with the project selection dialog, which cannot be dismissed.

Source: code

#### Scenario: Several projects and none remembered

- **GIVEN** a server with several projects and no project remembered in the browser
- **WHEN** the user opens the app root
- **THEN** the project selection dialog is shown over a Select a project page
- **AND** the dialog has no close button

### Requirement: The project dialog lists projects and filters them

The project selection dialog SHALL list the available projects with their names and prefixes, narrow the list as the user types a name or prefix, and show a No projects found message when nothing matches.

Source: code

#### Scenario: Dialog opened from the tree

- **GIVEN** the user viewing project Basic Acceptance Test with prefix bat
- **WHEN** the user opens the More projects entry above the tree
- **THEN** the dialog titled Projects shows Basic Acceptance Test and bat

#### Scenario: Filter matches nothing

- **GIVEN** the project dialog is open
- **WHEN** the user types nonexistent in the filter
- **THEN** a No projects found message is shown

### Requirement: A project is opened with the Open button

The project dialog SHALL enable its Open button only while a project is selected, and opening a project SHALL close the dialog and show that project.

Source: code

#### Scenario: Current project preselected

- **GIVEN** the user is in project bat and opens the project dialog
- **WHEN** the dialog is shown
- **THEN** the Open button is enabled
- **AND** clicking Open closes the dialog and the address stays under /projects/bat/cards

#### Scenario: Filter clears selection

- **GIVEN** the project dialog is open with a project selected
- **WHEN** the user types in the filter
- **THEN** the Open button is disabled

### Requirement: Cancelling the project dialog closes it

The Cancel button of a dismissable project dialog SHALL close it without changing the project.

Source: code

#### Scenario: Cancel pressed

- **GIVEN** the project dialog is open
- **WHEN** the user clicks Cancel
- **THEN** the dialog closes

### Requirement: Creating a project is offered only where allowed

The project dialog SHALL offer a New project button only when the server allows creating projects and the app is not an exported static site.

Source: code

#### Scenario: Creation not allowed

- **GIVEN** a server that does not allow project creation
- **WHEN** the user opens the project dialog
- **THEN** no New project button is shown

### Requirement: The new project wizard starts by choosing clone or create

The new project wizard SHALL first ask whether to clone a project from a repository or create a new project from scratch, and each choice SHALL lead to its own form with a Back button.

Source: code

#### Scenario: Create from scratch chosen

- **GIVEN** the wizard is open
- **WHEN** the user chooses Create new project
- **THEN** a form with project name, prefix, category and description is shown
- **AND** a Back button returns to the choice

### Requirement: A project can be cloned from a repository URL

The clone form SHALL enable its Clone button only while a repository URL is entered, and a successful clone SHALL show a success notice and open the cloned project's card list.

Source: code

#### Scenario: Clone without URL

- **GIVEN** the clone form is shown with an empty URL
- **WHEN** the form is displayed
- **THEN** the Clone button is disabled

#### Scenario: Clone fails

- **GIVEN** the clone form with a URL the server refuses
- **WHEN** the user clicks Clone
- **THEN** an error notice is shown
- **AND** the wizard stays open

### Requirement: The new project form enforces name and prefix shape

The Next button of the new project form SHALL be disabled until the name and the prefix meet the rules of `projects/setup`, and the prefix field SHALL lowercase what the user types.

Source: code

#### Scenario: Prefix too short

- **GIVEN** the new project form with name My Project
- **WHEN** the user enters the prefix ab
- **THEN** the Next button is disabled

#### Scenario: Prefix lowercased

- **GIVEN** the new project form
- **WHEN** the user types MYPROJ in the prefix field
- **THEN** the field shows myproj

### Requirement: Modules can be chosen after the project is created

After a project is created the wizard SHALL offer the importable modules as a multi-selection, with Create project enabled only while a module is selected, a Skip button, and a Back button; finishing or skipping SHALL open the new project's card list.

Source: code

#### Scenario: Skip modules

- **GIVEN** the wizard has created project demo and shows the module step
- **WHEN** the user clicks Skip
- **THEN** the card list of project demo is shown

### Requirement: An unknown project address shows a project not found page

Opening an address for a project that is not available SHALL show a Project not found page with a Browse projects button that returns to the project selection.

Source: both, jira (INTDEV-1181)

#### Scenario: Unknown prefix

- **GIVEN** a server with project bat only
- **WHEN** the user opens /projects/ghost/cards
- **THEN** a Project not found page is shown with a Browse projects button

### Requirement: An unknown page inside a project shows a page not found page

Opening an address inside a project that matches no screen SHALL show a Page not found page with a Browse cards button, and the address SHALL NOT be remembered as the last visited page.

Source: both, jira (INTDEV-1181)

#### Scenario: Unknown path

- **GIVEN** the user in project bat
- **WHEN** the user opens /projects/bat/nowhere
- **THEN** a Page not found page is shown with a Browse cards button

### Requirement: Addresses with .html resolve to the same screens

Opening a card or card list address ending in .html SHALL show the same screen as the address without it.

Source: code

#### Scenario: Card address with .html

- **GIVEN** a card bat_abc123
- **WHEN** the user opens /projects/bat/cards/bat_abc123.html
- **THEN** the card is shown at the address without .html

### Requirement: The last visited page of each project is remembered

Opening the app again SHALL return to the card or configuration page the user last visited in the project, not to the card list.

Source: code

#### Scenario: Reopen after visiting a card

- **GIVEN** the user created a card and is viewing it
- **WHEN** the user opens the app root in a fresh page load
- **THEN** the same card is shown

### Requirement: A remembered card that no longer exists degrades to an inline error

Opening a card address whose card no longer exists SHALL show an error in the card area within the normal frame, not the Page not found page, and the app SHALL forget that address so the next reopen does not return to it.

Source: code

#### Scenario: Deleted card reopened

- **GIVEN** a card that was deleted and its address
- **WHEN** the user opens that address
- **THEN** the application bar and tree are shown with an error in the card area
- **AND** no Page not found page is shown
- **AND** opening the app root afterwards shows another card, not the deleted one

### Requirement: An empty project says so

A project without cards SHALL show a Project is empty message instead of a card.

Source: code, jira (INTDEV-303)

#### Scenario: Last card deleted

- **GIVEN** a project with one card
- **WHEN** the user deletes the card
- **THEN** the message Project is empty is shown

### Requirement: The window title names the card and project

The browser window title SHALL read the card title and project name when a card is open, and the project name otherwise.

Source: code

#### Scenario: Card open

- **GIVEN** a card titled Untitled page in project Basic Acceptance Test
- **WHEN** the card is shown
- **THEN** the window title is Untitled page - Basic Acceptance Test
