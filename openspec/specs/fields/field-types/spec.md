# fields/field-types Specification

## Purpose

A field type defines the name, display name and data type of a custom field that cards can carry, and for selection types the values it offers. This capability covers the data types, enum values and their changes, data type conversion, rename and removal, and what each does to the values cards store. Declaring a field type on a card type is in `card-types`; entering values on cards is in `fields/field-values`; names and lifecycle shared by all resources are in `resources`.

## Requirements

### Requirement: A field type has one of ten data types

A field type SHALL have exactly one data type: shortText, longText, number, integer, boolean, enum, list, date, dateTime or person.

Source: docs

#### Scenario: Field type created with a data type

- **GIVEN** the project `test`
- **WHEN** the field type `size` is created with the data type integer
- **THEN** `test/fieldTypes/size` has the data type integer

### Requirement: Creating a field type with an unknown data type is refused

Creating a field type SHALL be refused when the data type is not one of the supported types.

Source: code

#### Scenario: Unsupported data type

- **GIVEN** the project `test`
- **WHEN** the field type `x` is created with the data type colour
- **THEN** the creation is refused with an error listing the supported data types
- **AND** the project is unchanged

### Requirement: A new enum field type starts with two placeholder values

A field type created with the data type enum SHALL start with the enum values value1 and value2.

Source: code

#### Scenario: Default enum values

- **GIVEN** the project `test`
- **WHEN** the field type `level` is created with the data type enum
- **THEN** `test/fieldTypes/level` has the enum values value1 and value2

### Requirement: Enum values have a value, a display value and a description

Each enum value SHALL have a value and MAY have a display value and a description.

Source: docs

#### Scenario: Value with a display value

- **GIVEN** the field type `test/fieldTypes/level` with the enum value `low`
- **WHEN** the display value of `low` is changed to `Low`
- **THEN** the enum value is `low` with display value `Low`

### Requirement: Enum values keep their order

A new enum value SHALL be added after the existing values, and the listed order is the order in which the values are offered.

Source: both

#### Scenario: Value appended

- **GIVEN** the field type `test/fieldTypes/level` with the enum values `low` and `high`
- **WHEN** the enum value `mid` is added
- **THEN** the enum values are `low`, `high`, `mid`

### Requirement: A duplicate enum value is refused

Adding an enum value that already exists SHALL be refused.

Source: code

#### Scenario: Existing value added

- **GIVEN** the field type `test/fieldTypes/level` with the enum value `low`
- **WHEN** the enum value `low` is added
- **THEN** the edit is refused with an error that an enum with value `low` already exists
- **AND** the field type is unchanged

### Requirement: Renaming an enum value updates the cards that hold it

Changing the value of an enum value SHALL set the new value on the field type and on every card that stores the old value.

Source: both

#### Scenario: Value renamed

- **GIVEN** the field type `test/fieldTypes/level` with `low` and `high`, a card storing `low` and a card storing `high`
- **WHEN** the enum value `low` is changed to `lowest`
- **THEN** the field type has the values `lowest` and `high`
- **AND** the first card stores `lowest` and the second still stores `high`

### Requirement: Renaming an enum value to an existing value is refused

Changing an enum value to the value of another enum value SHALL be refused.

Source: code

#### Scenario: Rename collides

- **GIVEN** the field type `test/fieldTypes/level` with `low` and `high`
- **WHEN** `low` is changed to `high`
- **THEN** the edit is refused with an error that an enum with value `high` already exists

### Requirement: Changing only the display data of an enum value leaves cards alone

Changing the display value or description of an enum value without changing its value SHALL NOT change card values.

Source: code

#### Scenario: Display value changed

- **GIVEN** a card storing `low` for `test/fieldTypes/level`
- **WHEN** the display value of `low` is changed to `Low`
- **THEN** the card still stores `low`

### Requirement: Removing an enum value can give its cards a replacement

Removing an enum value SHALL, when a replacement value is given, set the replacement on every card that stored the removed value.

Source: both

#### Scenario: Replacement given

- **GIVEN** the field type `test/fieldTypes/level` with `low` and `high` and a card storing `low`
- **WHEN** `low` is removed with the replacement `high`
- **THEN** the field type has the value `high` only
- **AND** the card stores `high`

### Requirement: Removing an enum value without a replacement keeps card values

Removing an enum value without a replacement SHALL leave cards storing the removed value as they are.

Source: code

#### Scenario: No replacement

- **GIVEN** a card storing `low` for `test/fieldTypes/level`
- **WHEN** `low` is removed without a replacement
- **THEN** the card still stores `low`, a value the field type no longer offers

### Requirement: Removing an unknown enum value is refused

Removing an enum value that the field type does not have SHALL be refused.

Source: code

#### Scenario: Unknown value

- **GIVEN** the field type `test/fieldTypes/level` without the value `ghost`
- **WHEN** `ghost` is removed
- **THEN** the edit is refused with an error that an enum with value `ghost` does not exist

### Requirement: Changing the data type converts the values cards hold

Changing a field type's data type SHALL convert the stored value of every card holding one to the new data type.

Source: both

#### Scenario: Integer to short text

- **GIVEN** the integer field type `test/fieldTypes/size` and a card storing 3
- **WHEN** the data type is changed to shortText
- **THEN** the card stores the text `3`

#### Scenario: Integer to number

- **GIVEN** a card storing 3 for the integer field type `test/fieldTypes/size`
- **WHEN** the data type is changed to number
- **THEN** the card stores 3

### Requirement: Only some data type changes are allowed

A data type change SHALL be allowed from shortText or longText to any type except enum, between number and integer, between date and dateTime, and from any type to shortText or longText; every other change MUST be refused.

Source: code

#### Scenario: Integer to boolean

- **GIVEN** the integer field type `test/fieldTypes/size`
- **WHEN** its data type is changed to boolean
- **THEN** the change is refused with an error that integer cannot change to boolean
- **AND** the field type and cards are unchanged

#### Scenario: Short text to long text

- **GIVEN** the shortText field type `test/fieldTypes/spare` and a card storing `kept`
- **WHEN** its data type is changed to longText
- **THEN** the card still stores `kept`

### Requirement: Changing to the same or an unknown data type is refused

A data type change SHALL be refused when the new type equals the current one or is not a supported type.

Source: code

#### Scenario: Same type

- **GIVEN** the integer field type `test/fieldTypes/size`
- **WHEN** its data type is changed to integer
- **THEN** the change is refused with an error that it is already integer

#### Scenario: Unknown type

- **GIVEN** the integer field type `test/fieldTypes/size`
- **WHEN** its data type is changed to colour
- **THEN** the change is refused with an error naming the unknown type colour

### Requirement: A value that cannot be converted is left in place

When a data type change cannot convert a card's stored value, the change SHALL still apply and that card's value SHALL stay as it was.

Source: code

#### Scenario: Text that is not a boolean

- **GIVEN** the shortText field type `test/fieldTypes/flag` and a card storing `maybe`
- **WHEN** its data type is changed to boolean
- **THEN** the field type has the data type boolean
- **AND** the card still stores `maybe`

### Requirement: Renaming a field type moves the values cards hold

Renaming a field type that no card type uses SHALL give it the new name and store the values of cards under the new name.

Source: both

#### Scenario: Unused field renamed

- **GIVEN** the field type `test/fieldTypes/spare` used by no card type and a card storing `kept` for it
- **WHEN** it is renamed to `extra`
- **THEN** the card stores `kept` for `test/fieldTypes/extra` and has no value for `test/fieldTypes/spare`

### Requirement: Renaming a field type used by a card type is refused

Renaming a field type that a card type lists as a custom field SHALL be refused.

Source: code

#### Scenario: Field in use

- **GIVEN** the field type `test/fieldTypes/size` listed by `test/cardTypes/page`
- **WHEN** it is renamed to `extent`
- **THEN** the rename is refused with an error naming the card type that references it
- **AND** the project is unchanged

### Requirement: Removing a field type removes it from card types and keeps values

Removing a field type SHALL remove it from every card type that lists it and SHALL NOT delete the values cards stored for it.

Source: code

#### Scenario: Field in use removed

- **GIVEN** the field type `test/fieldTypes/size` listed by `test/cardTypes/page` and a card storing 3 for it
- **WHEN** it is removed
- **THEN** `test/cardTypes/page` no longer lists it
- **AND** the card still stores 3, which is dormant as described in `fields/field-values`

### Requirement: Usage of a field type includes cards and card types

The usage of a field type SHALL list the cards that hold a value for it and the card types that list it.

Source: code

#### Scenario: Card and card types

- **GIVEN** `test/fieldTypes/size` listed by `test/cardTypes/page` and `test/cardTypes/bare`, and a card storing a value for it
- **WHEN** usage of `test/fieldTypes/size` is requested
- **THEN** the result holds that card, `test/cardTypes/page` and `test/cardTypes/bare`
