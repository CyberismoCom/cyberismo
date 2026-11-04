# ui/macros Specification

## Purpose

How macros in card content look and behave in the app, and the dialogs that insert them while editing. What each macro means, its parameters and its validation are defined in `macros`; the data behind them comes from `reports`, `graphs`, `cards/creation` and `cards/attachments`; who can edit is decided as specified in `rest/auth`.

## Requirements

### Requirement: The content editor offers a macro menu

While editing content, the editor toolbar SHALL offer a menu of macros that open an insert dialog: Include a card, Cross reference, Create cards, Report and Graph.

Source: code

#### Scenario: Menu opened

- **GIVEN** a user with the content editor open
- **WHEN** the user opens the macro menu in the editor toolbar
- **THEN** the entries Include a card, Cross reference, Create cards, Report and Graph are listed

### Requirement: A macro dialog inserts the macro or is cancelled

Each macro dialog SHALL have an Insert macro button that adds the macro to the content at the cursor and closes the dialog, and a Cancel button that closes it without changing the content.

Source: code

#### Scenario: Dialog cancelled

- **GIVEN** the Create cards dialog is open over empty content
- **WHEN** the user clicks Cancel
- **THEN** the dialog closes and the content stays empty

### Requirement: The Create cards dialog asks for a template and a button label

The Create cards dialog SHALL let the user pick a template from a list and enter the button text, and the inserted macro SHALL render as a button with that text.

Source: code

#### Scenario: Macro inserted

- **GIVEN** the Create cards dialog is open
- **WHEN** the user selects the template Page, enters the button text Create empty page and clicks Insert macro, then saves the content
- **THEN** the card shows a button Create empty page

### Requirement: The Include dialog asks for the card and presentation options

The Include a card dialog SHALL ask for the card to include through a searchable list, a level offset with an explanatory tooltip, an Include title choice and a Page titles choice.

Source: code

#### Scenario: Dialog fields

- **GIVEN** the Include a card dialog is open
- **WHEN** the dialog is shown
- **THEN** the labels Card, Level offset, Include title and Page titles are shown
- **AND** hovering the Level offset help mark shows its explanation

### Requirement: The Cross reference dialog asks for a card

The Cross reference dialog SHALL ask for the target card through a searchable list showing each card's title and key.

Source: code

#### Scenario: Card chosen

- **GIVEN** the Cross reference dialog is open
- **WHEN** the user opens the card list
- **THEN** an option reads Create cards page followed by its key in brackets

### Requirement: The Report and Graph dialogs offer the project's reports, models and views

The Report dialog SHALL offer a list of the available reports, and the Graph dialog SHALL offer lists of the available graph models and graph views.

Source: code

#### Scenario: Graph dialog

- **GIVEN** the Graph dialog is open
- **WHEN** the user opens the Graph model list
- **THEN** the option bat/graphModels/test1 is listed

### Requirement: A Create cards button creates cards and opens the first one

Clicking a rendered Create cards button SHALL create the cards as defined in `macros` and `cards/creation`, show a Card created successfully notice, and open the first new card.

Source: both

#### Scenario: Button clicked

- **GIVEN** a card with a button Test Create All data types page
- **WHEN** the user clicks the button
- **THEN** a Card created successfully notice is shown
- **AND** the heading Test all data types of custom fields is shown

### Requirement: A Create cards button is disabled for users who cannot edit

The Create cards button SHALL be disabled for users who cannot edit, with a tooltip saying that editor permissions are needed.

Source: code

#### Scenario: User who cannot edit

- **GIVEN** a user who cannot edit viewing a card with a Create cards button
- **WHEN** the user hovers the button
- **THEN** the button is disabled and the tooltip You need editor permissions to do this is shown

### Requirement: In preview a Create cards button creates nothing

In the content editor's preview, clicking a Create cards button SHALL show a notice that creating cards is not supported in preview and SHALL NOT create any card.

Source: code

#### Scenario: Button clicked in preview

- **GIVEN** the content editor in preview showing a Create cards button
- **WHEN** the user clicks the button
- **THEN** a notice says creating cards with this macro is not supported in preview mode
- **AND** the tree gains no card

### Requirement: A graph macro shows its diagram with fullscreen and download controls

A rendered graph SHALL show its diagram with a fullscreen button and a download button.

Source: both

#### Scenario: Graph shown

- **GIVEN** a card with a Graph macro using model bat/graphModels/test1 and view bat/graphViews/test1
- **WHEN** the card is shown
- **THEN** a diagram containing Test notifications and policy checks is shown with fullscreen and download buttons

### Requirement: The fullscreen button opens the diagram in a viewer

The fullscreen button of a diagram SHALL open it in a viewer that can be closed.

Source: code

#### Scenario: Fullscreen

- **GIVEN** a card showing a diagram
- **WHEN** the user clicks fullscreen
- **THEN** a viewer showing the diagram opens

### Requirement: The download button saves the diagram as an SVG file

The download button of a diagram SHALL save the diagram as an SVG file named after the diagram.

Source: code

#### Scenario: Download

- **GIVEN** a card showing a diagram
- **WHEN** the user clicks download
- **THEN** the browser downloads a file ending in diagram.svg

### Requirement: Links inside a diagram navigate within the app

Clicking a link inside a diagram that points to a page of the app SHALL open that page without a full page load.

Source: code

#### Scenario: Diagram link

- **GIVEN** a diagram containing a link to a card of the project
- **WHEN** the user clicks the link
- **THEN** that card is shown

### Requirement: A mermaid block is drawn as a diagram

A mermaid block in card content SHALL be drawn as a diagram with the same fullscreen and download buttons, in the colours of the current theme, and when it cannot be drawn SHALL show a red Mermaid diagram error message.

Source: code

#### Scenario: Invalid diagram

- **GIVEN** a card with a mermaid block whose text is not valid
- **WHEN** the card is shown
- **THEN** a red message beginning Mermaid diagram error is shown

### Requirement: The include macro shows the included card's content in place

A rendered Include macro SHALL show the included card's content, including its Create cards buttons, where the macro stands, with the heading and title treatment chosen as defined in `macros`.

Source: both

#### Scenario: Included buttons

- **GIVEN** a card Untitled page containing an Include macro for the card Create cards page
- **WHEN** Untitled page is shown
- **THEN** the buttons of Create cards page are shown in it
- **AND** a heading Create cards page is shown one level below the page title

### Requirement: The cross reference macro renders a link to the card

A rendered Cross reference macro SHALL show the target card's title as a link that opens the card.

Source: both

#### Scenario: Link rendered

- **GIVEN** a card containing a Cross reference macro to Create cards page
- **WHEN** the card is shown
- **THEN** a link Create cards page is shown pointing to that card

### Requirement: The image macro shows an attached image

A rendered Image macro SHALL show the named image attachment of the card.

Source: both

#### Scenario: Attachment shown

- **GIVEN** a card with an attachment cyberismo.png and an Image macro naming it
- **WHEN** the card is shown
- **THEN** the image is shown with the alternative text cyberismo

### Requirement: The percentage macro shows a ring with value and legend

A rendered Percentage macro SHALL show its title, the value as a percentage, its legend and a ring in the chosen colour.

Source: both

#### Scenario: Percentage shown

- **GIVEN** a Percentage macro with title Work done, value 2, legend of Assets and colour blue
- **WHEN** the card is shown
- **THEN** the widget shows Work done, 2% and of Assets with a blue ring

### Requirement: The score card macro shows value, unit and legend

A rendered Score card macro SHALL show its title, its value with the unit, and its legend as a card.

Source: both

#### Scenario: Score card shown

- **GIVEN** a Score card macro with title Security control adoption, value 30, unit % and legend In progress
- **WHEN** the card is shown
- **THEN** a card shows Security control adoption, 30 %, and In progress

### Requirement: The report macro shows the report's output

A rendered Report macro SHALL show the output of the named report in the card content.

Source: both

#### Scenario: Report shown

- **GIVEN** a Report macro naming bat/reports/test1
- **WHEN** the card is shown
- **THEN** the report output is shown in the content

### Requirement: The Vega and Vega-Lite macros draw a chart

A rendered Vega-Lite or Vega macro SHALL draw the chart described by its specification.

Source: both

#### Scenario: Pie chart

- **GIVEN** a Vega-Lite macro with a pie chart specification
- **WHEN** the card is shown
- **THEN** a chart is drawn in the content

### Requirement: Macro text parameters cannot inject markup

Text parameters of macros SHALL be shown as text; markup in a title, unit or legend SHALL NOT run or appear as elements.

Source: code

#### Scenario: Script in a title

- **GIVEN** a Score card macro whose title is a script element
- **WHEN** the card is shown
- **THEN** the card is shown with no script element
- **AND** no browser dialog opens

### Requirement: A graph diagram scales to the content width

A rendered graph SHALL be drawn without a fixed width or height, so that it scales to the space the content gives it.

Source: code

#### Scenario: Narrow window

- **GIVEN** a card whose content holds a graph wider than the window
- **WHEN** the card is shown in a narrow window
- **THEN** the whole diagram is shown within the content width
