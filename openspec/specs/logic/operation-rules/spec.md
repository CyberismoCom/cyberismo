# logic/operation-rules Specification

## Purpose

This capability defines the contract for content and module authors on the rules their logic programs write to govern operations: the denial predicates (transition, content edit, field edit, move, delete) and the side-effect predicates of transitions and card creation, and what each does to the operation. The operations themselves are specified in `cards/*` and `workflows`, and the exemption of template cards from edit and removal denials in `templates`; the fact vocabulary the rules are written over is in `logic/fact-model`.

## Requirements

### Requirement: A transition denied by a rule is refused

A workflow transition on a card SHALL be refused when a rule derives `transitionDenied` for that card and that transition, and the card MUST stay in its state.

Source: both, jira (INTDEV-332)

#### Scenario: Denied transition leaves the state alone

- **GIVEN** a card titled Locked in the state Open and a rule denying the transition Close for it with the message `no closing`
- **WHEN** the transition Close is applied to the card
- **THEN** the transition is refused with an error carrying the message `no closing`
- **AND** the card is still in the state Open

### Requirement: A transition denial applies only to the named transition

A `transitionDenied` rule SHALL deny only the transition it names; other transitions of the same card MUST remain allowed.

Source: both

#### Scenario: Another transition still runs

- **GIVEN** a card titled Locked in the state Open and a rule denying the transition Close for it
- **WHEN** the transition Start is applied to the card
- **THEN** the card is in the state Review

### Requirement: A content edit denied by a rule is refused

Editing the AsciiDoc content of a card SHALL be refused when a rule derives `editingContentDenied` for that card, and the content MUST stay unchanged.

Source: both, jira (INTDEV-332)

#### Scenario: Denied content edit

- **GIVEN** a card titled Locked with the content `original` and a rule denying content edits for it with the message `no content edit`
- **WHEN** the content is changed to `changed`
- **THEN** the edit is refused with an error carrying the message `no content edit`
- **AND** the content of the card is still `original`

### Requirement: A field edit denied by a rule is refused

Editing a field of a card SHALL be refused when a rule derives `editingFieldDenied` for that card and that field, and the field MUST stay unchanged.

Source: both, jira (INTDEV-332)

#### Scenario: Denied title edit

- **GIVEN** a card titled Locked and a rule denying edits of the field title for it with the message `no title edit`
- **WHEN** the title is changed to Renamed
- **THEN** the edit is refused with an error carrying the message `no title edit`
- **AND** the title of the card is still Locked

### Requirement: A field denial applies only to the named field

An `editingFieldDenied` rule SHALL deny only the field it names; other fields of the same card MUST remain editable.

Source: both

#### Scenario: Another field is editable

- **GIVEN** a card titled Locked and a rule denying edits of the field title for it
- **WHEN** the labels of the card are set to `kept`
- **THEN** the labels of the card are `kept`

### Requirement: A move denied by a rule is refused

Moving a card under a different parent SHALL be refused when a rule derives `movingCardDenied` for that card, and the card MUST stay under its parent.

Source: both, jira (INTDEV-332)

#### Scenario: Denied move

- **GIVEN** a top-level card titled Locked, a top-level card titled Other and a rule denying moves of Locked with the message `no moving`
- **WHEN** Locked is moved under Other
- **THEN** the move is refused with an error carrying the message `no moving`
- **AND** Locked is still a top-level card

### Requirement: A removal denied by a rule is refused

Removing a card SHALL be refused when a rule derives `deletingCardDenied` for that card, and the card MUST be kept.

Source: both, jira (INTDEV-332)

#### Scenario: Denied removal

- **GIVEN** a card titled Locked and a rule denying its deletion with the message `no deleting`
- **WHEN** the card is removed
- **THEN** the removal is refused with an error carrying the message `no deleting`
- **AND** the card still exists

### Requirement: A refusal reports every denying message

A refused operation SHALL report the message of every rule that denies it, not only the first.

Source: code

#### Scenario: Two rules deny the same removal

- **GIVEN** a card titled Locked and two rules denying its deletion with the messages `first` and `second`
- **WHEN** the card is removed
- **THEN** the refusal carries both `first` and `second`

### Requirement: Denials apply only to the cards the rules name

An operation on a card for which no denial rule holds SHALL proceed as usual even when rules deny the same operation on other cards.

Source: code

#### Scenario: Unlocked card is removed

- **GIVEN** a card titled Locked with a denying rule for deletion and a card titled Free
- **WHEN** Free is removed
- **THEN** Free no longer exists

### Requirement: A transition can set a field of another card

When a rule derives `onTransitionSetField` for a card and a transition, executing that transition on the card SHALL set the named field of the affected card to the given value.

Source: both, jira (INTDEV-712)

#### Scenario: Field of another card is set

- **GIVEN** cards A and C and a rule that sets the title of C to Retitled when A is started
- **WHEN** the transition Start is applied to A
- **THEN** the title of C is Retitled

### Requirement: Creating a card is a transition for side effects

Creating a card from a template SHALL apply the side effects declared for the create transition of the card's workflow.

Source: both

#### Scenario: Creation sets a field and closes another card

- **GIVEN** a template whose card is titled new, a card B in the state Open, a card C, and rules that close B and set the title of C to `Set on creation` when new is created
- **WHEN** the template is applied
- **THEN** B is in the state Done
- **AND** the title of C is `Set on creation`

### Requirement: A transition can run a transition on another card

When a rule derives `onTransitionExecuteTransition` for a card and a transition, executing that transition on the card SHALL execute the named transition on the affected card.

Source: code, jira (INTDEV-713)

#### Scenario: Another card is closed

- **GIVEN** cards A and B in the state Open and a rule that closes B when A is started
- **WHEN** the transition Start is applied to A
- **THEN** A is in the state Review
- **AND** B is in the state Done

### Requirement: Side-effect transitions cascade

A transition executed as a side effect SHALL apply its own declared side effects in turn.

Source: code, jira (INTDEV-713)

#### Scenario: Chain of three cards

- **GIVEN** cards A, B and C in the state Open and rules that start B when A is started and close C when B is started
- **WHEN** the transition Start is applied to A
- **THEN** A and B are in the state Review
- **AND** C is in the state Done

### Requirement: A cascade runs each card and transition once

A cascade of side-effect transitions SHALL attempt each combination of card and transition at most once, so that rules which loop terminate.

Source: code

#### Scenario: Mutual cycle terminates

- **GIVEN** cards A and B in the state Open and rules that start B when A is started and start A when B is started
- **WHEN** the transition Start is applied to A
- **THEN** A and B are in the state Review

### Requirement: A side effect the project denies is skipped

A side effect SHALL be skipped when the project denies its transition or field edit, and the operation that caused it and the other side effects MUST still complete.

Source: code, jira (INTDEV-712, INTDEV-713)

#### Scenario: Denied target transition

- **GIVEN** cards A and B in the state Open, a rule closing B when A is started, and a rule denying the transition Close for B
- **WHEN** the transition Start is applied to A
- **THEN** A is in the state Review
- **AND** B is in the state Open

#### Scenario: Denied target field

- **GIVEN** cards A and B, a rule setting the title of B to Retitled when A is started, and a rule denying edits of the title of B
- **WHEN** the transition Start is applied to A
- **THEN** the title of B is still B
- **AND** A is in the state Review

### Requirement: A side effect that cannot be performed does not stop the operation

A side-effect transition on a card that does not exist or whose transition is not available from its current state SHALL NOT be performed, and the operation that caused it and the remaining side effects MUST still complete.

Source: code, jira (INTDEV-713)

#### Scenario: Missing target and unavailable transition

- **GIVEN** cards A, C in the state Open and D in the state Done, a rule starting a card that does not exist, a rule starting D, and a rule closing C, all when A is started
- **WHEN** the transition Start is applied to A
- **THEN** C is in the state Done
- **AND** D is still in the state Done
- **AND** A is in the state Review

### Requirement: A side-effect field update that cannot be made does not stop the operation

A side-effect field update naming a field the affected card cannot have edited, such as an unknown field, the rank or the card type, SHALL NOT change the affected card, and the operation that caused it MUST still complete.

Source: code, jira (INTDEV-712)

#### Scenario: Update of the card type

- **GIVEN** cards A and B and a rule setting the card type of B to `x` when A is started
- **WHEN** the transition Start is applied to A
- **THEN** B is unchanged
- **AND** A is in the state Review
