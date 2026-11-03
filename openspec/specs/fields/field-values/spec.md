# fields/field-values Specification

## Purpose

Cards store values for the custom fields of their card type. This capability covers setting and clearing a value, the checks a value must pass, calculated fields and their overrides, dormant values and the clean operation that removes them. How calculated values are computed is in `logic/derived-card-data`; the definition of field types and of card types' custom fields is in `fields/field-types` and `card-types`.

## Requirements

### Requirement: Setting a custom field stores the value on the card

Setting a custom field on a card SHALL store the value and update the card's last-updated time, changing nothing else in the card's metadata.

Source: both

#### Scenario: Value set

- **GIVEN** a card of `test/cardTypes/page` storing 1 for `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is set to 9
- **THEN** the card stores 9 for `test/fieldTypes/size`
- **AND** the card's last-updated time has changed and its other metadata is unchanged

### Requirement: Setting the stored value writes nothing

Setting a field to the value the card already stores SHALL leave the project unchanged.

Source: code

#### Scenario: Same value

- **GIVEN** a card storing 1 for `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is set to 1
- **THEN** the project is unchanged, including the card's last-updated time

### Requirement: A value must fit the data type of its field

Setting a value SHALL be refused when it is not valid for the data type of the field type, and the refusal names the field.

Source: both

#### Scenario: Text for an integer

- **GIVEN** a card of a card type with the integer field `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is set to `abc`
- **THEN** the change is refused with an error naming `test/fieldTypes/size`
- **AND** the card is unchanged

### Requirement: Numeric values must be numbers and integers whole numbers

A value for an integer field SHALL be a whole number, and a value for a number field SHALL be a number.

Source: code

#### Scenario: Fraction in an integer field

- **GIVEN** a card with the integer field `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is set to 1.5
- **THEN** the change is refused with an error naming `test/fieldTypes/size`

### Requirement: Short text has a length limit

A value for a shortText field SHALL be at most 80 characters.

Source: code

#### Scenario: Too long

- **GIVEN** a card with a shortText field `test/fieldTypes/note`
- **WHEN** it is set to a text of 81 characters
- **THEN** the change is refused with an error that the value exceeds the maximum length for shortText

### Requirement: An enum value must be one the field type offers

A value for an enum field SHALL be one of the enum values of its field type.

Source: code

#### Scenario: Unknown enum value

- **GIVEN** a card with the enum field `test/fieldTypes/level` offering `low` and `high`
- **WHEN** it is set to `medium`
- **THEN** the change is refused with an error listing the possible enumerations `low` and `high`

### Requirement: A person value must be an email address

A value for a person field SHALL be an email address or the empty text.

Source: both

#### Scenario: Not an email

- **GIVEN** a card with the person field `test/fieldTypes/owner`
- **WHEN** it is set to `Alice`
- **THEN** the change is refused with an error that it is not a valid email address

### Requirement: A date value must be a valid date

A value for a date or dateTime field SHALL be text that parses as a date.

Source: code

#### Scenario: Not a date

- **GIVEN** a card with the date field `test/fieldTypes/due`
- **WHEN** it is set to `tomorrow-ish`
- **THEN** the change is refused with an error naming `test/fieldTypes/due`

### Requirement: Clearing a custom field removes its key

Clearing a custom field SHALL remove the field from the card, and clearing a field the card does not hold SHALL change nothing.

Source: both

#### Scenario: Cleared

- **GIVEN** a card storing 1 for `test/fieldTypes/size`
- **WHEN** `test/fieldTypes/size` is cleared
- **THEN** the card has no key for `test/fieldTypes/size`

#### Scenario: Nothing to clear

- **GIVEN** a card with no value for `test/fieldTypes/nothing`
- **WHEN** `test/fieldTypes/nothing` is cleared
- **THEN** the card is unchanged

### Requirement: A missing value and a null value mean the same

A card SHALL NOT need a key for every custom field of its card type, and a missing key and a null value SHALL mean the same.

Source: both

#### Scenario: Null value accepted

- **GIVEN** a card storing null for the integer field `test/fieldTypes/size`
- **WHEN** the project is validated
- **THEN** the card has no error for `test/fieldTypes/size`

### Requirement: A calculated field cannot be set unless override is enabled

Setting a value for a calculated custom field SHALL be refused unless its card type enables override for it, and clearing MUST always be allowed.

Source: both, jira (INTDEV-1276)

#### Scenario: Locked field set

- **GIVEN** the calculated field `test/fieldTypes/score` without override
- **WHEN** it is set to 4
- **THEN** the change is refused with an error that the card type does not enable override for it

#### Scenario: Locked field cleared

- **GIVEN** a card storing 3 for `test/fieldTypes/score`, calculated without override
- **WHEN** `test/fieldTypes/score` is cleared
- **THEN** the card has no key for it

#### Scenario: Override field set

- **GIVEN** the calculated field `test/fieldTypes/bonus` with override enabled
- **WHEN** it is set to 5
- **THEN** the card stores 5 for `test/fieldTypes/bonus`

### Requirement: The calculation rule applies to template cards too

The refusal to set a calculated field without override SHALL apply to template cards as to project cards.

Source: code

#### Scenario: Template card locked field

- **GIVEN** a template card with the calculated field `test/fieldTypes/score` without override
- **WHEN** it is set to 4
- **THEN** the change is refused

### Requirement: A stored override takes precedence over the calculated value

A calculated field with override enabled SHALL have the stored value as its effective value, while the calculated value stays available separately.

Source: both, jira (INTDEV-1276)

#### Scenario: Override and calculation

- **GIVEN** a card storing `decision_999` for an override-enabled field whose calculation gives `decision_auto`
- **WHEN** the card is queried
- **THEN** the field's value and override value are `decision_999`
- **AND** its calculated value is `decision_auto`

### Requirement: Without override the calculation is the effective value

A value stored for a calculated field that does not enable override SHALL be ignored, and the calculated value is effective.

Source: both, jira (INTDEV-1305)

#### Scenario: Stale stored value

- **GIVEN** a card storing `decision_999` for a calculated field without override, whose calculation gives `decision_auto`
- **WHEN** the card is queried
- **THEN** the field's value is `decision_auto`
- **AND** no conflicting-values notification is raised

### Requirement: Stored values that nothing reads are dormant

A stored value SHALL be dormant when its field is not declared by the card type, is calculated without override, or is empty; it stays on the card, is not shown, is not visible to logic programs and causes no validation error.

Source: both, jira (INTDEV-1305)

#### Scenario: Field removed from the card type

- **GIVEN** a card storing 3 for `test/fieldTypes/size` and a card type that no longer declares it
- **WHEN** the card is shown
- **THEN** the card still stores 3 but the value is not presented as a field of the card
- **AND** project validation reports no error for it

### Requirement: Re-declaring a field restores its dormant values

Adding a custom field back to a card type SHALL make the values cards stored for it effective again.

Source: docs

#### Scenario: Field added back

- **GIVEN** a card storing 3 for `test/fieldTypes/size`, not declared by its card type
- **WHEN** `test/fieldTypes/size` is added to the card type
- **THEN** the card's value for `test/fieldTypes/size` is 3

### Requirement: Clean removes dormant values

Clean SHALL remove from each cleaned card every dormant value and report each removal with its card, field and reason: undeclared, calculated-locked or null-value.

Source: both, jira (INTDEV-1305)

#### Scenario: Three reasons

- **GIVEN** card C1 storing null for `test/fieldTypes/size`, 2 for undeclared `test/fieldTypes/spare` and 5 for locked `test/fieldTypes/derived`
- **WHEN** clean is run
- **THEN** the result lists C1 with `size` null-value, `spare` undeclared and `derived` calculated-locked
- **AND** C1 no longer stores those keys

### Requirement: Clean keeps values that can override

Clean SHALL NOT remove a value stored for a calculated field that enables override, nor any value the card type reads.

Source: both

#### Scenario: Override kept

- **GIVEN** C1 storing 6 for the override-enabled field `test/fieldTypes/over` and C0 storing 1 for `test/fieldTypes/size`
- **WHEN** clean is run
- **THEN** C1 still stores 6 for `over` and C0 still stores 1 for `size`

### Requirement: A dry run reports and writes nothing

Clean with the dry-run option SHALL report what a clean would remove and SHALL leave the project unchanged.

Source: both, jira (INTDEV-1305)

#### Scenario: Dry run

- **GIVEN** a project holding five dormant values on three cards
- **WHEN** clean is run as a dry run
- **THEN** the result has five findings for three cards and is marked as a dry run
- **AND** the project is unchanged

### Requirement: Clean covers project cards and local template cards only

Clean SHALL visit the cards of the project and of the templates the project defines, and SHALL NOT change cards from imported modules.

Source: both

#### Scenario: Module template card

- **GIVEN** an undeclared value on a local template card and on a card of the module template `mod/templates/mt`
- **WHEN** clean is run
- **THEN** the local template card is cleaned and the module card is unchanged

### Requirement: Clean can be limited to one card type

Clean given a card type SHALL consider only cards of that card type.

Source: code

#### Scenario: Limited

- **GIVEN** dormant values on cards of `test/cardTypes/page` and of `test/cardTypes/other`
- **WHEN** clean is run for `test/cardTypes/other`
- **THEN** only the findings of cards of `test/cardTypes/other` are reported and removed

### Requirement: Clean skips cards whose card type cannot be resolved

Clean SHALL skip a card whose card type cannot be resolved, listing it as skipped and leaving it unchanged.

Source: code

#### Scenario: Unknown card type

- **GIVEN** a card whose card type no longer exists
- **WHEN** clean is run
- **THEN** the card is listed as skipped
- **AND** it is unchanged

### Requirement: Clean continues past a card it cannot write

A card that cannot be written SHALL be listed as failed without stopping the clean of the other cards, and running clean again SHALL finish the work.

Source: code

#### Scenario: One card fails

- **GIVEN** two cards with dormant values, one of which cannot be written
- **WHEN** clean is run
- **THEN** the unwritable card is listed as failed and the other card is cleaned

### Requirement: A dormant summary counts dormant values and cards

The dormant summary SHALL give the number of dormant values and of cards holding them, and nothing when there are none or when the scan fails.

Source: code

#### Scenario: Counted

- **GIVEN** five dormant values on three cards
- **WHEN** the dormant summary is requested
- **THEN** it is 5 values on 3 cards

#### Scenario: None

- **GIVEN** a project without dormant values
- **WHEN** the dormant summary is requested
- **THEN** there is no summary
