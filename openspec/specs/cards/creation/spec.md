# cards/creation Specification

## Purpose

Creating cards from a template: where the new cards are placed, how their keys are formed, how the template's card tree and content are carried into the new cards, and creating cards from CSV rows. The starting workflow state is owned by `workflows`, template definition by `templates`, and field value rules by `fields/field-values`.

## Requirements

### Requirement: Creating from a template makes one card per template card

Creating cards from a template SHALL create one new card for every card in the template, and return the new cards.

Source: both

#### Scenario: Three-card template

- **GIVEN** the template `test/templates/tpl` with the card T1 that has the children T2 and T3
- **WHEN** cards are created from `test/templates/tpl`
- **THEN** three cards are returned
- **AND** their titles are T1, T2 and T3

### Requirement: Created cards form the same hierarchy as the template cards

The new cards SHALL have the same parent-child structure as the template cards they come from.

Source: both

#### Scenario: Children stay under their parent

- **GIVEN** the template `test/templates/tpl` with T1 over T2 and T3
- **WHEN** cards are created from `test/templates/tpl`
- **THEN** the new T1 has the parent `root`
- **AND** the new T2 and T3 have the new T1 as their parent

### Requirement: New cards get new unique keys with the project prefix

Every created card SHALL get a card key of the form `<prefix>_<id>` where the prefix is the project prefix, and the key MUST differ from the key of every existing card and template card.

Source: both

#### Scenario: Key of a created card

- **GIVEN** a project with the prefix `test` and the template `test/templates/tpl` whose card has the key `test_aaaaaaa1`
- **WHEN** cards are created from `test/templates/tpl`
- **THEN** the new card has a key starting with `test_`
- **AND** the key is not `test_aaaaaaa1`

### Requirement: Cards created without a parent are placed at the root after the existing root cards

When no parent card is given, the new top-level card SHALL be placed at the root, ranked after every existing root card.

Source: code

#### Scenario: Created at the root

- **GIVEN** a project whose only root card is Parent
- **WHEN** cards are created from `test/templates/tpl` without a parent
- **THEN** the root cards in rank order are Parent, then the new T1

### Requirement: Cards created under a parent are placed after its existing children

When a parent card is given, the new top-level card SHALL become a child of that card, ranked after the children it already has.

Source: both

#### Scenario: Two creations under the same parent

- **GIVEN** the card Parent without children
- **WHEN** cards are created from `test/templates/tpl` under Parent twice
- **THEN** Parent's children in rank order are the first new card, then the second

### Requirement: Created cards keep the order of the template cards

Created sibling cards SHALL be in the same order as the template cards they come from.

Source: docs

#### Scenario: Siblings keep their order

- **GIVEN** the template `test/templates/tpl` with the sibling cards T2 then T3 under T1
- **WHEN** cards are created from `test/templates/tpl`
- **THEN** the new children of the new T1 are in the order T2, T3

### Requirement: Created cards carry title, card type, labels, content and field values from the template card

A created card SHALL have the title, card type, labels, content and custom field values of its template card.

Source: code

#### Scenario: Values carried over

- **GIVEN** the template card T1 with the label `l`, the content `body` and the integer field `test/fieldTypes/size` set to 4
- **WHEN** cards are created from its template
- **THEN** the new card has the title T1, the labels `l`, the content `body` and `test/fieldTypes/size` 4

### Requirement: A created card records the template card it came from

A created card SHALL record the key of the template card it was made from.

Source: code

#### Scenario: Template card key recorded

- **GIVEN** the template card with the key `test_aaaaaaa1`
- **WHEN** cards are created from its template
- **THEN** the new card's metadata names `test_aaaaaaa1` as its template card

### Requirement: Links and transition time of the template card are not carried over

A created card SHALL start with no links and no last-transitioned time, whatever its template card holds.

Source: code

#### Scenario: Links dropped

- **GIVEN** a template card with a link of type `decision/linkTypes/test` to another template card and a last-transitioned time
- **WHEN** cards are created from its template
- **THEN** the new card has no links
- **AND** the new card has no last-transitioned time
- **AND** the template card still holds its link

### Requirement: An empty custom field value in a template card leaves the field without a value

A custom field with no value in the template card SHALL have no stored value in the created card.

Source: code

#### Scenario: No value stays no value

- **GIVEN** a template card whose custom field `decision/fieldTypes/admins` has no value
- **WHEN** cards are created from its template
- **THEN** the new card's metadata has no entry for `decision/fieldTypes/admins`

### Requirement: Template attachments are copied to the created cards under new names

Attachments of a template card SHALL be copied to the created card with the new card's key as a prefix of the file name, and references to them in the card's content SHALL be rewritten to the new names.

Source: code

#### Scenario: Attachment copied and content repointed

- **GIVEN** the template card with the attachment `pic.png` and the content `image::pic.png[]`
- **WHEN** cards are created from its template and the new card gets the key K
- **THEN** the new card has the attachment `K-pic.png` with the same bytes
- **AND** its content is `image::K-pic.png[]`

### Requirement: A module's template creates cards with the module's card type

Creating cards from a template of an installed module SHALL use the card type the module's template card names.

Source: code

#### Scenario: Module template

- **GIVEN** the installed module `mod` with the template `mod/templates/mt` whose card has the card type `mod/cardTypes/page`
- **WHEN** cards are created from `mod/templates/mt`
- **THEN** the new card has the card type `mod/cardTypes/page`

### Requirement: Creating cards leaves the template unchanged

Creating cards from a template SHALL NOT change the template's cards or their ranks.

Source: code

#### Scenario: Template created from twice

- **GIVEN** the template `decision/templates/simplepage` with three cards
- **WHEN** cards are created from it twice
- **THEN** its three cards have the same keys and ranks as before

### Requirement: Creation is refused for an unknown template, an empty template or a missing parent

Creating cards MUST be refused, with an error and no change to the project, when the template does not exist, when the template has no cards, or when the given parent card does not exist.

Source: code

#### Scenario: Unknown template

- **WHEN** cards are created from `test/templates/nope`
- **THEN** creation is refused with an error
- **AND** the project is unchanged

#### Scenario: Template without cards

- **GIVEN** the template `test/templates/empty` with no cards
- **WHEN** cards are created from `test/templates/empty`
- **THEN** creation is refused with an error saying the template has no cards
- **AND** the project is unchanged

#### Scenario: Missing parent

- **WHEN** cards are created from `test/templates/tpl` under `test_zzzzzzzz`
- **THEN** creation is refused with a card-not-found error naming `test_zzzzzzzz`
- **AND** the project is unchanged

### Requirement: A failed creation leaves no partial cards

If creating the cards fails part-way, the operation SHALL report the original error and remove the cards it had created, leaving the parent and its existing children unchanged.

Source: code

#### Scenario: Missing attachment file

- **GIVEN** a template of three cards where an attachment file of one template card cannot be read
- **WHEN** cards are created from it under the card `decision_5`
- **THEN** creation fails with the original read error
- **AND** the children of `decision_5` are the same as before

### Requirement: Importing CSV creates one card per row from the row's template

Importing CSV text SHALL create one card from the template named in each row's template column and return the new card keys, applying the row's title, description as content and labels.

Source: code

#### Scenario: Two rows

- **GIVEN** the template `test/templates/tpl` with one card labelled `from-template`
- **WHEN** CSV is imported with the rows `Title1,test/templates/tpl,content1,label-first label-second` and `Title2,test/templates/tpl,content2,`
- **THEN** two keys are returned
- **AND** the first card has the title Title1, the content `content1` and the labels `from-template`, `label-first`, `label-second`
- **AND** the second card has the title Title2 and the label `from-template`

### Requirement: CSV columns that name fields of the card type set those fields

A CSV column whose name is a custom field of the created card's card type SHALL set that field to the row's value, and any other extra column SHALL be ignored.

Source: code

#### Scenario: Known and unknown column

- **GIVEN** the card type `test/cardTypes/page` with the custom field `test/fieldTypes/responsible`
- **WHEN** CSV with the columns `test/fieldTypes/responsible` and `doesnotexist` is imported
- **THEN** the card has `test/fieldTypes/responsible` set to the row's value
- **AND** the card's metadata has no entry `doesnotexist`

### Requirement: Imported CSV cards can be placed under a parent card

Importing CSV with a parent card SHALL create the cards as children of that card.

Source: code

#### Scenario: Under a parent

- **GIVEN** the card Parent
- **WHEN** two rows are imported with Parent as the parent
- **THEN** both new cards are children of Parent

### Requirement: CSV without the required columns is refused

Importing CSV that lacks the title or template column MUST be refused with an error naming the missing column, and the project SHALL be unchanged.

Source: code

#### Scenario: Missing template column

- **WHEN** CSV with the columns `title,description,labels` is imported
- **THEN** the import is refused with an error saying `template` is required
- **AND** the project is unchanged
