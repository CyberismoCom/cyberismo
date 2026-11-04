# cards/attachments Specification

## Purpose

Files attached to a card: adding, reading, listing, renaming and removing them, and refusing names that would reach outside the card. Inserting references into content belongs to `ui/card-editor` and the image macro to `macros`. Cards of installed modules are read-only as specified in `resources`.

## Requirements

### Requirement: An attachment is added to a card under a file name

Adding an attachment SHALL store the given data on the card under the given file name, so that it is listed and can be read back with its media type.

Source: both

#### Scenario: Add a PNG

- **GIVEN** the card A with no attachments
- **WHEN** the data `png-bytes` is added to A as `pic.png`
- **THEN** the attachments of the project list `pic.png` on A with the media type `image/png`
- **AND** reading `pic.png` of A returns the bytes `png-bytes` with the media type `image/png`

### Requirement: Adding with a path uses the file's own name

When the given name is a path, the attachment SHALL be stored under the last part of the path only.

Source: code

#### Scenario: Path given

- **GIVEN** a file `/work/note.txt`
- **WHEN** its data is added to A with the name `/work/note.txt`
- **THEN** A has the attachment `note.txt`

### Requirement: An attachment name cannot be added twice to a card

Adding an attachment with a name the card already has MUST be refused and the existing attachment SHALL be kept.

Source: code

#### Scenario: Duplicate name

- **GIVEN** A with the attachment `a.txt`
- **WHEN** other data is added to A as `a.txt`
- **THEN** the addition is refused with an error naming `a.txt`
- **AND** reading `a.txt` returns the original data

### Requirement: Attachments are listed for all project and template cards

Listing attachments SHALL return every attachment of project cards and template cards, ordered by card and then file name.

Source: code

#### Scenario: Project and template attachments

- **GIVEN** attachments `a.txt` and `b.txt` on A, `z.txt` on B, and `m.txt` on a template card
- **WHEN** the attachments are listed
- **THEN** all four are listed, each with its card key and file name, ordered by card key and then file name

### Requirement: Removing an attachment removes the file and keeps the others

Removing an attachment SHALL delete it from the card and keep the card's other attachments.

Source: both

#### Scenario: Remove one of two

- **GIVEN** A with `a.txt` and `b.txt`
- **WHEN** `a.txt` is removed from A
- **THEN** A has only `b.txt`

### Requirement: Renaming an attachment keeps its content

Renaming an attachment SHALL give the file the new name and keep its content.

Source: code

#### Scenario: Rename

- **GIVEN** A with `a.txt` holding `ay`
- **WHEN** `a.txt` is renamed to `c.txt`
- **THEN** reading `c.txt` of A returns `ay`
- **AND** A has no attachment `a.txt`

### Requirement: Renaming onto an existing name is refused

Renaming an attachment MUST be refused when the card already has an attachment with the new name.

Source: code

#### Scenario: Name taken

- **GIVEN** A with `a.txt` and `b.txt`
- **WHEN** `a.txt` is renamed to `b.txt`
- **THEN** the rename is refused with an error naming `b.txt`
- **AND** both attachments are unchanged

### Requirement: Removing or reading an attachment the card lacks is refused

Removing, renaming or reading an attachment the card does not have MUST be refused with an error naming the file.

Source: code

#### Scenario: Unknown attachment

- **GIVEN** A without `nope.txt`
- **WHEN** `nope.txt` of A is removed
- **THEN** the removal is refused with an error naming `nope.txt`

#### Scenario: Read unknown

- **WHEN** `nope.txt` of A is read
- **THEN** the read is refused with an error saying the attachment was not found

### Requirement: Attachment names must be plain file names

Removing or renaming an attachment MUST be refused when a name points outside the card's own attachments.

Source: code, jira (INTDEV-1240)

#### Scenario: Traversing name

- **GIVEN** A with `a.txt`
- **WHEN** the attachment `../secret.txt` of A is removed
- **THEN** the removal is refused with an error saying the file name is invalid
- **AND** no file outside A's attachments is removed

#### Scenario: Renaming to a path

- **WHEN** `a.txt` is renamed to `sub/c.txt`
- **THEN** the rename is refused with an error saying the file name is invalid

### Requirement: Attachment operations require a card key and a file name

Reading an attachment MUST be refused without a card key, and removing one MUST be refused without a file name.

Source: code

#### Scenario: No card key

- **WHEN** `a.txt` is read with the card key ``
- **THEN** the read is refused with an error saying the card key is mandatory

#### Scenario: No file name

- **WHEN** an attachment of A is removed without a file name
- **THEN** the removal is refused with an error saying a file name is required

### Requirement: Attachments of missing cards are refused

Adding or removing an attachment MUST be refused when the card does not exist.

Source: code

#### Scenario: Missing card

- **WHEN** data is added as `x.txt` to `test_zzzzzzzz`
- **THEN** the addition is refused with an error naming `test_zzzzzzzz`
- **AND** the project is unchanged
