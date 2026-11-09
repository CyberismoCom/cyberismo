# Spec Delta

## Purpose

Where an opened project's logic programs are kept and its queries answered: the logic backend a distribution gives
the projects it opens, and how a project keeps that backend's programs equal to its files.

## ADDED Requirements

### Requirement: Each opening of a project has a logic backend of its own

Opening a project with a logic backend factory SHALL make one backend for that opening, labelled with the project's
prefix and identified uniquely per opening; opening it without one SHALL use clingo.

#### Scenario: Each opening of a project has a backend of its own

- **GIVEN** a project opened with a recording logic backend factory
- **WHEN** the project is opened a second time with another
- **THEN** each opening has a backend labelled with the project's prefix, with different identities
- **AND** the first opening's program holds the project's card

### Requirement: A project that is let go closes its backend

A project that is replaced or closed SHALL close its logic backend once its running operation has ended, and SHALL
refuse every later operation with a disposed-workspace error.

#### Scenario: A replaced project lets go of its backend

- **GIVEN** a project opened with a recording logic backend factory
- **WHEN** the project is replaced
- **THEN** the first backend is closed and the new one is not
- **AND** reading the program through a handle over the replaced project is refused as disposed

### Requirement: A backend that lost its programs gets them again

When a logic backend asks for a resync, the project SHALL rebuild every program from its files into it once the
running operation has ended.

#### Scenario: A backend that lost its programs gets them again

- **GIVEN** a project whose backend has dropped every program
- **WHEN** the backend asks for a resync
- **THEN** the project's program holds the project's card again

### Requirement: A write whose result the backend refuses fails

A write whose logic programs the backend refuses at commit SHALL fail with the backend's error, and the project
SHALL rebuild the backend's programs from its files, so the next operations are served. Until a rebuild has
committed, a read that needs the backend SHALL fail as unavailable, and a failed rebuild SHALL be tried again once
the write has ended.

#### Scenario: A write whose result the backend refuses fails

- **GIVEN** a project without autocommit whose backend refuses the next commit as not total
- **WHEN** a card's title is changed
- **THEN** the change fails with a logic failure of kind nonTotal
- **AND** the project's program holds the title the files keep
- **AND** a later title change succeeds and shows in the program

#### Scenario: A write that changed nothing and was refused leaves the programs rebuilt

- **GIVEN** a project whose backend refuses the next commit and drops its programs
- **WHEN** the children of a card without children are rebalanced
- **THEN** the write fails with a logic failure
- **AND** the project's program holds the project's card

#### Scenario: A rebuild that failed is tried again

- **GIVEN** a project whose backend refuses the next commit, drops its programs and then fails to begin once
- **WHEN** the children of a card without children are rebalanced
- **THEN** the write fails with a logic failure
- **AND** the project's program holds the project's card
