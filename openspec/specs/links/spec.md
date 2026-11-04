# links Specification

## Purpose

Link types and the links between cards: how a link type is defined, how links are created and removed under its constraints, how links to external items work, and what changing or removing a link type does to existing links. The general resource lifecycle belongs to `resources`; how links are shown belongs to `ui/card-view`.

## Requirements

### Requirement: A new link type has default names and no restrictions

A newly created link type SHALL have both display names equal to its full name, no source or destination card type restrictions, and link descriptions disabled.

Source: code

#### Scenario: Link type created with defaults

- **WHEN** the link type `fresh` is created in the project `test`
- **THEN** its outbound and inbound display names are `test/linkTypes/fresh`
- **AND** its source and destination card types are empty
- **AND** link descriptions are not enabled

### Requirement: A link type has outbound and inbound display names

A link type SHALL have an outbound display name for the from-to direction and an inbound display name for the to-from direction, each of which can be changed.

Source: both

#### Scenario: Change display names

- **GIVEN** the link type `test/linkTypes/rel`
- **WHEN** its outbound display name is changed to `leads to` and its inbound display name to `led by`
- **THEN** the link type shows `leads to` and `led by`

### Requirement: A link type controls whether links carry a description

A link type SHALL have a switch that controls whether links of that type may have a description.

Source: both

#### Scenario: Enable descriptions

- **GIVEN** the link type `test/linkTypes/rel` with descriptions disabled
- **WHEN** link descriptions are enabled
- **THEN** the link type shows descriptions as enabled

### Requirement: Source and destination card types restrict a link type

A link type SHALL allow all card types as source, or as destination, when its list is empty, and only the listed card types otherwise.

Source: both

#### Scenario: Restricted link type

- **GIVEN** the link type `test/linkTypes/note` with the source `test/cardTypes/page` and the destination `test/cardTypes/memo`
- **WHEN** a link of that type is added from a card of type `page` to a card of type `memo`
- **THEN** the link is created

### Requirement: Card types can be added to and removed from a link type's lists

Source and destination card type lists SHALL be editable by adding a card type, removing one, or replacing one with another.

Source: both

#### Scenario: Add then remove

- **GIVEN** the link type `test/linkTypes/rel`
- **WHEN** `test/cardTypes/bare` is added to its source card types and then removed
- **THEN** after the addition the list contains `test/cardTypes/bare`
- **AND** after the removal it does not

#### Scenario: Replace

- **GIVEN** `test/cardTypes/bare` in the destination card types
- **WHEN** it is replaced by `test/cardTypes/renamed`
- **THEN** the list contains `test/cardTypes/renamed` and not `test/cardTypes/bare`

### Requirement: Adding a card type already listed or removing one not listed is refused

Editing the card type lists MUST be refused, leaving the link type unchanged, when the card type to add is already listed or the card type to remove is not listed.

Source: code

#### Scenario: Already listed

- **GIVEN** `test/cardTypes/page` in the source card types of `test/linkTypes/rel`
- **WHEN** `test/cardTypes/page` is added to the source card types
- **THEN** the edit is refused with an error saying it already exists

#### Scenario: Not listed

- **WHEN** `test/cardTypes/bare`, which is not listed, is removed from the source card types
- **THEN** the edit is refused with an error naming the list sourceCardTypes

### Requirement: A link type can restrict external links to connectors

A link type SHALL list the connectors that may be the destination of its external links, and external links to other connectors MUST be refused.

Source: code

#### Scenario: Connector not allowed

- **GIVEN** the link type `test/linkTypes/jiraOnly` with the destination connector `jira`
- **WHEN** a link of that type is added from the card B to `other:1`
- **THEN** it is refused with an error saying the link type does not support the connector `other`

### Requirement: A link is stored on its source card

Adding a link SHALL record it on the source card only, with the link type, the destination card and the description if given.

Source: both

#### Scenario: Link from B to A

- **GIVEN** the cards A and B and the link type `test/linkTypes/rel`
- **WHEN** a link of that type is added from B to A
- **THEN** B holds a link of type `test/linkTypes/rel` to A
- **AND** A gains no link of its own for it

### Requirement: A link description is stored when the link type allows it

A link SHALL carry the given description when its link type enables descriptions, and adding a description to a link of a type that does not MUST be refused.

Source: both

#### Scenario: Described link

- **GIVEN** the link type `test/linkTypes/described` with descriptions enabled
- **WHEN** a link of that type is added from B to C with the description `because`
- **THEN** B's link has the description `because`

#### Scenario: Not allowed

- **WHEN** a link of `test/linkTypes/rel` is added from B to A with the description `x`
- **THEN** it is refused with an error saying the link type does not allow link descriptions

### Requirement: A card cannot be linked to itself

Adding a link from a card to the same card MUST be refused.

Source: code

#### Scenario: Self link

- **WHEN** a link is added from B to B
- **THEN** it is refused with an error saying a card cannot link to itself
- **AND** the project is unchanged

### Requirement: The same link cannot exist twice

Adding a link that the source card already has, with the same link type, destination and direction, MUST be refused.

Source: code

#### Scenario: Duplicate link

- **GIVEN** a link of type `rel` from A to B
- **WHEN** the same link is added again
- **THEN** it is refused with an error saying the link already exists

### Requirement: A link must satisfy its link type's card type constraints

Adding a link MUST be refused when the source card's card type, or the destination card's card type, is not allowed by the link type.

Source: both

#### Scenario: Source type excluded

- **GIVEN** `test/linkTypes/note` with the source card type `page`, and C of card type `memo`
- **WHEN** a link of that type is added from C to A
- **THEN** it is refused with an error saying the card type cannot be used as source

#### Scenario: Destination type excluded

- **WHEN** a link of `test/linkTypes/note` is added from B, a `page`, to A, a `page`
- **THEN** it is refused with an error saying the card type cannot be used as destination

### Requirement: A link needs an existing link type and existing cards

Adding a link MUST be refused when the link type or either card does not exist.

Source: code

#### Scenario: Unknown link type

- **WHEN** a link of `test/linkTypes/nope` is added from B to A
- **THEN** it is refused with an error naming `nope`

#### Scenario: Missing source card

- **WHEN** a link is added from `test_zzzzzzzz` to A
- **THEN** it is refused with a card-not-found error

### Requirement: An external link names a connector and an item key

A link to an external item SHALL be written `<connector>:<item key>` and be stored on the card as an external link with its link type, connector, item key and direction.

Source: code

#### Scenario: Outbound external link

- **WHEN** a link of type `rel` is added from B to `jira:P-2`
- **THEN** B holds an external link of type `rel` to the item `P-2` of the connector `jira` with the direction outbound
- **AND** B's card links are unchanged

### Requirement: The direction of an external link follows the order or the given direction

An external link SHALL be outbound when the card is the source and inbound when the external item is the source, unless a direction is given.

Source: code

#### Scenario: Inbound by order

- **WHEN** a link of type `rel` is added from `jira:P-3` to B
- **THEN** B holds an external link to `P-3` with the direction inbound

#### Scenario: Direction given

- **WHEN** a link of type `rel` is added from B to `jira:P-4` with the direction inbound
- **THEN** B holds an external link to `P-4` with the direction inbound

### Requirement: Invalid external links are refused

Adding or removing a link MUST be refused when both ends are external items, when the item key is missing, or, for adding, when the external link already exists.

Source: code

#### Scenario: Two external items

- **WHEN** a link is added from `a:1` to `b:2`
- **THEN** it is refused with an error saying two external items cannot be linked

#### Scenario: No item key

- **WHEN** a link is added from B to `jira:`
- **THEN** it is refused with an error saying the external item format is invalid

#### Scenario: Existing external link

- **GIVEN** A holds an external link of type `rel` to `jira:P-1`
- **WHEN** the same link is added from A to `jira:P-1`
- **THEN** it is refused with an error saying the link already exists

### Requirement: Removing a link removes only the matching link

Removing a link SHALL remove the one link of the source card with the given link type, destination and description, and keep its other links.

Source: code

#### Scenario: Remove described link

- **GIVEN** A with a `rel` link to B and a `described` link to C with the description `why`
- **WHEN** the `described` link to C with the description `why` is removed from A
- **THEN** A's links are the `rel` link to B

### Requirement: Removing a link that does not exist is refused

Removing a link MUST be refused, leaving the project unchanged, when the card has no link matching the type, destination and description, or the card does not exist.

Source: code

#### Scenario: Other description

- **WHEN** the `described` link from A to C is removed with the description `else`
- **THEN** it is refused with an error saying the link was not found

### Requirement: Removing an external link matches item, direction and type

Removing an external link SHALL remove the one external link of the card with the given item, direction and link type, and MUST be refused when none matches.

Source: code

#### Scenario: Remove by item

- **GIVEN** A holds an outbound external link of type `rel` to `jira:P-1`
- **WHEN** that link is removed from A
- **THEN** A has no external links

#### Scenario: Wrong direction

- **WHEN** the same link is removed from A with the direction inbound
- **THEN** it is refused with an error saying the external link was not found

### Requirement: Renaming a link type renames it in existing links

Renaming a link type SHALL rewrite the link type name in every link of the project's cards that uses it.

Source: both, jira (INTDEV-1146)

#### Scenario: Rename

- **GIVEN** cards with links of type `test/linkTypes/rel`
- **WHEN** the link type is renamed to `tie`
- **THEN** those links have the link type `test/linkTypes/tie`
- **AND** `test/linkTypes/rel` is no longer found

### Requirement: Removing a link type removes its links

Removing a link type SHALL remove every link of that type from the project's cards.

Source: code

#### Scenario: Delete

- **GIVEN** cards with links of type `test/linkTypes/rel`
- **WHEN** the link type is removed
- **THEN** no card has a link of that type

### Requirement: Link type changes leave installed module cards alone

Renaming or removing a project's link type SHALL NOT rewrite links on cards that belong to installed modules.

Source: code

#### Scenario: Module card keeps its link

- **GIVEN** a module template card with a link of type `decision/linkTypes/test`
- **WHEN** the project's link type `decision/linkTypes/test` is removed
- **THEN** the module card still has that link
- **AND** project cards no longer have it
