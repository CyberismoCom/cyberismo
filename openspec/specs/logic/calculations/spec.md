# logic/calculations Specification

## Purpose

This capability defines the contract for content and module authors on where their logic programs run: calculation resources of the project and its modules join the main logic program, and an author can run a program of their own against it or read the whole program. The fact vocabulary is in `logic/fact-model` and the query language in `logic/queries`; how the app uses the program internally is not part of it.

## Requirements

### Requirement: Calculation programs join the main program

The logic program of every calculation resource of the project SHALL be part of the main program that every run sees.

Source: both

#### Scenario: Calculation fact visible to a run

- **GIVEN** a calculation containing `greeting("hello").`
- **WHEN** the program `result(G) :- greeting(G).` is run
- **THEN** the single result is hello

### Requirement: Module calculations join the main program

The calculations and resources of every imported module SHALL be part of the main program in the same way as those of the project.

Source: docs

#### Scenario: Module calculation visible to a run

- **GIVEN** an imported module `base` whose calculation derives `moduleFact(1).`
- **WHEN** the program `result(X) :- moduleFact(X).` is run
- **THEN** the single result is 1

### Requirement: An ad-hoc program returns its results

Running a logic program against the project SHALL return the results the program declares.

Source: both

#### Scenario: Children of a card

- **GIVEN** `test_1` with the children titled Child A and Child B
- **WHEN** the program `select("title"). result(C) :- parent(C, test_1).` is run
- **THEN** the results have the titles Child A and Child B

### Requirement: A program that does not parse is refused

A logic program that cannot be parsed MUST be refused with an error that says parsing failed.

Source: both

#### Scenario: Unterminated rule

- **WHEN** the program `result(X :- ` is run
- **THEN** the run is refused with an error saying parsing failed

### Requirement: Results can differ by context

A program that depends on the execution context SHALL return results for the context it is run in and not for the others.

Source: both

#### Scenario: Public only in export

- **GIVEN** a calculation containing `restricted(test_1) :- exportedSite.`
- **WHEN** the program `result(C) :- restricted(C).` is run in the context exportedSite
- **THEN** the single result is `test_1`
- **AND** run in the context localApp it returns nothing

### Requirement: The whole program can be read

The project SHALL give its whole logic program as text, including the facts of its cards.

Source: both

#### Scenario: Card title in the program

- **GIVEN** the card `test_1` titled Top
- **WHEN** the whole program is read
- **THEN** the text contains the fact `field(test_1, "title", "Top")`
