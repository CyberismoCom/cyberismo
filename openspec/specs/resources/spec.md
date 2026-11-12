# resources Specification

## Purpose

Resources are the configuration items of a project and its modules: workflows, card types, field types, link types, templates, calculations, reports, graph models, graph views and skills. This capability covers the rules every resource type shares: names, create, show, list, edit, rename, remove, usage, content files, validation and the read-only status of module resources and module cards. Rules of one type, and what a change does to that type's dependants, are in the capability of that type.

## Requirements

### Requirement: A resource name has a prefix, a type and an identifier

A resource SHALL be named `<prefix>/<type>/<identifier>`, where the prefix is that of the project or module that owns it.

Source: docs

#### Scenario: Created resource carries the project prefix

- **GIVEN** a project with the prefix `test`
- **WHEN** the field type `size` is created with the data type integer
- **THEN** the project lists the field type as `test/fieldTypes/size`

### Requirement: Identifiers use a restricted character set

A resource identifier SHALL be 1 to 255 characters of letters, digits, `.`, `_` and `-`; any other identifier MUST be refused.

Source: code

#### Scenario: Identifier with a space is refused

- **GIVEN** the project `test`
- **WHEN** a field type is created with the identifier `no spaces`
- **THEN** the creation is refused with an error that the identifier must follow the naming rules
- **AND** the project is unchanged

#### Scenario: Identifier with non-ASCII letters is refused

- **GIVEN** the project `test`
- **WHEN** a card type is created with the identifier `new-ööö`
- **THEN** the creation is refused with an error that the identifier must follow the naming rules

### Requirement: Resources are created with the bare identifier or the full name

Creating a resource SHALL accept either the bare identifier or the full name of the project's own prefix and type.

Source: code

#### Scenario: Full name given

- **GIVEN** the project `test`
- **WHEN** the field type `test/fieldTypes/full` is created with the data type integer
- **THEN** `test/fieldTypes/full` can be shown with the data type integer

### Requirement: A new resource gets the defaults of its type

A resource created without content SHALL have an empty display name and the default content of its type.

Source: code

#### Scenario: Default workflow

- **GIVEN** the project `test`
- **WHEN** the workflow `fresh` is created without content
- **THEN** `test/workflows/fresh` has the states Draft (initial), Approved (closed) and Deprecated (closed)
- **AND** it has the transitions Create from the empty state to Draft, Approve from Draft to Approved and Archive from `*` to Deprecated

#### Scenario: Default calculation

- **GIVEN** the project `test`
- **WHEN** the calculation `fresh` is created without content
- **THEN** showing `test/calculations/fresh` returns a calculation content holding only a comment

### Requirement: A resource can be created from given content

Creating a resource with content SHALL store that content, with its name set to the new resource's name.

Source: code

#### Scenario: Content carries another name

- **GIVEN** the project `test`
- **WHEN** the template `given` is created with the content name `ignored`, display name `Mine` and category `Group`
- **THEN** showing `test/templates/given` returns the name `test/templates/given`, display name `Mine` and category `Group`

#### Scenario: Content missing a mandatory property is refused

- **GIVEN** the project `test`
- **WHEN** the template `x` is created with content that has no name
- **THEN** the creation is refused with an error naming the missing property
- **AND** the project is unchanged

### Requirement: Creating an existing resource is refused

Creating a resource whose name is already in use SHALL be refused.

Source: code

#### Scenario: Name already used

- **GIVEN** the field type `test/fieldTypes/size`
- **WHEN** a field type `size` is created
- **THEN** the creation is refused with an error that `size` already exists
- **AND** the project is unchanged

### Requirement: The type in a full name must match the type created

Creating a resource with a full name SHALL be refused when the type part of the name is not the type requested.

Source: code

#### Scenario: Workflow name for a field type

- **GIVEN** the project `test`
- **WHEN** a field type is created with the name `test/workflows/x`
- **THEN** the creation is refused with an error that the name is not of type fieldTypes

### Requirement: Resources are created only under the project's own prefix

Creating a resource SHALL be refused when its prefix belongs to a module or is not a prefix of the project.

Source: code

#### Scenario: Module prefix

- **GIVEN** the project `test` and an imported module `mod`
- **WHEN** the field type `mod/fieldTypes/x` is created
- **THEN** the creation is refused with an error that module resources cannot be changed

#### Scenario: Unknown prefix

- **GIVEN** the project `test`
- **WHEN** the field type `nope/fieldTypes/x` is created
- **THEN** the creation is refused with an error that the prefix is not included in the project

### Requirement: Module resources are read-only

Editing, renaming or removing a resource that belongs to an imported module SHALL be refused.

Source: both

#### Scenario: Module workflow edited

- **GIVEN** the module workflow `mod/workflows/mflow`
- **WHEN** its display name is changed to `x`
- **THEN** the edit is refused with an error that module resources cannot be updated
- **AND** the workflow is unchanged

#### Scenario: Module card type removed

- **GIVEN** the module card type `mod/cardTypes/mtype`
- **WHEN** it is removed
- **THEN** the removal is refused with an error that it is a module resource

#### Scenario: Module field type renamed

- **GIVEN** the module field type `mod/fieldTypes/mfield`
- **WHEN** it is renamed to `y`
- **THEN** the rename is refused with an error that it is a module resource

### Requirement: Cards of installed modules are read-only

Editing the content of, moving, ranking or removing a card of an installed module's template, adding or removing its attachments, and adding cards to that template MUST be refused with an error saying the module is read-only, and the project SHALL be unchanged.

Source: code

#### Scenario: Module template card edited

- **GIVEN** the installed module `mod` with the template card M1 of `mod/templates/mt`
- **WHEN** the content of M1 is edited
- **THEN** the edit is refused with an error saying the card is read-only
- **AND** the project is unchanged

#### Scenario: Module template card removed

- **GIVEN** the template card M1 of the installed module template `mod/templates/mt`
- **WHEN** M1 is removed
- **THEN** the removal is refused with an error saying an imported module cannot be modified
- **AND** M1 is still found

#### Scenario: Card added to a module template

- **GIVEN** the installed module template `mod/templates/mt`
- **WHEN** a card is added to `mod/templates/mt`
- **THEN** it is refused with an error saying the template is imported or read-only

### Requirement: Show returns the metadata of a resource

Showing a resource SHALL return its stored metadata, for resources of the project and of its modules alike.

Source: code

#### Scenario: Link type shown

- **GIVEN** the link type `test/linkTypes/rel` with outbound display name `rel out`
- **WHEN** `test/linkTypes/rel` is shown
- **THEN** the result has the name `test/linkTypes/rel`, outbound display name `rel out` and inbound display name `rel in`

#### Scenario: Module resource shown

- **GIVEN** the module workflow `mod/workflows/mflow`
- **WHEN** `mod/workflows/mflow` is shown
- **THEN** the result has the name `mod/workflows/mflow`

### Requirement: Show returns the content of a resource that has files

Showing a resource that holds content files SHALL return that content with its metadata.

Source: code

#### Scenario: Calculation shown

- **GIVEN** the calculation `test/calculations/calc` whose program is `fact(1).`
- **WHEN** it is shown
- **THEN** the result's content has the calculation `fact(1).`

### Requirement: Showing a missing resource is refused

Showing a resource that does not exist SHALL be refused with a not-found error.

Source: code

#### Scenario: Unknown workflow

- **GIVEN** no workflow `test/workflows/missing`
- **WHEN** `test/workflows/missing` is shown
- **THEN** the request is refused with a not-found error naming the resource

### Requirement: Listing returns the names of a type, sorted

Listing a resource type SHALL return the names of the resources of that type from the project and its modules, sorted by name.

Source: code

#### Scenario: Project and module workflows

- **GIVEN** the workflows `test/workflows/flow` and `test/workflows/other` and the module workflow `mod/workflows/mflow`
- **WHEN** the workflows are listed
- **THEN** the result is `mod/workflows/mflow`, `test/workflows/flow`, `test/workflows/other`

#### Scenario: Unknown type

- **GIVEN** any project
- **WHEN** the type `colours` is listed
- **THEN** the result is empty

### Requirement: Common properties of any resource can be edited

Editing SHALL set the display name, description and category of any resource type.

Source: code

#### Scenario: Metadata of a field type edited

- **GIVEN** a field type `test/fieldTypes/x`
- **WHEN** its display name is changed to `Shown`, its description to `About` and its category to `Group`
- **THEN** showing `test/fieldTypes/x` returns display name `Shown`, description `About` and category `Group`

### Requirement: An edit of a property the type does not have is refused

Editing a property that is empty or unknown for the resource's type SHALL be refused with an error saying no change is defined for it.

Source: code

#### Scenario: Unknown key

- **GIVEN** the card type `test/cardTypes/page`
- **WHEN** the property `colour` is changed to `red`
- **THEN** the edit is refused with an error that no change is defined for the property
- **AND** the card type is unchanged

#### Scenario: Property of another type

- **GIVEN** the template `test/templates/tpl`
- **WHEN** its property `workflow` is changed
- **THEN** the edit is refused with an error that no change is defined for the property

### Requirement: Adding to or ranking a single value is refused

An add or rank operation on a property that holds a single value SHALL be refused.

Source: code

#### Scenario: Add to a display name

- **GIVEN** the card type `test/cardTypes/page`
- **WHEN** a value is added to its display name
- **THEN** the edit is refused with an error that the operation cannot be done on a scalar value

### Requirement: Editing a missing resource is refused

Editing a resource that does not exist SHALL be refused with a not-found error.

Source: code

#### Scenario: Unknown workflow

- **GIVEN** no workflow `test/workflows/missing`
- **WHEN** its display name is changed to `x`
- **THEN** the edit is refused with a not-found error

### Requirement: Content files of a resource can be edited

Editing a content property of a resource that holds files SHALL replace that file's content.

Source: code

#### Scenario: Report content template

- **GIVEN** the report `test/reports/x`
- **WHEN** its contentTemplate is changed to `% changed`
- **THEN** showing `test/reports/x` returns the contentTemplate `% changed`

#### Scenario: Report parameter schema given as JSON text

- **GIVEN** the report `test/reports/x`
- **WHEN** its schema is changed to the text `{"type":"object"}`
- **THEN** showing `test/reports/x` returns the schema as the object with type object

### Requirement: Invalid content for a file is refused

An edit SHALL be refused when a logic program is not valid or a schema is not valid JSON.

Source: code

#### Scenario: Invalid program

- **GIVEN** the calculation `test/calculations/calc`
- **WHEN** its calculation is changed to `result(`
- **THEN** the edit is refused with an error that the logic program is invalid
- **AND** the calculation is unchanged

#### Scenario: Schema not JSON

- **GIVEN** the report `test/reports/x`
- **WHEN** its schema is changed to `{not json`
- **THEN** the edit is refused with an error that the JSON content is invalid

### Requirement: Validating a resource reports its problems

Validating one resource SHALL return an empty result when it is valid and otherwise a message naming each problem.

Source: code

#### Scenario: Fresh resource is valid

- **GIVEN** a newly created report `test/reports/x`
- **WHEN** it is validated
- **THEN** the result is empty

#### Scenario: Calculation with an invalid program

- **GIVEN** the calculation `test/calculations/bad` holding `result(`
- **WHEN** it is validated
- **THEN** the result says the logic program for `test/calculations/bad` is invalid

### Requirement: Renaming moves a resource and its files

Renaming a resource SHALL give it the new identifier and move its content files with it, so that it is no longer available under the old name.

Source: both

#### Scenario: Report renamed

- **GIVEN** the report `test/reports/x` with content files
- **WHEN** it is renamed to `y`
- **THEN** `test/reports/y` shows the same content under the name `test/reports/y`
- **AND** showing `test/reports/x` is refused as not found

### Requirement: Renaming rewrites references to the resource

Renaming a resource SHALL rewrite its name in card content and in the content of calculations and reports of the project.

Source: both

#### Scenario: Reference in a card and a calculation

- **GIVEN** a card whose content is `see test/reports/x and more` and a calculation containing `% see test/reports/x and more`
- **WHEN** `test/reports/x` is renamed to `y`
- **THEN** the card content is `see test/reports/y and more`
- **AND** the calculation contains `% see test/reports/y and more`

### Requirement: Renaming to an invalid identifier is refused

A rename to an empty identifier or one that breaks the naming rules SHALL be refused.

Source: code

#### Scenario: Space in the new identifier

- **GIVEN** the workflow `test/workflows/flow`
- **WHEN** it is renamed to `no spaces`
- **THEN** the rename is refused with an error that the identifier must follow the naming rules
- **AND** the workflow is unchanged

#### Scenario: Empty new identifier

- **GIVEN** the field type `test/fieldTypes/spare`
- **WHEN** it is renamed to the empty identifier
- **THEN** the rename is refused with an error that the identifier is missing

### Requirement: Removing a resource removes its files

Removing a resource SHALL delete it and its content files so that it can no longer be shown, whether it is named in full or by its bare identifier and type.

Source: both

#### Scenario: Remove by bare identifier

- **GIVEN** the report `test/reports/x` with content files
- **WHEN** the report `x` is removed
- **THEN** showing `test/reports/x` is refused as not found

### Requirement: Removing is not stopped by references to the resource

Removing a resource SHALL succeed even when cards or other resources name it, and those references are left as they are.

Source: code

#### Scenario: Card still names the removed template

- **GIVEN** a card whose content is `Built on test/templates/tpl.`
- **WHEN** `test/templates/tpl` is removed
- **THEN** the card's content is still `Built on test/templates/tpl.`

### Requirement: Removing a missing resource is refused

Removing a resource that does not exist SHALL be refused with a not-found error and leave the project unchanged.

Source: code

#### Scenario: Unknown report

- **GIVEN** no report `test/reports/missing`
- **WHEN** it is removed
- **THEN** the removal is refused with a not-found error
- **AND** the project is unchanged

### Requirement: Usage lists the places that refer to a resource

Usage of a resource SHALL list the cards that refer to it, then the resources that refer to it, then the calculations that name it.

Source: code

#### Scenario: Template named by a card and a calculation

- **GIVEN** card C0 whose content names `test/templates/x` and the calculation `test/calculations/c` that names it
- **WHEN** usage of `test/templates/x` is requested
- **THEN** the result is C0 followed by `test/calculations/c`

#### Scenario: Workflow used by a card type

- **GIVEN** the card type `test/cardTypes/page` that uses `test/workflows/flow`
- **WHEN** usage of `test/workflows/flow` is requested
- **THEN** the result is `test/cardTypes/page`

### Requirement: Usage of a missing resource is refused

Asking for the usage of a resource that does not exist SHALL be refused with a not-found error.

Source: code

#### Scenario: Unknown workflow

- **GIVEN** no workflow `test/workflows/missing`
- **WHEN** its usage is requested
- **THEN** the request is refused with a not-found error
- **AND** the project is unchanged
