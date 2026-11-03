# cards/editing Specification

## Purpose

Changing a card's content, title and labels, and reading cards back: details, listings, roots and the per-card logic program. Custom field values are owned by `fields/field-values`, denial of edits by `logic/operation-rules`, and macro rendering by `macros`. Cards of installed modules are read-only as specified in `resources`.

## Requirements

### Requirement: Editing content replaces the card's content

Editing a card's content SHALL replace the content with the given text, leave the other metadata unchanged and set the card's last-updated time.

Source: both

#### Scenario: Content replaced

- **GIVEN** the card A with the content `hello`
- **WHEN** A's content is edited to `changed`
- **THEN** A's content is `changed`
- **AND** A's metadata is unchanged except for its last-updated time, which differs from before

### Requirement: Template cards can be edited like cards

Editing the content of a card of a project's own template SHALL work as it does for a project card.

Source: both

#### Scenario: Template card content

- **GIVEN** a card of the template `test/templates/tpl`
- **WHEN** its content is edited to `template text`
- **THEN** its content is `template text`

### Requirement: Editing a missing card is refused

Editing a card that does not exist MUST be refused with a card-not-found error, leaving the project unchanged.

Source: code

#### Scenario: Missing card

- **WHEN** the content of `test_zzzzzzzz` is edited
- **THEN** the edit is refused with a card-not-found error
- **AND** the project is unchanged

### Requirement: A card's title can be changed

Setting the title field of a card SHALL change the card's title and set its last-updated time, leaving other metadata unchanged.

Source: both

#### Scenario: Title renamed

- **GIVEN** the card A titled A
- **WHEN** the field `title` of A is set to Renamed
- **THEN** A's title is Renamed
- **AND** A's last-updated time differs from before

### Requirement: Setting a field is refused for an empty name or a missing card

Setting a field MUST be refused when the field name is empty, or when the card does not exist, leaving the project unchanged.

Source: code

#### Scenario: Empty field name

- **WHEN** the field with the name `` of A is set to x
- **THEN** the change is refused with an error saying the key cannot be empty
- **AND** the project is unchanged

#### Scenario: Missing card

- **WHEN** the field `title` of `test_zzzzzzzz` is set to x
- **THEN** the change is refused with a card-not-found error

### Requirement: Setting the labels field replaces the card's labels

Setting the field `labels` of a card SHALL replace all its labels with the given list and set its last-updated time, and MUST be refused when a label in the list does not follow the label naming rules.

Source: code

#### Scenario: Labels replaced

- **GIVEN** the card A with the label `one`
- **WHEN** the field `labels` of A is set to `x`, `y`
- **THEN** A's labels are `x`, `y`
- **AND** A's last-updated time differs from before

#### Scenario: Invalid label in the list

- **WHEN** the field `labels` of A is set to `bad/label`
- **THEN** the change is refused with an error saying the label does not follow the naming rules
- **AND** the project is unchanged

### Requirement: Adding a label appends it

Adding a label SHALL append it after the card's existing labels and set the card's last-updated time.

Source: both

#### Scenario: Third label

- **GIVEN** the card B with the labels `one`, `two`
- **WHEN** the label `three` is added to B
- **THEN** B's labels are `one`, `two`, `three`
- **AND** B's last-updated time differs from before

### Requirement: Label names follow the naming rules

Adding a label MUST be refused when the name is empty or does not follow the label naming rules, which use kebab-case.

Source: both

#### Scenario: Invalid label

- **GIVEN** the card A
- **WHEN** the label `bad/label` is added to A
- **THEN** the addition is refused with an error saying the label name is not valid
- **AND** the project is unchanged

### Requirement: A card cannot get the same label twice

Adding a label the card already has MUST be refused.

Source: code

#### Scenario: Duplicate label

- **GIVEN** the card A with the label `one`
- **WHEN** the label `one` is added to A
- **THEN** the addition is refused with an error saying the label already exists

### Requirement: Removing a label removes only that label

Removing a named label SHALL remove it from the card and keep the card's other labels.

Source: code

#### Scenario: Named label removed

- **GIVEN** the card B with the labels `one`, `two`
- **WHEN** the label `one` is removed from B
- **THEN** B's labels are `two`

### Requirement: Removing without a name removes the only label

Removing a label without naming it SHALL remove the card's label when it has exactly one, and MUST be refused when it has several or none.

Source: code

#### Scenario: Only label

- **GIVEN** the card A with the label `one`
- **WHEN** a label is removed from A without a name
- **THEN** A has no labels

#### Scenario: Several labels

- **GIVEN** the card B with the labels `one`, `two`
- **WHEN** a label is removed from B without a name
- **THEN** the removal is refused with an error saying there are several labels
- **AND** B's labels are unchanged

### Requirement: Removing a label the card lacks is refused

Removing a label the card does not have MUST be refused, naming the label.

Source: code

#### Scenario: Unknown label

- **GIVEN** the card B with the labels `one`, `two`
- **WHEN** the label `nine` is removed from B
- **THEN** the removal is refused with an error naming `nine`

### Requirement: Listing labels gives each label in use once, sorted

Listing labels SHALL return every label used by a project card or a template card, each once, in sorted order.

Source: code

#### Scenario: Labels across project and templates

- **GIVEN** project cards with the labels `one` and `two`, a template card with the label `tpl`, and the label `a-label` added to a card
- **WHEN** the labels are listed
- **THEN** the result is `a-label`, `one`, `tpl`, `two`

### Requirement: Card details give content, metadata, parent, children and attachments

Reading a card SHALL return its content, metadata, parent key, child keys and attachments.

Source: code

#### Scenario: Details of a parent card

- **GIVEN** the card a with the children a1 and a2 and the content `hello`
- **WHEN** the details of a are read
- **THEN** the content is `hello`
- **AND** the parent is `root`
- **AND** the children are a1 and a2

### Requirement: Reading card details requires a card key

Reading the details of a card MUST be refused when no card key is given, or when the card does not exist.

Source: code

#### Scenario: No key

- **WHEN** the details of the card with the key `` are read
- **THEN** the read is refused with an error saying the card key is mandatory

### Requirement: Cards can be listed by location

Listing cards SHALL return the project's cards, the cards of templates, or both, as one list per project or template, skipping templates with no cards.

Source: code

#### Scenario: Templates only

- **GIVEN** a project with cards, the template `test/templates/tpl` with one card, an empty template, and the installed module template `mod/templates/mt` with one card
- **WHEN** the cards of templates are listed
- **THEN** there are two lists, both of type template
- **AND** together they hold the keys of the cards of `test/templates/tpl` and `mod/templates/mt`

### Requirement: Root cards can be read

Reading the roots SHALL return the project's top-level cards.

Source: code

#### Scenario: Roots

- **GIVEN** root cards a, b and c, where a has children
- **WHEN** the roots are read
- **THEN** the result holds a, b and c and none of a's children

### Requirement: A card's logic program mentions the card

Reading a card's logic program SHALL return a program that contains the card's key.

Source: code

#### Scenario: Logic program of a card

- **GIVEN** the card A
- **WHEN** the logic program of A is read
- **THEN** the result contains A's key
