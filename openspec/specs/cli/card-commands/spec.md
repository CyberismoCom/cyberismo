# cli/card-commands Specification

## Purpose

The `cyberismo` commands that create, change, move, rank, remove, transition, show and import cards, their attachments, labels and links: argument shapes, output and failures. The operations they invoke are specified in `cards/creation`, `cards/editing`, `cards/hierarchy`, `cards/attachments`, `links`, `workflows` and `templates`; output and exit codes follow `cli/conventions`.

## Requirements

### Requirement: Create card makes cards from a template

`cyberismo create card <template> [parentCardKey]` SHALL create the cards of the template, as specified in `cards/creation`, and print `Created cards [<keys>]` with the new card keys as a JSON array.

Source: both

#### Scenario: Card created under a parent

- **GIVEN** a project with template `test/templates/page` and card `<card1>`
- **WHEN** the user runs `cyberismo create card test/templates/page <card1>`
- **THEN** stdout is `Created cards ["<card4>"]`
- **AND** `cyberismo show card <card4>` reports `<card1>` as its parent

#### Scenario: Card created at the root

- **WHEN** the user runs `cyberismo create card test/templates/page`
- **THEN** stdout lists the created card keys
- **AND** `cyberismo show card <key>` reports `root` as its parent

### Requirement: Create card with an unknown parent is refused

`cyberismo create card` given a parent card key that does not exist SHALL fail with an error naming the card, as specified in `cli/conventions`, and create nothing.

Source: code

#### Scenario: Unknown parent

- **WHEN** the user runs `cyberismo create card test/templates/page test_nope`
- **THEN** stderr states that card `test_nope` does not exist in the project
- **AND** the exit code is 1

### Requirement: Create attachment adds a file to a card

`cyberismo create attachment <cardKey> <filename>` SHALL add the file at the given path to the card as specified in `cards/attachments` and print `Done`.

Source: code

#### Scenario: Attachment added

- **GIVEN** a file `cyberismo.png` in the current directory and card `<card1>`
- **WHEN** the user runs `cyberismo create attachment <card1> cyberismo.png`
- **THEN** stdout is `Done`
- **AND** `cyberismo show attachments` lists `cyberismo.png`

### Requirement: Create attachment refuses a file that cannot be read

`cyberismo create attachment` given a path that cannot be read SHALL fail with `Attachment file not found: <filename>` and change nothing.

Source: code

#### Scenario: Missing file

- **WHEN** the user runs `cyberismo create attachment <card1> missing.png`
- **THEN** stderr is `Attachment file not found: missing.png`
- **AND** the exit code is 1

### Requirement: Create label adds a label to a card

`cyberismo create label <cardKey> <labelName>` SHALL add the label to the card as specified in `cards/editing` and print `Done`.

Source: code

#### Scenario: Label added

- **WHEN** the user runs `cyberismo create label <card1> urgent`
- **THEN** stdout is `Done`
- **AND** `cyberismo show labels` lists `urgent`

### Requirement: Create link links two cards or a card and an external item

`cyberismo create link <source> <destination> <linkType> [description]` SHALL create the link as specified in `links`, where either end MAY be an external item written `<connector>:<itemKey>`, and print `Done`.

Source: both

#### Scenario: Link between two cards

- **WHEN** the user runs `cyberismo create link <card1> <card2> test/linkTypes/relates`
- **THEN** stdout is `Done`
- **AND** `cyberismo show card <card1>` lists the link

#### Scenario: Link to an external item

- **WHEN** the user runs `cyberismo create link <card1> jira:INTDEV-1032 test/linkTypes/relates`
- **THEN** stdout is `Done`
- **AND** the link is stored on `<card1>`

### Requirement: Remove card removes a card

`cyberismo remove card <cardKey>` SHALL remove the card as specified in `cards/hierarchy` and print `Done`.

Source: both

#### Scenario: Card removed

- **WHEN** the user runs `cyberismo remove card <card3>`
- **THEN** stdout is `Done`
- **AND** `cyberismo show card <card3>` fails stating that the card does not exist

#### Scenario: Unknown card

- **WHEN** the user runs `cyberismo remove card test_nope`
- **THEN** stderr states that card `test_nope` does not exist in the project
- **AND** the exit code is 1

### Requirement: Remove attachment, label and link act on one item of a card

`cyberismo remove attachment <cardKey> <filename>`, `remove label <cardKey> <label>` and `remove link <source> <destination> <linkType>` SHALL remove that attachment, label or link as specified in `cards/attachments`, `cards/editing` and `links`, and print `Done`.

Source: both

#### Scenario: Link removed

- **GIVEN** a link of type `test/linkTypes/relates` from `<card1>` to `<card2>`
- **WHEN** the user runs `cyberismo remove link <card1> <card2> test/linkTypes/relates`
- **THEN** stdout is `Done`
- **AND** `cyberismo show card <card1>` lists no link

### Requirement: Remove names the missing argument

`cyberismo remove` given a type but not the argument it needs SHALL print `error: missing argument <name>` naming the argument to stderr and exit with code 1.

Source: code

#### Scenario: Missing card key

- **WHEN** the user runs `cyberismo remove card`
- **THEN** stderr is `error: missing argument <cardKey>`
- **AND** the exit code is 1

#### Scenario: Missing link type

- **WHEN** the user runs `cyberismo remove link <card1> <card2>`
- **THEN** stderr is `error: missing argument <linkType>`

### Requirement: Move moves a card under another card or to the root

`cyberismo move <source> <destination>` SHALL move the card as specified in `cards/hierarchy`, where the destination `root` means the top level, and print `Done`.

Source: both

#### Scenario: Move to the root

- **WHEN** the user runs `cyberismo move <card2> root`
- **THEN** stdout is `Done`
- **AND** `cyberismo show card <card2>` reports `root` as its parent

#### Scenario: Unknown destination

- **WHEN** the user runs `cyberismo move <card3> test_nope`
- **THEN** stderr states that card `test_nope` does not exist in the project
- **AND** the exit code is 1

### Requirement: Rank card places a card after a sibling or first

`cyberismo rank card <cardKey> <afterCardKey>` SHALL rank the card after the named sibling as specified in `cards/hierarchy`, where `first` as the second argument ranks the card first among its siblings, and print `Done`.

Source: both

#### Scenario: Ranked first

- **WHEN** the user runs `cyberismo rank card <card3> first`
- **THEN** stdout is `Done`
- **AND** the rank of `<card3>` sorts before the rank of `<card1>`

### Requirement: Rank rebalance renumbers ranks of a project or of one parent

`cyberismo rank rebalance [parentCardKey]` SHALL rebalance the ranks of the children of the given card, or of the whole project when no card is given, as specified in `cards/hierarchy`, and print `Done`.

Source: code

#### Scenario: Whole project

- **WHEN** the user runs `cyberismo rank rebalance`
- **THEN** stdout is `Done`

### Requirement: Transition moves a card through a workflow transition

`cyberismo transition <cardKey> <transition>` SHALL apply the named transition as specified in `workflows` and print `Done`; a refused transition SHALL arrive as a failure with the domain message.

Source: both

#### Scenario: Transition applied

- **WHEN** the user runs `cyberismo transition <card1> "To Closed"`
- **THEN** stdout is `Done`
- **AND** `cyberismo show card <card1>` reports the state Closed

#### Scenario: Unknown transition

- **WHEN** the user runs `cyberismo transition <card1> Bogus`
- **THEN** stderr names the transition `Bogus` and lists the available transitions
- **AND** the exit code is 1

### Requirement: Add card adds cards to a template

`cyberismo add card <template> <cardType> [cardKey]` SHALL add one card of the card type to the template, under the given template card when one is given, as specified in `templates`, and with `--repeat <quantity>` SHALL add that many cards.

Source: code

#### Scenario: One card added

- **WHEN** the user runs `cyberismo add card test/templates/page test/cardTypes/page`
- **THEN** stdout is `card '<key>' was added to the template 'test/templates/page'`

#### Scenario: Several cards added

- **WHEN** the user runs `cyberismo add card test/templates/page test/cardTypes/page --repeat 3`
- **THEN** stdout states that 3 cards were added to the template and lists their keys

### Requirement: Show card prints the card without its content by default

`cyberismo show card <cardKey>` SHALL print the card's key, path, parent, children, metadata and attachments as JSON without its content, and with `--details` (`-d`) SHALL include the content.

Source: code

#### Scenario: Card shown

- **WHEN** the user runs `cyberismo show card <card1>`
- **THEN** stdout is JSON with `key`, `path`, `children`, `parent`, `metadata` and `attachments`
- **AND** it has no `content`

#### Scenario: Card shown with details

- **WHEN** the user runs `cyberismo show card <card1> -d`
- **THEN** the JSON also holds the card's `content`

### Requirement: Show lists cards, labels and attachments

`cyberismo show cards`, `show labels` and `show attachments` SHALL print the project's cards, unique labels and attachments as JSON.

Source: code

#### Scenario: Labels listed

- **GIVEN** card `<card1>` has the label urgent
- **WHEN** the user runs `cyberismo show labels`
- **THEN** stdout is a JSON array containing `urgent`

### Requirement: Edit opens the card files in the preferred editor

`cyberismo edit <cardKey>` SHALL open the card's content and metadata files in the editor command configured for the current platform in the user preferences, wait for it to exit and print `Done`; an unknown or empty card key SHALL fail as a missing card.

Source: code

#### Scenario: Editor launched

- **GIVEN** the preferences name the editor `vi` for linux
- **WHEN** the user runs `cyberismo edit <card1>` on linux
- **THEN** `vi` is started with the card's content file and metadata file as arguments

#### Scenario: Empty card key

- **WHEN** the user runs `cyberismo edit ""`
- **THEN** stderr states that the card does not exist
- **AND** the exit code is 1

### Requirement: Import csv creates cards from a file

`cyberismo import csv <csvFile> [cardKey]` SHALL create cards from the rows of the file as specified in `cards/creation`, under the given card when one is given, and print `Imported cards:` followed by the created cards as JSON.

Source: code

#### Scenario: Cards imported

- **GIVEN** a file `cards.csv` with two rows
- **WHEN** the user runs `cyberismo import csv cards.csv`
- **THEN** stdout starts with `Imported cards:` followed by JSON listing the two cards

#### Scenario: File not readable

- **WHEN** the user runs `cyberismo import csv missing.csv`
- **THEN** stderr names the file
- **AND** the exit code is 1
