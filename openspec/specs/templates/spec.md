# templates Specification

## Purpose

Templates as resources whose cards are patterns for new content: the template's descriptive properties, adding cards to its card tree, editing and removing template cards, and what renaming a template does. Making cards from a template belongs to `cards/creation`; the shared resource lifecycle, including what removing a template does to text that mentions it, and the read-only status of installed modules' templates, to `resources`.

## Requirements

### Requirement: A template holds a tree of cards

A template SHALL hold zero or more cards arranged in a hierarchy of any depth.

Source: both

#### Scenario: Template with a hierarchy

- **GIVEN** the template `decision/templates/simplepage` with three cards
- **WHEN** the template's cards are listed
- **THEN** three cards are listed

### Requirement: A new template has no cards

A newly created template SHALL contain no cards.

Source: code

#### Scenario: Empty template

- **WHEN** the template `test/templates/fresh` is created
- **THEN** it holds zero cards

### Requirement: A template has a display name, description and category

A template SHALL be able to have a display name, a description and a category, which are shown to users who create cards from it.

Source: both

#### Scenario: Show details

- **GIVEN** the template `decision/templates/decision` with the display name Decision, the description `description` and the category `category`
- **WHEN** the template is shown
- **THEN** the display name, description and category are returned

### Requirement: A template shows its number of cards

Showing a template SHALL report how many cards it holds.

Source: code

#### Scenario: One card

- **GIVEN** the template `test/templates/blueprint` with one card
- **WHEN** the template is shown
- **THEN** the number of cards is 1

### Requirement: Cards are added to a template with a card type

Adding cards to a template SHALL add cards of the given card type to the template's top level.

Source: both

#### Scenario: Two top-level cards

- **GIVEN** the template `test/templates/tpl`
- **WHEN** two cards of type `test/cardTypes/page` are added to it
- **THEN** two new keys are returned
- **AND** both cards have the parent `root` and the card type `test/cardTypes/page`

### Requirement: Cards can be added under a template card

Adding cards to a template with a template card as the parent SHALL add them as children of that card.

Source: both

#### Scenario: Child card

- **GIVEN** the template card T1 of `test/templates/tpl`
- **WHEN** a card of type `test/cardTypes/page` is added to the template under T1
- **THEN** the new card's parent is T1

### Requirement: The parent must belong to the same template

Adding a card under a card that is not part of the template MUST be refused, and so MUST a missing parent.

Source: code

#### Scenario: Parent from another template

- **GIVEN** a card of `mod/templates/mt`
- **WHEN** a card is added to `test/templates/tpl` under it
- **THEN** it is refused with an error saying the card is not part of the template

#### Scenario: Missing parent

- **WHEN** a card is added to `test/templates/tpl` under `test_zzzzzzzz`
- **THEN** it is refused with a card-not-found error

### Requirement: Adding cards needs an existing template, an existing card type and a count of at least one

Adding cards to a template MUST be refused, leaving the project unchanged, for an empty template name, an unknown template, an unknown card type, or a count below one.

Source: code

#### Scenario: Empty name

- **WHEN** a card is added to the template with the name ``
- **THEN** it is refused with an error saying the template name is invalid

#### Scenario: Count zero

- **WHEN** zero cards are added to `test/templates/tpl`
- **THEN** it is refused with an error naming the count value

#### Scenario: Unknown card type

- **WHEN** a card of the card type `test/cardTypes/nope` is added to `test/templates/tpl`
- **THEN** it is refused with an error naming `nope`

### Requirement: Template card attachments are listed with the template

The attachments of the cards of a template SHALL be readable from the template's card tree.

Source: code

#### Scenario: Template with an attachment

- **GIVEN** the template `decision/templates/decision` whose card `decision_1` has the attachment `the-needle.heic`
- **WHEN** the attachments of the template are listed
- **THEN** one attachment is listed, `the-needle.heic` of `decision_1`

### Requirement: Template cards are not subject to editing and removal denials

Editing the content or a field of a template card, or removing it, SHALL be allowed even when rules deny those operations on every card.

Source: code

#### Scenario: Deny-all rules

- **GIVEN** rules denying content edits, field edits and deletion of every card
- **WHEN** a template card's content is edited, its title is changed and it is removed
- **THEN** all three succeed

### Requirement: Renaming a template keeps its cards

Renaming a template SHALL move its cards to the new name, so that the old name has no cards and cards can be created from the new name at once.

Source: both

#### Scenario: Rename

- **GIVEN** the template `decision/templates/decision` with its cards
- **WHEN** it is renamed to `decision-v2`
- **THEN** `decision/templates/decision-v2` holds the same card keys
- **AND** creating cards from `decision/templates/decision-v2` creates the same number of cards
