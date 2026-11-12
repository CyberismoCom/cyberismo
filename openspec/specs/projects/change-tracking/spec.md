# projects/change-tracking Specification

## Purpose

What a write to a project leaves in its history and who is told about it. This capability covers commits made by the project itself, who they are attributed to, the all-or-nothing nature of a write and the change events published for each write; delivering those events to browsers is specified in `rest/events` and `ui/collaboration`.

## Requirements

### Requirement: Without autocommit writes are left uncommitted

When autocommit is off, a write SHALL change the project's files and SHALL NOT make a commit.

Source: docs

#### Scenario: Edit without autocommit

- **GIVEN** a project in a git repository with autocommit off
- **WHEN** the content of a card is edited
- **THEN** the repository has the card's file as an uncommitted change
- **AND** the number of commits is unchanged

### Requirement: With autocommit each write is one commit of its own

When autocommit is on, each outermost write SHALL make exactly one commit that contains the whole write and leaves the project with no uncommitted changes, and the message of the commit SHALL name the operation.

Source: code

#### Scenario: Card edit

- **GIVEN** a project with autocommit on
- **WHEN** the content of the card `decision_5` is edited
- **THEN** one commit is added, with the message Edit content of decision_5
- **AND** the working tree is clean

#### Scenario: Resource creation

- **WHEN** the field type `newField` is created
- **THEN** one commit is added, with the message Create field type newField

#### Scenario: Project setting

- **WHEN** the project name is changed
- **THEN** one commit is added, with the message Set project name

### Requirement: A commit is authored by the acting user

A commit made for a write SHALL be authored by the identity of the user the write was made as, and not by a user that merely shares the project.

Source: code

#### Scenario: Two users write in turn

- **GIVEN** a project with autocommit on and the users Ann and Bob working on it
- **WHEN** Ann adds the label first to a card and then Bob adds the label second to it
- **THEN** the first commit is authored by Ann and the second by Bob

### Requirement: An atomic write is one commit with the given message

Several operations performed together as one atomic write SHALL make one commit, with the message given to the atomic write.

Source: code

#### Scenario: Three settings in one write

- **GIVEN** a project with autocommit on
- **WHEN** the name, description and category are set in one atomic write named Update project settings
- **THEN** one commit is added, with the message Update project settings

### Requirement: A write that changes nothing makes no commit

A write that leaves the project's files unchanged SHALL NOT make a commit.

Source: code

#### Scenario: Empty atomic write

- **GIVEN** a project with autocommit on
- **WHEN** an atomic write that changes nothing completes
- **THEN** the number of commits is unchanged

### Requirement: A failed write is undone under autocommit

When autocommit is on and a write fails, the project's files SHALL be restored to the last commit, including any new files, and the error SHALL be returned.

Source: code

#### Scenario: Atomic write fails after editing

- **GIVEN** a project with autocommit on
- **WHEN** an atomic write edits a card and then fails with the error boom
- **THEN** the write is refused with boom
- **AND** the card has its earlier content

### Requirement: A failed write is not undone without autocommit

When autocommit is off and a write fails after changing files, the changes SHALL remain on disk and subscribers SHALL be told to reload the project.

Source: code

#### Scenario: Failure without autocommit

- **GIVEN** a project with autocommit off
- **WHEN** an atomic write edits a card and then fails
- **THEN** the card keeps the edit
- **AND** one change event with the cause failed-write and the change project reloaded is published

### Requirement: Every write that changes the project publishes one change event

Each write to a project, whoever made it, SHALL publish one change event to the subscribers of the project after the write has completed, and no event for a write that changed nothing.

Source: code

#### Scenario: Two edits

- **GIVEN** a subscriber to the changes of the project `decision`
- **WHEN** two cards are edited one after the other
- **THEN** two events are received, in order

#### Scenario: Write that changed nothing

- **WHEN** an atomic write that changes nothing completes
- **THEN** no event is published

### Requirement: A change event names its project, actor and cause

A change event SHALL name the project, the actor of the write, the cause, the time and a revision that grows by one for each event while the project stays open, and SHALL NOT contain the actor's email address.

Source: code

#### Scenario: Event of an edit

- **GIVEN** a user Writer with the email writer@example.com edits `decision_5`
- **WHEN** the event is received
- **THEN** it names the project `decision`, the actor Writer, the cause direct and the revision 1
- **AND** it does not contain writer@example.com

### Requirement: A change event names the cards that changed

A change event SHALL list each card the write updated or removed by its key, including the target of a link and every card of a removed subtree.

Source: code

#### Scenario: Link between two cards

- **WHEN** a link is added from `decision_5` to `decision_6`
- **THEN** the event lists both cards as updated

#### Scenario: Subtree removal

- **WHEN** `decision_5` and its child `decision_6` are removed
- **THEN** the event lists both cards as removed

### Requirement: A change event names the configuration that changed

A change event SHALL name each resource a write changed, including the old and the new name of a renamed resource, SHALL say that the settings changed for a settings write or version bump, and SHALL say that the project was reloaded for a prefix rename.

Source: code

#### Scenario: Resource rename

- **WHEN** the report `decision/reports/testReport` is renamed to renamed
- **THEN** the event lists both resource names as changed

#### Scenario: Prefix rename

- **WHEN** the project prefix is renamed
- **THEN** the event says only that the project was reloaded

### Requirement: A change event carries the commit made by its write

Under autocommit a change event SHALL carry the full identifier of the commit its write made.

Source: code

#### Scenario: Event with commit

- **GIVEN** a project with autocommit on
- **WHEN** a card is edited
- **THEN** the event carries the identifier of the latest commit

### Requirement: No event is published for a write that was undone

A write that was rolled back SHALL NOT publish an event.

Source: code

#### Scenario: Rolled back write

- **GIVEN** a project with autocommit on
- **WHEN** an atomic write fails after editing a card
- **THEN** no event is published

### Requirement: A failing subscriber does not disturb the write

An error raised by a subscriber SHALL NOT fail the write and SHALL NOT stop the other subscribers from receiving the event.

Source: code

#### Scenario: Listener throws

- **GIVEN** two subscribers where the first throws
- **WHEN** a card is edited
- **THEN** the edit succeeds
- **AND** both subscribers have been called

### Requirement: A write made by a subscriber is a write of its own

A write made by a subscriber while handling an event SHALL be committed as its own actor in its own commit and publish its own event with the next revision.

Source: code

#### Scenario: Follow-up by a connector

- **GIVEN** a connector Bot that edits `decision_6` whenever Writer writes, and autocommit on
- **WHEN** Writer edits `decision_5`
- **THEN** the events are revision 1 by Writer and revision 2 by Bot
- **AND** the commits are authored by Writer and by Bot respectively
