# macros Specification

## Purpose

Macros extend the AsciiDoc of card content with named blocks that are replaced by generated content. This capability covers the macro notation, how failures are shown, and what each macro renders in each rendering mode; what a report or graph itself produces is specified in `reports` and `graphs`, and the interactive behaviour of macros in the app in `ui/macros`.

## Requirements

### Requirement: A macro is a named block with JSON parameters

A macro SHALL be written as an opening tag naming the macro, a JSON object body without its enclosing braces, and a closing tag of the same name.

Source: both, jira (INTDEV-631)

#### Scenario: Macro with parameters is evaluated

- **GIVEN** a project with the card `decision_6`
- **WHEN** the content `See {{#xref}}"cardKey": "decision_6"{{/xref}}.` is rendered in mode static
- **THEN** the result is `See <<decision_6>>.`

### Requirement: A raw block shows its content literally

Content inside a raw block SHALL be output as written, with any macro or template syntax in it left unevaluated and the raw tags removed.

Source: both, jira (INTDEV-650, INTDEV-949)

#### Scenario: Macro inside a raw block is not evaluated

- **WHEN** the content `{{#raw}}{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}{{/raw}}` is rendered in mode static
- **THEN** the result is `{{#scoreCard}}"title": "Open issues", "value": 0 {{/scoreCard}}`

#### Scenario: Several raw blocks in one content

- **WHEN** content with three raw blocks holding RawContent1, RawContent2 and RawContent3 is rendered
- **THEN** all three texts appear in order and no raw tag remains

### Requirement: Nested or unclosed raw blocks are reported

A raw block that contains another raw block, or that has no closing tag, SHALL be reported as an inline macro error that names the line of the offending tag.

Source: code

#### Scenario: Nested raw block

- **WHEN** content whose raw block on line 1 contains a raw block on line 3 is rendered
- **THEN** the result contains a macro error naming line 3 and the outer block on line 1

#### Scenario: Unclosed raw block

- **WHEN** content with a raw block opened on line 1 and never closed is rendered
- **THEN** the result contains a macro error naming line 1

### Requirement: A failing macro is shown as an inline error

A macro that fails SHALL be replaced by a warning block titled Macro Error that explains the problem, and the rest of the content SHALL still be rendered.

Source: both, jira (INTDEV-858, INTDEV-880)

#### Scenario: Unknown card in an xref

- **WHEN** the content `{{#xref}}"cardKey": "non-existent-card"{{/xref}}` is rendered in mode static
- **THEN** the result contains a Macro Error block naming the card key non-existent-card

### Requirement: An inline error is set apart from the surrounding text

A macro error in the middle of a paragraph SHALL be rendered as a block of its own, separated from the text before and after it.

Source: code, jira (INTDEV-1299)

#### Scenario: Error between two pieces of text

- **WHEN** the content `before {{#xref}}"cardKey": "non-existent-card"{{/xref}} after` is rendered in mode static
- **THEN** the Macro Error block is separated from `before` by a blank line
- **AND** the text `after` follows the block without leading whitespace

### Requirement: Macro parameters must match the macro's format

A macro whose parameters are not valid JSON, lack a required parameter, give a parameter of the wrong type or give a parameter the macro does not define SHALL be shown as an inline error naming the problem.

Source: both

#### Scenario: Required parameter missing

- **WHEN** the content `{{#percentage}}"title": "No Value", "legend": "No Value"{{/percentage}}` is rendered
- **THEN** the result contains a Macro Error block naming the parameter value

#### Scenario: Parameter of the wrong type

- **WHEN** the content `{{#percentage}}"title": "T", "value": "not a number", "legend": "L"{{/percentage}}` is rendered
- **THEN** the result contains a Macro Error block saying the value must be a number

#### Scenario: Unknown parameter

- **WHEN** the content `{{#xref}}"invalidProperty": "test-value"{{/xref}}` is rendered
- **THEN** the result contains a Macro Error block

### Requirement: Macros produced by macros are evaluated

Macros that appear in the output of a macro, such as in an included card or a report, SHALL themselves be evaluated.

Source: both

#### Scenario: Include inside include

- **GIVEN** a card A whose content includes card B
- **WHEN** a card includes A
- **THEN** the result contains the content of both A and B

### Requirement: A macro is rendered according to the rendering mode

Rendering SHALL be requested in one of the modes static (self-contained, for documents), inject (for the app) or staticSite (for the exported site), and a macro without a specific output for a mode SHALL give its default output for it.

Source: code

#### Scenario: Same score card in three modes

- **WHEN** the same scoreCard macro is rendered in the modes inject, static and staticSite
- **THEN** inject and staticSite give inline SVG
- **AND** static gives an embedded image

### Requirement: An xref macro reference depends on the mode

The xref macro SHALL give an internal document reference in mode static, and a link labelled with the card title in the modes inject and staticSite.

Source: both, jira (INTDEV-987)

#### Scenario: Static reference

- **GIVEN** the card `xref-test-card` titled Test Card for Cross Reference
- **WHEN** its xref macro is rendered in mode static
- **THEN** the result is `<<xref-test-card>>`

#### Scenario: Site link carries the title

- **GIVEN** the same card
- **WHEN** its xref macro is rendered in mode staticSite
- **THEN** the result is a link to the card with the label Test Card for Cross Reference

### Requirement: Native AsciiDoc xrefs to cards become links

An AsciiDoc xref to a card in mode inject or staticSite SHALL become a link to that card in the project named by the card key's prefix, labelled with the given label or else the card title, with any anchor kept.

Source: both, jira (INTDEV-1288)

#### Scenario: Label falls back to the title

- **GIVEN** the card `docs_2` titled Getting started tutorial
- **WHEN** `Read xref:docs_2.adoc[].` is rendered with xrefs in mode inject
- **THEN** the result links to `docs_2` with the label Getting started tutorial

#### Scenario: Anchor is kept

- **WHEN** `xref:docs_12.adoc#installation[Install]` is rendered in mode inject
- **THEN** the link to `docs_12` keeps the anchor installation

### Requirement: Native AsciiDoc xrefs in a document are internal references

An AsciiDoc xref to a card in mode static SHALL become an internal reference to that card with the given label, drop any anchor, and warn once per card whose anchor was dropped.

Source: both

#### Scenario: Anchor dropped with a warning

- **WHEN** `xref:docs_12.adoc#sec[Section] and xref:docs_12.adoc#again[Again]` is rendered in mode static
- **THEN** the result is `<<docs_12,Section>> and <<docs_12,Again>>`
- **AND** one warning names `docs_12`

### Requirement: Native AsciiDoc xrefs to unknown targets are left as written

An AsciiDoc xref whose target is not a card of the project SHALL be left unchanged, with one warning per distinct target.

Source: code

#### Scenario: Unknown card

- **WHEN** `xref:missing_99.adoc[Missing]` is rendered
- **THEN** the result is unchanged
- **AND** one warning names `missing_99`

### Requirement: An image macro shows a card attachment

The image macro SHALL show the attachment named in its fileName parameter from the card in its cardKey parameter, or from the current card when none is given, with the optional alt and title.

Source: both

#### Scenario: Attachment of another card

- **GIVEN** the card `decision_1` with the attachment the-needle.heic
- **WHEN** `{{#image}}"fileName": "the-needle.heic", "cardKey": "decision_1"{{/image}}` is rendered
- **THEN** the result is an image of that attachment

#### Scenario: Alt text and title

- **WHEN** an image macro for the-needle.heic with alt Test image and title A test needle image is rendered
- **THEN** the image carries that alt text and title

### Requirement: An image macro refuses a missing attachment or card

The image macro SHALL show an inline error naming the file when the card has no such attachment, and an inline error naming the card when the card does not exist.

Source: both, jira (INTDEV-986)

#### Scenario: Attachment not found

- **WHEN** `{{#image}}"fileName": "non-existent-image.png"{{/image}}` is rendered
- **THEN** the result contains a Macro Error block naming non-existent-image.png

### Requirement: An include macro inserts another card

The include macro SHALL insert the content of the card in its cardKey parameter, with that card's title as a heading unless the title parameter says otherwise, and SHALL show an inline error naming the card when it does not exist.

Source: both, jira (INTDEV-748)

#### Scenario: Included card with title

- **GIVEN** the card `test-card` titled Test Card Title
- **WHEN** `{{#include}}"cardKey": "test-card"{{/include}}` is rendered
- **THEN** the result has the heading Test Card Title followed by the card's content

#### Scenario: Missing card

- **WHEN** an include macro names `non-existent-card`
- **THEN** the result contains a Macro Error block saying the card does not exist

### Requirement: The include title parameter selects the title and content

The title parameter of the include macro SHALL be include (title and content), exclude (content only) or only (title only).

Source: docs

#### Scenario: Title only

- **WHEN** the include macro for `test-card` has title only
- **THEN** the result has the heading Test Card Title and none of the card's content

### Requirement: The include levelOffset shifts section levels within limits

The levelOffset parameter of the include macro SHALL shift the level of the included section titles, and only those, by the given number, clamped between level 1 and the maximum supported level, and a value that is not a number MUST give an inline error.

Source: both

#### Scenario: Offset +1

- **GIVEN** `test-card` with a title and the section Test subtitle
- **WHEN** it is included with levelOffset +1
- **THEN** the title becomes a level 2 heading and Test subtitle a level 3 heading

#### Scenario: Offset below level 1

- **WHEN** it is included with levelOffset -10
- **THEN** both headings are level 1

#### Scenario: Offset is not a number

- **WHEN** it is included with levelOffset test
- **THEN** the result contains a Macro Error block naming the invalid offset test

### Requirement: Included page titles can be discrete headings

With pageTitles discrete the include macro SHALL write included titles as discrete headings, and otherwise as normal headings.

Source: docs

#### Scenario: Discrete headings

- **WHEN** `test-card` is included with pageTitles discrete
- **THEN** the card title is marked as a discrete heading

### Requirement: Include whitespace can be trimmed

With whitespace trim the include macro SHALL remove the initial and final whitespace of its output, and otherwise SHALL keep it.

Source: both

#### Scenario: Trimmed JSON content

- **GIVEN** a card whose content is `{"key": "value", "number": 42}`
- **WHEN** it is included with title exclude and whitespace trim
- **THEN** the result is exactly `{"key": "value", "number": 42}`

### Requirement: Included content can be escaped for JSON or CSV

The escape parameter of the include macro SHALL escape the included content for a JSON string or a CSV field, and SHALL be refused with an inline error unless the title parameter is exclude.

Source: both

#### Scenario: CSV escape

- **GIVEN** a card with content `Content with "quotes" inside`
- **WHEN** it is included with title exclude, whitespace trim and escape csv
- **THEN** the result is `Content with ""quotes"" inside`

#### Scenario: Escape with a title

- **WHEN** a card is included with escape json and the title included
- **THEN** the result contains a Macro Error block

### Requirement: Included content is evaluated in the context of the included card

The content inserted by an include macro SHALL have its own macros evaluated with the included card as the current card, and its raw blocks SHALL stay literal.

Source: code

#### Scenario: Current card is the included card

- **GIVEN** `test-card` whose content shows the current card key
- **WHEN** it is included from the card `original-card-key`
- **THEN** the result shows `test-card`

### Requirement: An included card cannot leave a block open

A block that the included content leaves unterminated SHALL be closed so that the content after the include macro is not absorbed into it.

Source: code

#### Scenario: Unterminated table

- **GIVEN** a card whose content opens a table and never closes it
- **WHEN** it is included with title exclude and followed by the text After
- **THEN** the table is closed and After follows it

### Requirement: A createCards macro offers card creation only in the app

The createCards macro SHALL produce a button that creates cards from the template in its template parameter, labelled with its buttonLabel parameter, in mode inject, and SHALL produce nothing in the modes static and staticSite.

Source: both

#### Scenario: Button in the app

- **WHEN** a createCards macro with template `base/templates/page` and buttonLabel Create a new page is rendered in mode inject
- **THEN** the result contains a button that creates cards from `base/templates/page`

#### Scenario: Nothing in an exported site

- **WHEN** the same macro is rendered in mode staticSite
- **THEN** the result contains no card creation button

### Requirement: A createCards link must be complete

A createCards macro with a link parameter SHALL be refused with an inline error unless the link names linkType, direction and cardKey.

Source: both, jira (INTDEV-830)

#### Scenario: Link without direction

- **WHEN** a createCards macro has a link with linkType and cardKey but no direction
- **THEN** the result contains a Macro Error block

### Requirement: A report macro embeds the output of a report

The report macro SHALL embed the output of the report in its name parameter, using the card in its cardKey parameter or else the current card as context, as specified in `reports`.

Source: both, jira (INTDEV-1246)

#### Scenario: Report with a runtime error

- **GIVEN** the report `decision/reports/divideByZeroReport` that divides by zero
- **WHEN** a report macro names it
- **THEN** the result contains a Macro Error block naming the division by zero

### Requirement: A graph macro embeds a graph

The graph macro SHALL embed the image of the graph model in its model parameter shown with the graph view in its view parameter, with the card in its cardKey parameter or else the current card as context, as specified in `graphs`, and SHALL refuse parameters that the view's own parameter format rejects.

Source: both, jira (INTDEV-950)

#### Scenario: Workflow graph

- **WHEN** a graph macro names model `base/graphModels/workflow`, view `base/graphViews/workflow` and workflow `base/workflows/page`
- **THEN** the result is an image of that workflow's state machine

### Requirement: A percentage macro shows a percentage

The percentage macro SHALL show the value of its value parameter as a percentage with the given title and legend and the optional colour blue, green, yellow, red, orange or purple.

Source: both, jira (INTDEV-558)

#### Scenario: Percentage in the app

- **WHEN** a percentage macro with title Test Percentage, value 85, legend of Assets and colour red is rendered in mode inject
- **THEN** the result is an SVG showing Test Percentage and 85%

### Requirement: A scoreCard macro shows a value

The scoreCard macro SHALL show the value of its value parameter with the optional title, unit and legend.

Source: both, jira (INTDEV-922)

#### Scenario: Scorecard without optional parameters

- **WHEN** `{{#scoreCard}}"value": 0{{/scoreCard}}` is rendered in mode static
- **THEN** the result is an embedded image

### Requirement: Vega and Vega-Lite macros draw a chart from a specification

The vega and vegaLite macros SHALL draw the chart described by their spec parameter, and SHALL refuse a spec in the wrong format.

Source: docs

#### Scenario: Pie chart in a document

- **WHEN** a vegaLite macro with an arc-mark spec is rendered in mode static
- **THEN** the result is an embedded image of the chart

### Requirement: A mermaid macro draws a diagram

The mermaid macro SHALL draw the diagram given in its code parameter, as an embedded image in mode static.

Source: code, jira (INTDEV-1294)

#### Scenario: Diagram in a document

- **WHEN** a mermaid macro with a flowchart is rendered in mode static
- **THEN** the result is an embedded image
