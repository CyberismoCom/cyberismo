# logic/policy-checks Specification

## Purpose

This capability defines the contract for content and module authors on the predicates that attach policy check results and notifications to cards, and what each attaches. How they are shown is in `ui/card-view` and `ui/card-editor`.

## Requirements

### Requirement: A failed check is attached to a card

A rule deriving `policyCheckFailure` with a card, a category, a title and a message SHALL attach a failed policy check with those values to that card.

Source: both, jira (INTDEV-412)

#### Scenario: Failure without a field

- **GIVEN** a card `decision_6` and the fact `policyCheckFailure(decision_6, "cat", "no field", "msg")`
- **WHEN** the details of `decision_6` are read
- **THEN** its failed checks include one with the category cat, the title `no field` and the message msg
- **AND** that check names no field

### Requirement: A failed check can name a field

A rule deriving `policyCheckFailure` with a fifth argument SHALL attach the failed check together with the name of that field.

Source: both, jira (INTDEV-714)

#### Scenario: Failure with a field

- **GIVEN** a card `decision_6` and the fact `policyCheckFailure(decision_6, "cat", "with field", "msg", "decision/fieldTypes/x")`
- **WHEN** the details of `decision_6` are read
- **THEN** its failed checks include one with the title `with field` and the field `decision/fieldTypes/x`

### Requirement: A successful check is attached to a card

A rule deriving `policyCheckSuccess` with a card, a category and a title SHALL attach a successful policy check with those values to that card.

Source: both, jira (INTDEV-412)

#### Scenario: Success

- **GIVEN** a card `decision_6` and the fact `policyCheckSuccess(decision_6, "cat", "all good")`
- **WHEN** the details of `decision_6` are read
- **THEN** its successful checks include one with the category cat and the title `all good`

### Requirement: A card lists only its own checks

The details of a card SHALL list only the checks and notifications attached to that card.

Source: code

#### Scenario: Check on another card

- **GIVEN** the fact `policyCheckFailure(decision_6, "cat", "t", "msg")`
- **WHEN** the details of `decision_5` are read
- **THEN** its failed checks are empty

### Requirement: A card can have several checks

A card SHALL list every check attached to it, including several with the same category.

Source: both

#### Scenario: Two checks in one category

- **GIVEN** the facts `policyCheckFailure(decision_6, "cat", "first", "m1")` and `policyCheckFailure(decision_6, "cat", "second", "m2")`
- **WHEN** the details of `decision_6` are read
- **THEN** its failed checks hold both `first` and `second`

### Requirement: A check follows the condition of its rule

A check derived by a rule SHALL be present while the rule's condition holds and absent once it no longer holds.

Source: docs

#### Scenario: Condition stops holding

- **GIVEN** a rule that fails the check `needs title` for every card whose title is empty
- **WHEN** the title of a card with an empty title is set to Risk and the card's details are read
- **THEN** its failed checks do not include `needs title`

### Requirement: A notification is attached to a card

A rule deriving `notification` with a card, a category, a title and a message SHALL attach a notification with those values to that card.

Source: both, jira (INTDEV-539)

#### Scenario: Notification

- **GIVEN** a card `decision_6` and the fact `notification(decision_6, "tips", "Add a link", "Link the decision to a risk.")`
- **WHEN** the details of `decision_6` are read
- **THEN** its notifications include one with the category tips, the title `Add a link` and the message `Link the decision to a risk.`

### Requirement: A notification is not a check result

A notification SHALL NOT appear among the failed or successful checks of a card.

Source: docs

#### Scenario: Notification only

- **GIVEN** a card `decision_6` with one notification and no policy check
- **WHEN** the details of `decision_6` are read
- **THEN** its failed checks and its successful checks are empty
- **AND** its notifications hold the one notification
