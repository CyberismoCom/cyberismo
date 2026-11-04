# workflows Specification

## Purpose

Workflows define the states a card can be in and the named transitions that move it between them. This capability covers the rules a workflow must satisfy, how cards change state, and what happens to cards and card types when a workflow is edited, renamed or removed.

## Requirements

### Requirement: Workflow states have a category

Every state of a workflow SHALL have a name and one category: initial, active or closed.

Source: both

#### Scenario: State added with a category

- **GIVEN** the workflow `test/workflows/flow` with the states Open, In Progress and Closed
- **WHEN** the state Review with the category active is added
- **THEN** the workflow lists Review with the category active after Closed

#### Scenario: State change without a category is refused

- **GIVEN** the workflow `test/workflows/flow` with the state Open
- **WHEN** Open is changed to a state named Fresh that has no category
- **THEN** the change is refused with an error saying a state must have a name and a category
- **AND** the workflow is unchanged

### Requirement: A workflow has exactly one create transition

A workflow SHALL have exactly one create transition, the transition whose source state is the empty value; an edit that leaves zero or several create transitions MUST be refused.

Source: both

#### Scenario: Removing the create transition is refused

- **GIVEN** the workflow `test/workflows/flow` whose only create transition is Create
- **WHEN** the transition Create is removed
- **THEN** the removal is refused with an error saying the workflow must have exactly one create transition
- **AND** the workflow still contains Create

### Requirement: New cards start in the create transition's target state

A card created with a card type SHALL start in the target state of the create transition of that card type's workflow.

Source: both

#### Scenario: Card created into the initial state

- **GIVEN** a card type whose workflow has the create transition Create into Open
- **WHEN** a card of that card type is created
- **THEN** the card's workflow state is Open

### Requirement: A transition moves the card to its target state

Applying a transition to a card SHALL set the card's workflow state to the transition's target state and record when the card was last transitioned.

Source: both

#### Scenario: Card moves to the target state

- **GIVEN** a card in the state Open and the transition Start from Open into Review
- **WHEN** the transition Start is applied to the card
- **THEN** the card's workflow state is Review
- **AND** the card's last-transitioned time is set to the time of the transition
- **AND** the card's other metadata is unchanged apart from its last-updated time

### Requirement: Transitions start from listed states or from any state

A transition SHALL be available from each state listed as its source, and from every state when its sources include the wildcard `*`.

Source: both

#### Scenario: Wildcard transition from any state

- **GIVEN** a card in the state Done and the transition Close whose source is `*` and target is Done
- **WHEN** the transition Close is applied to the card
- **THEN** the card's workflow state is Done

### Requirement: Unknown transitions are refused

Applying a transition name that the card's workflow does not contain SHALL be refused with an error that names the available transitions.

Source: code

#### Scenario: Transition name not in the workflow

- **GIVEN** a card whose workflow has the transitions Start, Finish and Close
- **WHEN** the transition Nope is applied to the card
- **THEN** the transition is refused with an error that lists Start, Finish and Close
- **AND** the card's workflow state is unchanged

### Requirement: Transitions not available from the current state are refused

Applying a transition that exists in the workflow but is not available from the card's current state SHALL be refused.

Source: code

#### Scenario: Transition from the wrong state

- **GIVEN** a card in the state Done and the transition Start available only from Open
- **WHEN** the transition Start is applied to the card
- **THEN** the transition is refused with an error naming the state Done and the transition Start
- **AND** the card's workflow state is still Done

### Requirement: A failed transition leaves the card unchanged

When a transition cannot be completed, the card's workflow state and metadata SHALL remain as they were before the attempt.

Source: code

#### Scenario: Card metadata cannot be written

- **GIVEN** a card in the state Open whose metadata cannot be written
- **WHEN** the transition Start is applied to the card
- **THEN** the operation fails with the write error
- **AND** the card is still in the state Open

#### Scenario: Transition on a missing card

- **GIVEN** no card with the key `test_zzzzzzzz` exists
- **WHEN** the transition Start is applied to `test_zzzzzzzz`
- **THEN** the operation is refused with a card-not-found error
- **AND** the project is unchanged

### Requirement: Transition names are unique within a workflow

A workflow SHALL NOT contain two transitions with the same name; an edit that would create a duplicate MUST be refused.

Source: code

#### Scenario: Adding a transition with an existing name

- **GIVEN** the workflow `test/workflows/flow` with the transition To Closed
- **WHEN** a second transition named To Closed from Open into Closed is added
- **THEN** the addition is refused with an error saying transition names must be unique
- **AND** the workflow is unchanged

### Requirement: State names are unique within a workflow

Adding a state whose name the workflow already contains SHALL be refused.

Source: code

#### Scenario: Adding an existing state

- **GIVEN** the workflow `test/workflows/flow` with the state Open
- **WHEN** a state named Open with the category initial is added
- **THEN** the addition is refused with an error saying the state already exists
- **AND** the workflow is unchanged

### Requirement: States keep their order and can be reordered

A workflow SHALL keep its states in the order they were defined, new states SHALL be appended, and a state MAY be moved to a given position.

Source: both

#### Scenario: Moving a state to a new position

- **GIVEN** the workflow `test/workflows/flow` with the states Open, In Progress and Closed in that order
- **WHEN** Closed is moved to position 1
- **THEN** the states are Open, Closed and In Progress in that order

### Requirement: Transitions can be added, changed and removed

Transitions SHALL be added, removed, or changed by giving the complete new transition; a change that does not give a complete transition MUST be refused.

Source: both

#### Scenario: Changing a transition to a new definition

- **GIVEN** the workflow `test/workflows/flow` with the transition To Closed
- **WHEN** To Closed is changed to the transition Finish from In Progress into Closed
- **THEN** the workflow contains Finish from In Progress into Closed
- **AND** the workflow no longer contains To Closed

#### Scenario: Removing a transition

- **GIVEN** the workflow `test/workflows/flow` with the transition To Closed
- **WHEN** To Closed is removed
- **THEN** the workflow no longer contains To Closed

#### Scenario: Changing a transition by name only is refused

- **GIVEN** the workflow `test/workflows/flow` with the transition To In Progress
- **WHEN** To In Progress is changed by giving only the new name Start
- **THEN** the change is refused as invalid workflow content
- **AND** the workflow is unchanged

### Requirement: Renaming a state updates transitions and cards

Renaming a workflow state SHALL rename it in every transition of the workflow that refers to it and in every card that is in that state.

Source: code

#### Scenario: State renamed while cards are in it

- **GIVEN** the workflow `test/workflows/flow` with the transition To In Progress into In Progress
- **AND** card A in the state In Progress and card B in the state Open
- **WHEN** the state In Progress is renamed to Doing
- **THEN** the workflow lists the state Doing and To In Progress targets Doing
- **AND** card A is in the state Doing
- **AND** card B is still in the state Open

### Requirement: Removing a state moves its cards to a replacement state

Removing a workflow state with a replacement state SHALL move every card in the removed state to the replacement state and replace the removed state with the replacement in the source and target states of every transition.

Source: both

#### Scenario: State removed with a replacement

- **GIVEN** the workflow `test/workflows/flow` with the states Open, In Progress and Closed and the transition To In Progress into In Progress
- **AND** a card in the state In Progress
- **WHEN** In Progress is removed with Closed as its replacement
- **THEN** the workflow states are Open and Closed
- **AND** the card is in the state Closed
- **AND** the transition To In Progress now leads into Closed

### Requirement: Removing a state without a replacement uses the create state

Removing a workflow state without a replacement SHALL move every card in the removed state to the target state of the create transition, remove the transitions that lead into the removed state, and drop the removed state from the sources of the remaining transitions.

Source: code

#### Scenario: State removed without a replacement

- **GIVEN** the workflow `test/workflows/flow` whose create transition leads to Open
- **AND** a card in the state In Progress
- **WHEN** In Progress is removed without a replacement
- **THEN** the card is in the state Open
- **AND** the workflow no longer contains the transition To In Progress

### Requirement: A replacement state must belong to the workflow

Removing a state with a replacement state that the workflow does not contain SHALL be refused.

Source: code

#### Scenario: Replacement state not in the workflow

- **GIVEN** the workflow `test/workflows/flow` without a state named Ghost
- **WHEN** Closed is removed with Ghost as its replacement
- **THEN** the removal is refused with an error naming the unknown state Ghost
- **AND** the workflow and its cards are unchanged

### Requirement: Workflow content follows the workflow format

An edit that would make a workflow violate the workflow format SHALL be refused; state and transition names consist of letters, spaces, full stops, underscores and hyphens.

Source: code

#### Scenario: State name with a digit is refused

- **GIVEN** the workflow `test/workflows/flow`
- **WHEN** a state named Phase 2 with the category active is added
- **THEN** the addition is refused as invalid workflow content
- **AND** the workflow is unchanged

### Requirement: Renaming a workflow updates the card types that use it

Renaming a workflow SHALL change its name and update every card type that uses it to refer to the new name.

Source: code

#### Scenario: Workflow renamed

- **GIVEN** the workflow `test/workflows/flow` used by the card type `test/cardTypes/page`
- **WHEN** the workflow is renamed to track
- **THEN** the workflow `test/workflows/track` exists and `test/workflows/flow` does not
- **AND** the card type `test/cardTypes/page` uses `test/workflows/track`

### Requirement: Removing a workflow removes the card types that use it

Removing a workflow SHALL also remove every card type that uses it and every card of those card types; card types that use other workflows and their cards SHALL remain.

Source: code

#### Scenario: In-use workflow removed

- **GIVEN** the workflow `test/workflows/flow` used by the card type `test/cardTypes/page`
- **AND** the card type `test/cardTypes/bare` that uses another workflow
- **AND** two cards of `test/cardTypes/page` and one card of `test/cardTypes/bare`
- **WHEN** the workflow `test/workflows/flow` is removed
- **THEN** neither the workflow nor `test/cardTypes/page` exists
- **AND** the only remaining card is the card of `test/cardTypes/bare`

#### Scenario: Unused workflow removed

- **GIVEN** a workflow that no card type uses
- **WHEN** the workflow is removed
- **THEN** the workflow no longer exists
- **AND** no card type or card is removed

### Requirement: Project cards are in a state of their workflow

Project validation SHALL report every project card whose workflow state is not a state of its card type's workflow.

Source: code

#### Scenario: Card in an unknown state

- **GIVEN** a project card whose workflow state Lost is not a state of its workflow
- **WHEN** the project is validated
- **THEN** the validation result reports that the card has the invalid state Lost

### Requirement: Template cards have no workflow state

Template cards SHALL NOT have a workflow state, and project validation SHALL report a template card that has one.

Source: code

#### Scenario: Template card with a state

- **GIVEN** a template card whose workflow state is Open
- **WHEN** the project is validated
- **THEN** the validation result reports that the template card must have an empty workflow state

### Requirement: New workflows have default states and transitions

A workflow created without content SHALL contain the states Draft (initial), Approved (closed) and Deprecated (closed) and the transitions Create into Draft, Approve from Draft into Approved, and Archive from any state into Deprecated.

Source: code

#### Scenario: Workflow created without content

- **WHEN** the workflow `test/workflows/myWorkflow` is created without content
- **THEN** its states are Draft, Approved and Deprecated with the categories initial, closed and closed
- **AND** its transitions are Create from the empty state into Draft, Approve from Draft into Approved, and Archive from `*` into Deprecated

### Requirement: A workflow can be drawn as a state diagram

The system SHALL render a workflow as an image of its states and transitions, with a given current state highlighted.

Source: code

#### Scenario: Diagram with the current state

- **GIVEN** the workflow `test/workflows/flow`
- **WHEN** the workflow diagram is requested with the current state In Progress
- **THEN** an SVG image is returned that shows the states Open, In Progress and Closed and their transitions
- **AND** the state In Progress is drawn differently from the other states
