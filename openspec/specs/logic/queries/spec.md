# logic/queries Specification

## Purpose

This capability defines the contract for content and module authors on the query language: the predicates a query writes to shape its output as a tree of JSON result objects, and how attributes are typed and ordered. The queries the app runs internally are not part of it; reports built on queries are specified in `reports`.

## Requirements

### Requirement: A result declares a top-level object

Each `result(Key)` the program derives SHALL give one top-level object in the query result, identified by its key.

Source: both

#### Scenario: Pages by title

- **GIVEN** the cards `test_1` and `test_2` of the card type `test/cardTypes/page`
- **WHEN** the program `select("title"). result(C) :- card(C), field(C, "cardType", "test/cardTypes/page").` is run
- **THEN** there are two results, each with a key and a title

### Requirement: A result key need not be a card

A result key SHALL be any constant the program derives, so that summary queries can return one object per distinct value.

Source: docs

#### Scenario: Count per state

- **GIVEN** two cards in Open and one in Closed
- **WHEN** a program declares each workflow state as a result with a `count` attribute of type integer
- **THEN** the results are Open with count 2 and Closed with count 1

### Requirement: select names the attributes returned

`select` SHALL include the named fields in the results on all levels, and several fields can be named in one statement.

Source: both

#### Scenario: Title and state

- **GIVEN** the card `test_1`
- **WHEN** the program `select("title"; "workflowState"). result(test_1).` is run
- **THEN** the result has the title and workflowState attributes and no others besides its key

### Requirement: selectAll returns every attribute

`selectAll` SHALL include all fields of the result keys on all levels.

Source: both

#### Scenario: All fields of a card

- **GIVEN** the card `test_1`
- **WHEN** the program `selectAll. result(test_1).` is run
- **THEN** the result has every field of the card, including its card type and title

### Requirement: Selection can be limited to a hierarchy level

Giving a level to `select` or `selectAll` SHALL include the attributes only for results on that level, and `selectCollectionField` SHALL include a field only for the named collection.

Source: docs

#### Scenario: Titles on the second level

- **GIVEN** `test_1` with the child `test_2`
- **WHEN** the program `select(2, "title"). result(test_1). childResult(test_1, test_2).` is run
- **THEN** `test_2` has a title and `test_1` has none

### Requirement: select can return labels and links

`select("labels")` and `select("links")` SHALL include the labels and the links of each result card, and `select("policyChecks")` and `select("deniedOperations")` the policy check results and denied operations.

Source: both, jira (INTDEV-947)

#### Scenario: Labels of a card

- **GIVEN** the card `test_1` labelled task-progress
- **WHEN** the program `select("labels"). result(test_1).` is run
- **THEN** the result lists the label task-progress

### Requirement: An attribute is shown only where it exists and is selected

A selected attribute SHALL appear only on result keys that have it.

Source: docs

#### Scenario: Missing attribute

- **GIVEN** `test_1` with no value for the field `test/fieldTypes/owner`
- **WHEN** the program `select("test/fieldTypes/owner"). result(test_1).` is run
- **THEN** the result has no owner attribute

### Requirement: resultField constructs an attribute

`resultField(Key, Field, Value)` SHALL give the result of Key an attribute that the main program does not have, always shown without a selection.

Source: both, jira (INTDEV-1461)

#### Scenario: Computed count

- **WHEN** the program `result(p). resultField(p, "count", 5).` is run
- **THEN** the result p has the attribute count

### Requirement: resultField takes its type from the field type

An attribute built with `resultField` and no data type SHALL have the data type of the field type of that name, and shortText when there is none, including for the built-in fields.

Source: both, jira (INTDEV-1461)

#### Scenario: Declared boolean and undeclared number

- **GIVEN** the boolean field type `decision/fieldTypes/finished`
- **WHEN** the program `result(p). resultField(p, "decision/fieldTypes/finished", "true"). resultField(p, "count", 5).` is run
- **THEN** finished is the boolean true
- **AND** count is the string 5

### Requirement: An explicit data type always wins

`resultField(Key, Field, Value, DataType)` SHALL give the attribute exactly DataType, even when a field type of that name exists.

Source: both

#### Scenario: Integer count

- **WHEN** the program `result(p). resultField(p, "count", 5, "integer").` is run
- **THEN** count is the number 5

### Requirement: fields builds two or three attributes at once

`fields` with two or three attribute-value pairs SHALL give the same attributes as one `resultField` for each, typed as resultField with no data type, and not subject to selection.

Source: both, jira (INTDEV-1458)

#### Scenario: Two attributes

- **WHEN** the program `result(p). fields(p, "a", 1, "b", "x").` is run
- **THEN** the result p has a as the string 1 and b as the string x

### Requirement: The data type decides the JSON type of an attribute

A number or integer attribute SHALL be a JSON number, a boolean a JSON boolean, a list an array, an enum an object with its value and display value, and short text, long text, person, date and date time strings.

Source: docs

#### Scenario: Enum attribute

- **GIVEN** the enum field type `enumf/fieldTypes/priority` with the value high, display value High at position 2
- **WHEN** the program `result(p). resultField(p, "enumf/fieldTypes/priority", "high").` is run
- **THEN** the attribute is an object with value high, index 2 and display value High

### Requirement: Queries never write the main program's predicates

A rule in a query SHALL NOT change the facts the main program reads, so that a field fact written by a query is not seen by other rules.

Source: both

#### Scenario: Field facts written by fields

- **WHEN** the program `result(p). fields(test_1, "a", 1, "b", 2). resultField(p, "seen", V) :- field(test_1, "a", V).` is run
- **THEN** the result p has no seen attribute

### Requirement: Child results nest under their parent

`childResult(Key, Child)` SHALL put Child in the array `results` of Key, and `childResult(Key, Child, Collection)` in the array named Collection.

Source: both, jira (INTDEV-607)

#### Scenario: Children in a named collection

- **GIVEN** `test_1` with the child `test_2`
- **WHEN** the program `result(test_1). childResult(test_1, test_2, "children").` is run
- **THEN** `test_1` has the array children containing `test_2`

### Requirement: A child object is a single property

`childObject(Key, Child, Property)` SHALL give Key the property Property holding the object Child instead of an array.

Source: docs

#### Scenario: Child object

- **WHEN** the program `result(p). childObject(p, c, "details"). resultField(c, "x", 1).` is run
- **THEN** p has the property details, an object with x

### Requirement: A collection can be guaranteed even if empty

`childResultCollection(Key, Collection)` SHALL give Key an array named Collection, empty when there are no child results.

Source: both

#### Scenario: Empty collection

- **WHEN** the program `result(p). childResultCollection(p, "items").` is run
- **THEN** p has the property items as an empty array

### Requirement: Results are ordered by explicit direction

`orderBy` SHALL order results on all levels by up to three fields, each with the direction ASC or DESC, and `order` SHALL give the level, collection, position and direction for any number of fields.

Source: both

#### Scenario: Descending title

- **GIVEN** pages titled A, B and C
- **WHEN** a query selects title and uses `orderBy("title", "DESC")`
- **THEN** the results are C, B, A

### Requirement: Ordering can be given for one level

`orderBy` with a leading level number SHALL order only the results on that level.

Source: docs

#### Scenario: Order of second level

- **GIVEN** `test_1` with children titled B and A as child results
- **WHEN** the program orders level 2 with `orderBy(2, "title", "ASC")`
- **THEN** the children of `test_1` are A then B

### Requirement: An invalid ordering is refused

An ordering with a direction other than ASC or DESC, or conflicting orderings, MUST make the query fail with an error identifying the ordering.

Source: code

#### Scenario: Direction up

- **WHEN** the program `result(p). orderBy("title", "UP").` is run
- **THEN** the run reports an error naming the invalid direction
