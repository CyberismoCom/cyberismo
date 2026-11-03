# cards/hierarchy Specification

## Purpose

Where a card sits in the card tree: moving it to another parent or to the root, ranking it among its siblings, rebalancing ranks, and removing a card with its descendants. Denial of moves and deletions is owned by `logic/operation-rules` and template card trees by `templates`. Cards of installed modules are read-only as specified in `resources`.

## Requirements

### Requirement: Moving a card puts it under the new parent

Moving a card to another card SHALL make the card a child of that card.

Source: both

#### Scenario: Move under a card

- **GIVEN** the card a with children a1 and a2, and the card b
- **WHEN** a1 is moved to b
- **THEN** a1's parent is b
- **AND** a's children are a2 only

### Requirement: A card can be moved to the root as the last root card

Moving a card to the destination `root` SHALL make it a root card ranked after every existing root card.

Source: both

#### Scenario: Move to root

- **GIVEN** root cards a, b and c, and a1 under a
- **WHEN** a1 is moved to `root`
- **THEN** a1's parent is `root`
- **AND** the root cards in rank order are a, b, c, a1

### Requirement: Moving a card moves its descendants with it

Moving a card SHALL keep its subtree intact under the card.

Source: code

#### Scenario: Subtree moves

- **GIVEN** the card a with children a1 and a2, and the card b
- **WHEN** a is moved to b
- **THEN** b's children are a
- **AND** a's children are still a1 and a2

### Requirement: Moving a card to its current parent changes nothing

Moving a card to the parent it already has SHALL change nothing, and SHALL NOT consult denial rules.

Source: code

#### Scenario: Already there

- **GIVEN** a1 under a, and a rule denying any move of a1
- **WHEN** a1 is moved to a
- **THEN** the move succeeds
- **AND** the project is unchanged

### Requirement: Template cards can be moved between templates

A card of a project's own template SHALL be movable under a card of another template or to the root of another template.

Source: code, jira (INTDEV-1250)

#### Scenario: Move between templates

- **GIVEN** the template `test/templates/tpl` with T1 over T2, and the template `test/templates/other` with U1
- **WHEN** T2 is moved to U1
- **THEN** T2's parent is U1
- **AND** the children of U1 are T2

### Requirement: A card cannot be moved into itself, its own descendant or the root card

Moving MUST be refused, leaving the project unchanged, when the destination is the card itself or one of its descendants, or when the card moved is `root`.

Source: code

#### Scenario: Into own descendant

- **GIVEN** a with child a1
- **WHEN** a is moved to a1
- **THEN** the move is refused with an error naming a cycle
- **AND** the project is unchanged

#### Scenario: Into itself

- **WHEN** b is moved to b
- **THEN** the move is refused with an error saying a card cannot be moved to itself

### Requirement: A card cannot be moved between the project and a template

Moving a project card into a template, or a template card into the project, MUST be refused as a container mismatch.

Source: code

#### Scenario: Project card into a template

- **GIVEN** the project card b and the template card T1
- **WHEN** b is moved to T1
- **THEN** the move is refused with a container-mismatch error
- **AND** the project is unchanged

### Requirement: Moving is refused for missing cards

Moving MUST be refused with a card-not-found error when the card or the destination does not exist.

Source: code

#### Scenario: Missing destination

- **WHEN** b is moved to `test_zzzzzzzz`
- **THEN** the move is refused with a card-not-found error

### Requirement: A card can be ranked after a sibling

Ranking a card after a sibling SHALL place it immediately after that sibling and leave the order of the other siblings unchanged.

Source: both

#### Scenario: Rank after

- **GIVEN** root cards a, b, c, d, p in that order
- **WHEN** d is ranked after a
- **THEN** the root cards are a, d, b, c, p

### Requirement: A card can be ranked first

Ranking a card first SHALL place it before all its siblings; for a card already first nothing changes.

Source: both

#### Scenario: Rank first

- **GIVEN** root cards a, b, c, d, p
- **WHEN** c is ranked first
- **THEN** the root cards are c, a, b, d, p

### Requirement: A card can be ranked at an index among its siblings

Ranking a card at a zero-based index SHALL place it at that position among its siblings, with the sibling count meaning last.

Source: both

#### Scenario: Index in the middle

- **GIVEN** root cards a, b, c, d, p
- **WHEN** a is ranked at index 2
- **THEN** the root cards are b, a, c, d, p

#### Scenario: Index equal to the sibling count

- **WHEN** a is ranked at index 5
- **THEN** the root cards are b, c, d, p, a

### Requirement: Ranking orders only the card's own siblings

Ranking a card SHALL change the order only among the cards that share its parent.

Source: code

#### Scenario: Under a parent

- **GIVEN** p with children x, y, z
- **WHEN** z is ranked after x
- **THEN** p's children are x, z, y
- **AND** the root cards are unchanged

### Requirement: Invalid ranking is refused

Ranking MUST be refused, leaving the project unchanged, when the card is ranked after itself, after a card with another parent or in another container, when the card or the card it is ranked after does not exist, or at a negative index or past the sibling count.

Source: code

#### Scenario: Different parent

- **GIVEN** root card a and card x under p
- **WHEN** a is ranked after x
- **THEN** the ranking is refused with an error saying the cards must have the same parent

#### Scenario: Index out of bounds

- **WHEN** a is ranked at index 6 among five root cards
- **THEN** the ranking is refused with an error saying the index is out of bounds

#### Scenario: Negative index

- **WHEN** a is ranked at index -1
- **THEN** the ranking is refused with an error saying the index must be greater than 0

### Requirement: Rebalancing renumbers the ranks of one parent's children

Rebalancing a card's children SHALL renumber their ranks, keeping their order and leaving other cards' ranks unchanged.

Source: code

#### Scenario: One parent rebalanced

- **GIVEN** the parents p and q with four children each, whose ranks were lengthened by repeated ranking
- **WHEN** the children of p are rebalanced
- **THEN** p's children are in the same order with shorter ranks
- **AND** the ranks of q's children are unchanged

### Requirement: Rebalancing everything leaves installed modules alone

Rebalancing the whole project SHALL renumber the ranks of the project's cards and its own templates' cards and SHALL NOT change cards of installed modules.

Source: code

#### Scenario: Whole project

- **GIVEN** crowded ranks among project cards and an installed module
- **WHEN** the whole project is rebalanced
- **THEN** the project cards' ranks are shorter
- **AND** the module's cards are unchanged

### Requirement: Removing a card removes its descendants

Removing a card SHALL remove it and all its descendants, so that none can be read any more.

Source: both

#### Scenario: Remove a parent

- **GIVEN** P with children c1 and c2
- **WHEN** P is removed
- **THEN** P, c1 and c2 are no longer found
- **AND** the root cards are the remaining cards

### Requirement: Removing a card removes links pointing to it

Removing a card SHALL remove every link of other cards that points to a removed card, leaving their other links and other cards untouched.

Source: code, jira (INTDEV-1167)

#### Scenario: Links to removed cards

- **GIVEN** Q linking to c1 and R, and R linking to P and Q, where P has the child c1
- **WHEN** P is removed
- **THEN** Q's links point only to R
- **AND** R's links point only to Q

### Requirement: Template cards can be removed with their descendants

Removing a card of a project's own template SHALL remove it and its descendants.

Source: code

#### Scenario: Template card removed

- **GIVEN** the template card T1 with child T2
- **WHEN** T1 is removed
- **THEN** T1 and T2 are no longer found

### Requirement: Removing cards leaves cards created from a template alone

Removing a template card SHALL NOT remove cards that were created from it.

Source: code

#### Scenario: Created card survives

- **GIVEN** the card C created from the template card T1 of `test/templates/tpl`
- **WHEN** T1 is removed
- **THEN** C is still found

### Requirement: Removing a missing card is refused

Removing a card that does not exist MUST be refused with a card-not-found error, leaving the project unchanged.

Source: code

#### Scenario: Missing card

- **WHEN** `test_zzzzzzzz` is removed
- **THEN** the removal is refused with a card-not-found error
