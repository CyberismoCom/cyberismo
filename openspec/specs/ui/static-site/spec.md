# ui/static-site Specification

## Purpose

What the exported static documentation site shows when opened in a browser: the same card views as the app, read-only, without the features that need a running server. How the site is produced is specified in `cli/project-commands`; what cards and macros contain is specified in the domain capabilities, notably `macros`.

## Requirements

### Requirement: The exported site opens in a browser and shows the card tree

Opening the exported site's index page in a browser SHALL show the app's two-column layout with the navigation tree of the exported project and the first card.

Source: both, jira (INTDEV-510)

#### Scenario: Index opened

- **GIVEN** a site exported from project bat
- **WHEN** the user opens its index page in a browser
- **THEN** the card tree of bat is shown on the left
- **AND** a card is shown on the right

### Requirement: Card pages are addressed with and without .html

A card of the exported site SHALL be reachable at its card address, and an address ending in .html SHALL show the same card.

Source: code

#### Scenario: Address with .html

- **GIVEN** a site with card bat_abc123
- **WHEN** the user opens the address of bat_abc123 ending in .html
- **THEN** the card is shown

### Requirement: The site offers no editing, creating, moving or deleting

The site SHALL show cards, fields, links and content read-only, and SHALL NOT offer title, field, label or content editing, link editing, card creation, moving, deleting or attachments.

Source: both, jira (INTDEV-1163)

#### Scenario: Card in the site

- **GIVEN** the exported site showing a card
- **WHEN** the user clicks the title and a metadata row
- **THEN** no editor opens
- **AND** no New Card button and no card actions menu are shown

### Requirement: The state button shows the state but cannot change it

The state button SHALL show the card's current state and SHALL be disabled.

Source: code

#### Scenario: State button

- **GIVEN** the exported site showing a card in state Approved
- **WHEN** the toolbar is shown
- **THEN** the state button reads Approved and is disabled

### Requirement: The configuration pages are read-only

The configuration pages of the site SHALL show resources without any edit, create or delete controls.

Source: jira (INTDEV-1191)

#### Scenario: Configuration opened

- **GIVEN** the exported site
- **WHEN** the user opens Configuration from the tree menu
- **THEN** no New Resource menu and no edit controls are shown

### Requirement: Server-only actions are not offered

The site SHALL NOT offer Export Project, Export Card, creating a project or any presence indicator of other users.

Source: code

#### Scenario: Tree menu

- **GIVEN** the exported site
- **WHEN** the user opens the menu next to the project name
- **THEN** only Configuration is listed

### Requirement: The go to field link is not shown

Failed policy checks in the site SHALL be listed without a go to field link.

Source: both, jira (INTDEV-948)

#### Scenario: Failing check

- **GIVEN** the exported site showing a card with a failed policy check naming a field
- **WHEN** the sidebar is shown
- **THEN** the failure is listed
- **AND** no go to field link is shown

### Requirement: Create cards buttons are absent

A Create cards macro SHALL produce no button on the exported site.

Source: docs

#### Scenario: Card with a Create cards macro

- **GIVEN** a card whose content has a Create cards macro
- **WHEN** the card is shown in the exported site
- **THEN** no button for creating cards is shown

### Requirement: A site of several projects offers the project dialog

A site exported from several projects SHALL open the configured default project, or show the project selection when none is configured, and the project dialog SHALL switch between the exported projects.

Source: code, jira (INTDEV-944)

#### Scenario: Two projects

- **GIVEN** a site exported from projects bat and demo
- **WHEN** the user opens the More projects entry and opens demo
- **THEN** the card tree of demo is shown

### Requirement: Breadcrumbs and links work in the site

Breadcrumbs, links between cards and cross references in the site SHALL open the target cards.

Source: both, jira (INTDEV-840)

#### Scenario: First breadcrumb

- **GIVEN** the exported site showing a card two levels deep
- **WHEN** the user clicks the first breadcrumb
- **THEN** the top-level card is shown and no error page appears

### Requirement: Unknown addresses show the not found page

An address in the site that matches no card or page SHALL show the Page not found page.

Source: both, jira (INTDEV-1181)

#### Scenario: Unknown card

- **GIVEN** the exported site
- **WHEN** the user opens an address of a card that was not exported
- **THEN** a Page not found page is shown

### Requirement: The site adapts to narrow windows

On a narrow window the site SHALL move the navigation tree into a drawer opened from the application bar, as in the app.

Source: both, jira (INTDEV-923)

#### Scenario: Narrow window

- **GIVEN** the exported site on a narrow window
- **WHEN** the page is shown
- **THEN** a menu button opens the tree in a drawer

### Requirement: The site opens no live connection

The exported static site SHALL NOT attempt live updates (`ui/collaboration`) and so SHALL NOT show the disconnected banner.

Source: code

#### Scenario: No disconnected banner

- **GIVEN** the static export of a project is opened
- **WHEN** a card page is shown
- **THEN** no disconnected banner is shown
