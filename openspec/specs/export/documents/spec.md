# export/documents Specification

## Purpose

Exporting cards as a single AsciiDoc document with its attachments, or as a PDF. This capability covers which cards and what of each card is exported, the document options and the safety of the PDF rendering; the static site is specified in `ui/static-site` and the export command flags in `cli/project-commands`.

## Requirements

### Requirement: AsciiDoc export writes every card as a section

An AsciiDoc export of the project SHALL give one document with each card as a section, parents before their children and siblings in rank order.

Source: code

#### Scenario: Whole project

- **GIVEN** cards Top (with children Sub1 and Sub2) and Second, in that rank order
- **WHEN** the project is exported as AsciiDoc
- **THEN** the sections appear in the order Top, Sub1, Sub2, Second

#### Scenario: Rank change is followed

- **GIVEN** Sub2 is ranked first among its siblings
- **WHEN** the project is exported as AsciiDoc
- **THEN** Sub2 appears before Sub1

### Requirement: AsciiDoc export can be limited to a card and its descendants

An AsciiDoc export given a card key SHALL contain that card and all its descendants as sections and no other card, wherever the card is in the tree.

Source: both, jira (INTDEV-812)

#### Scenario: Top-level card

- **WHEN** the card Top is exported
- **THEN** the document contains Top, Sub1 and Sub2 and not Second

#### Scenario: Card below the top

- **WHEN** the card Sub1 is exported
- **THEN** the document contains Sub1 and not Top

### Requirement: AsciiDoc export of an unknown card is refused

An AsciiDoc export given a card key the project does not have SHALL be refused with an error naming the card, and SHALL write nothing.

Source: code

#### Scenario: Unknown card

- **WHEN** the card `test_zzzzzzzz` is exported
- **THEN** the export is refused with an error saying the card does not exist
- **AND** the project is unchanged

### Requirement: Export never changes the project

An export SHALL NOT change any file of the project.

Source: code

#### Scenario: Project unchanged

- **WHEN** the project is exported as AsciiDoc
- **THEN** the files of the project are the same as before

### Requirement: Each exported card starts with a metadata table

Each card in an export SHALL have a table before its content that gives its card key, workflow state, card type and labels, and the custom fields its card type makes visible.

Source: code

#### Scenario: Metadata before content

- **GIVEN** the card Top, key `test_abc`, in state Open, of card type `test/cardTypes/page`, with the labels red and blue
- **WHEN** the project is exported as AsciiDoc
- **THEN** the section of Top shows the card key, the status Open, the card type and the labels red, blue before the text Top body.

### Requirement: A pipe in an exported field value is escaped

A pipe character in a custom field value SHALL be escaped in the metadata table so that it does not split the cell.

Source: code

#### Scenario: Pipe in a value

- **GIVEN** a visible custom field whose value is `a|b`
- **WHEN** the project is exported as AsciiDoc
- **THEN** the table shows the value as `a\|b`

### Requirement: Exported card content has its macros evaluated

The content of an exported card SHALL have its macros evaluated for a document, as specified in `macros`, in the execution context of an exported document.

Source: docs

#### Scenario: Score card in an export

- **GIVEN** a card whose content has a scoreCard macro
- **WHEN** the card is exported as AsciiDoc
- **THEN** the section contains an embedded image instead of the macro

### Requirement: A macro failure in one card does not stop the export

A macro that fails while exporting a card SHALL be reported in that card's section and the remaining cards SHALL still be exported.

Source: code

#### Scenario: Broken xref in one card

- **GIVEN** the card Sub1 has an xref macro to a missing card
- **WHEN** the project is exported as AsciiDoc
- **THEN** the section of Sub1 shows an error and the sections of the other cards are present

### Requirement: Export includes the attachments of the exported cards

An AsciiDoc export SHALL give the attachments of the exported cards, and no others, by the paths `a/<file name>` beside the document `index.adoc`.

Source: code

#### Scenario: Attachments of one subtree

- **GIVEN** `one.png` attached to Sub1 and `two.png` attached to Second
- **WHEN** Top is exported
- **THEN** the files are `index.adoc` and `a/one.png`

### Requirement: A PDF is made with the given document options

A PDF export SHALL give a PDF titled and signed with the given title and name, and with the given version, revision remark and date; an option not given SHALL default to Title, Name, 1.0.0, Initial version and today.

Source: code, jira (INTDEV-1232)

#### Scenario: Given title and name

- **WHEN** a PDF is exported with title Report and name Ann
- **THEN** the PDF has the title Report and the author Ann

#### Scenario: Defaults

- **WHEN** a PDF is exported with no options
- **THEN** the PDF has the title Title and the author Name

### Requirement: A PDF holds the whole tree or one card

A PDF export SHALL hold every card, parents before their children, or when given a card key only that card, together with its descendants only when asked to be recursive.

Source: code

#### Scenario: One card

- **GIVEN** cards Top (with child Sub) and Other
- **WHEN** a PDF is exported for Top without recursion
- **THEN** its headings are Top

#### Scenario: One card recursively

- **WHEN** a PDF is exported for Top recursively
- **THEN** its headings are Top and Sub

### Requirement: A PDF shows the card details beside the content

Each card in a PDF SHALL show its workflow state, card key, card type, last modified time, labels, custom fields, linked cards, notifications and policy checks.

Source: code, jira (INTDEV-1285, INTDEV-1024, INTDEV-985)

#### Scenario: Workflow state shown

- **GIVEN** a card in the state Closed
- **WHEN** a PDF is exported for it
- **THEN** the PDF shows the workflow state Closed

### Requirement: Cross-references between exported cards work inside the PDF

A reference to a card that is in the PDF SHALL link to that card's place in the document.

Source: code, jira (INTDEV-1239)

#### Scenario: Link to another exported card

- **GIVEN** a card whose content is `See xref:test_def.adoc[Other].` and the card `test_def` is exported too
- **WHEN** the PDF is exported
- **THEN** the reference jumps to the section of `test_def`
- **AND** no warning is reported

### Requirement: Mermaid diagrams are drawn in a PDF

A Mermaid diagram in card content SHALL appear in the PDF as a drawn diagram.

Source: code, jira (INTDEV-1294)

#### Scenario: Diagram block

- **GIVEN** a card whose content has a Mermaid diagram block
- **WHEN** the PDF is exported
- **THEN** the PDF contains the diagram as an image

### Requirement: PDF rendering warnings are returned

A PDF export SHALL return the warnings that its rendering produced together with the PDF, and SHALL NOT print them.

Source: code, jira (INTDEV-1286)

#### Scenario: Reference to a missing card

- **GIVEN** a card whose content is `See xref:test_zzzzzzzz.adoc[Gone].`
- **WHEN** a PDF is exported for it
- **THEN** one warning is returned and it names `test_zzzzzzzz`

### Requirement: A PDF export cannot read files of the server

Card content and document options SHALL NOT make a PDF export include a file from outside the project, the environment of the process, a cover image or images from a directory they name.

Source: code, jira (INTDEV-1415)

#### Scenario: Include of an outside file

- **GIVEN** a card whose content includes a file outside the project that holds the heading Leaked heading
- **WHEN** a PDF is exported for it
- **THEN** the PDF does not contain Leaked heading

#### Scenario: Cover named by the export name

- **WHEN** a PDF is exported with a name that contains a line setting a cover image file
- **THEN** the PDF has the same number of pages as without that line

### Requirement: A failed PDF rendering reports its diagnostics apart from the error

When the PDF renderer fails, the export SHALL be refused with an error that gives the failure code and carries the renderer's last diagnostic lines separately from its message.

Source: code

#### Scenario: Renderer fails with thirty lines of output

- **GIVEN** the renderer exits with code 3 after writing thirty diagnostic lines
- **WHEN** a PDF is exported
- **THEN** the error message names code 3 and holds no diagnostic line
- **AND** the error carries diagnostic lines ending with the thirtieth

### Requirement: A missing PDF renderer is reported

A PDF export on a system without the PDF renderer SHALL be refused with an error saying that it is not installed.

Source: code

#### Scenario: Renderer not installed

- **GIVEN** the PDF renderer cannot be run
- **WHEN** a PDF is exported
- **THEN** the export is refused with an error saying the PDF renderer was not found
