# ui/collaboration Specification

## Purpose

What the app shows about other people working on the same project: the identity of the current user, a notice and a refresh when someone else writes the card that is open, and a banner when live updates are lost. How identity is established, who can edit, which events are sent and how long a connection lives are specified by `rest/auth` and `rest/events`; the change events a write emits are `projects/change-tracking`.

## Requirements

### Requirement: The user menu shows who is signed in

The toolbar SHALL show an avatar with the initials of the current user, and opening it SHALL show the user's name and email.

Source: code

#### Scenario: Opening the user menu

- **GIVEN** the current user is Alice Example with email alice@example.com
- **WHEN** the user clicks the avatar showing AE
- **THEN** a menu shows Alice Example and alice@example.com

### Requirement: No user menu is shown without a current user

The toolbar SHALL show no user menu while the app has no current user.

Source: code

#### Scenario: Unidentified session

- **GIVEN** the app has no current user
- **WHEN** a page is shown
- **THEN** the toolbar has no avatar

### Requirement: A card changed elsewhere is refreshed

When the card that is open is changed by another user or in another tab, the app SHALL show the card's new content, title, fields and its place in the navigation tree without the user reloading the page.

Source: code, jira (INTDEV-1344)

#### Scenario: Title changed by another user

- **GIVEN** Alice has card `test_abc123` open
- **WHEN** Bob renames it to Renamed
- **THEN** Alice's card heading reads Renamed
- **AND** her breadcrumbs show Renamed - test_abc123

### Requirement: Users who can edit are told who changed the open card

When another user changes the open card, a user who can edit SHALL see a notice naming that user, such as Bob updated this card; users who cannot edit SHALL see the refreshed card without a notice.

Source: code

#### Scenario: Notice for a user who can edit

- **GIVEN** Alice, who can edit, has card `test_abc123` open
- **WHEN** Bob changes the card
- **THEN** a notice says Bob updated this card

#### Scenario: No notice without edit rights

- **GIVEN** Carol, who cannot edit, has the card open
- **WHEN** Bob changes the card
- **THEN** Carol sees the new content
- **AND** no notice is shown

### Requirement: A change made by the user themselves raises no notice

A change made by the current user, in this or another tab of theirs, SHALL NOT show the other-user notice.

Source: code

#### Scenario: Own save

- **GIVEN** Alice has the card open
- **WHEN** Alice saves the card
- **THEN** no Alice updated this card notice is shown

### Requirement: A change to another card does not refresh the open card

A change to a card other than the one that is open SHALL NOT refresh the open card or show a notice.

Source: code

#### Scenario: Other card written

- **GIVEN** Alice has `test_abc123` open
- **WHEN** Bob changes `test_def456`
- **THEN** Alice's view and notices stay as they were

### Requirement: A change while the user is editing is announced and the draft kept

When another user saves the card while the current user is editing it, a notice SHALL say that the user saved changes while the current user is editing and that the draft is unchanged, and the editor SHALL keep the unsaved draft; cancelling the edit then shows the other user's saved content.

Source: code

#### Scenario: Concurrent edit

- **GIVEN** Alice is editing card content and has typed Alice unsaved draft
- **WHEN** Bob saves the content Bob saved content
- **THEN** a warning says Bob saved changes to this card while she is editing and her draft is unchanged
- **AND** the editor still holds Alice unsaved draft

#### Scenario: Cancel shows the new content

- **GIVEN** the warning has been shown to Alice
- **WHEN** Alice cancels her edit
- **THEN** the card shows Bob saved content

### Requirement: A lost live connection is shown with a way to reload

When the app stops receiving live updates, it SHALL show a banner at the top of the page saying live updates are disconnected and the page may show stale content, with a Reload control; the banner SHALL disappear when updates resume.

Source: code

#### Scenario: Connection lost

- **GIVEN** a project page is open
- **WHEN** live updates stop arriving
- **THEN** a banner reads Live updates are disconnected. This page may be showing stale content.
- **AND** clicking Reload reloads the page

#### Scenario: Connection restored

- **GIVEN** the banner is shown
- **WHEN** the connection is re-established
- **THEN** the banner disappears
