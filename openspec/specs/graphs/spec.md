# graphs Specification

## Purpose

A graph is drawn from a graph model and a graph view, both project resources written as logic programs, and is produced as an SVG image. This capability covers the two resources, how a graph is described and the image that results. The graph macro that embeds a graph in card content is specified in `macros`; the workflow diagram is in `workflows`; creating, editing and removing resources in general is in `resources`.

## Requirements

### Requirement: A graph model and a graph view each require a name and a display name

A graph model and a graph view SHALL each have a name and a display name, and MUST NOT have properties other than name, display name, description and category.

Source: code

#### Scenario: Graph model without a display name

- **GIVEN** the project prefix `test`
- **WHEN** the graph model `test/graphModels/m` is created from content that has no display name
- **THEN** the creation is refused with an error naming displayName

#### Scenario: Graph view with an unknown property

- **GIVEN** the project prefix `test`
- **WHEN** the graph view `test/graphViews/v` is created from content that has the property `color`
- **THEN** the creation is refused with an error naming the property color

### Requirement: A graph model holds a logic program and a graph view holds a template

A graph model SHALL hold a logic program that describes a graph, and a graph view SHALL hold a template for a logic program and a parameter schema, each of which can be read and changed as the content of the resource.

Source: both

#### Scenario: View template changed

- **GIVEN** the graph view `test/graphViews/x`
- **WHEN** its view template is changed to `% changed`
- **THEN** showing `test/graphViews/x` returns the view template `% changed`

### Requirement: A graph combines a model, a view and the main program

A graph SHALL be produced by evaluating the graph model and the graph view together with the main program of the project.

Source: both

#### Scenario: Model reads project cards

- **GIVEN** a project with the card Top and a model `node(Card) :- card(Card).` with a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the resulting image contains one node for each card of the project

### Requirement: A graph view is a template over the macro parameters

A graph view SHALL be expanded as a template with the parameters of the graph before it is run, and the `cardKey` parameter SHALL default to the card holding the graph.

Source: both

#### Scenario: View selects a card

- **GIVEN** a model that draws the card tree under each card for which `view(Card)` holds, and the view `view({{cardKey}}).`
- **WHEN** a graph with that model and view is rendered in the content of card Top
- **THEN** the resulting image shows Top and its descendants only

### Requirement: Graph macro parameters are checked against the view's schema

The parameters of a graph SHALL be checked against the parameter schema of its graph view, which by default requires a model and a view and accepts a card key.

Source: both, jira (INTDEV-950)

#### Scenario: Missing view parameter

- **GIVEN** the graph view `test/graphViews/v` with the default parameter schema
- **WHEN** content holding a graph with the model `test/graphModels/m` and no view is rendered
- **THEN** the rendered content reports a macro error for the graph

### Requirement: Graph view templates can compare values

A graph view template SHALL provide the helpers `eq` and `ne` that test whether two values are equal or not equal.

Source: code, jira (INTDEV-1203)

#### Scenario: View chooses by a parameter

- **GIVEN** the model `node(N) :- shown(N).`, and a graph view whose parameter schema accepts `kind` and whose template is `{{#if (eq kind "one")}}shown(a).{{/if}}{{#if (ne kind "one")}}shown(b).{{/if}}`
- **WHEN** content holding a graph with that model, that view and the kind one is rendered
- **THEN** the image contains the node a and not the node b

### Requirement: A graph view can come from another module than its model

A graph view SHALL be usable with a graph model that belongs to another module or to the project.

Source: docs

#### Scenario: Project view of a module model

- **GIVEN** the graph model `base/graphModels/workflow` of the module base and the graph view `test/graphViews/mine` of the project
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the rendered content holds the image of the graph

### Requirement: A graph is produced as an SVG image

A graph SHALL be produced as an SVG image.

Source: both

#### Scenario: Two nodes and an edge

- **GIVEN** a model with `node(n1). attr(node, n1, "label", "Node 1"). node(n2). attr(node, n2, "label", "Node 2"). edge((n1, n2)).` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the rendered content holds an SVG image containing the labels Node 1 and Node 2

### Requirement: Nodes and edges without a graph belong to the default graph

A node or an edge declared with one argument SHALL belong to the graph named `default`, and a graph with such a node or edge SHALL exist.

Source: both, jira (INTDEV-952)

#### Scenario: Edge without an identifier

- **GIVEN** a model with `node(a). node(b). edge((a, b)).` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the image contains one edge from a to b

### Requirement: A graph can be given a name

A model SHALL be able to name its top-level graph with `graph(Graph)` and place nodes and edges in it with a second argument.

Source: docs

#### Scenario: Named graph

- **GIVEN** a model with `graph(g). node(a, g). attr(node, a, "label", "Alpha").` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the image contains the label Alpha

### Requirement: A subgraph is drawn as a cluster

A graph declared with `graph(Subgraph, Graph)` SHALL be drawn as a cluster with a bounding rectangle that holds its nodes.

Source: both

#### Scenario: Subgraph with a node

- **GIVEN** a model with `graph(sub, default). node(a, sub). attr(node, a, "label", "Inside").` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the image contains a cluster that holds the label Inside

### Requirement: Edges with an identifier are distinct

Edges that have the same source and destination SHALL be drawn separately when their identifiers differ.

Source: both

#### Scenario: Two edges between two nodes

- **GIVEN** a model with `node(a). node(b). edge((a, b, one)). edge((a, b, two)).` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the image contains two edges from a to b

### Requirement: Attributes style graphs, nodes and edges

`attr` terms SHALL set the Graphviz attributes of a graph, a node or an edge, including the label.

Source: docs

#### Scenario: Rank direction

- **GIVEN** a model with `node(a). node(b). edge((a, b)). attr(graph, default, "rankdir", "LR").` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** node b is drawn to the right of node a

### Requirement: The image is sanitized

Active content in the SVG image of a graph, such as scripts and script links, SHALL be removed.

Source: code

#### Scenario: Script link on a node

- **GIVEN** a model with `node(a). attr(node, a, "href", "javascript:alert(1)").` and a view whose template holds only a comment
- **WHEN** content holding a graph with that model and view is rendered
- **THEN** the image contains no `javascript:` link

### Requirement: A failing graph names its model and view

A graph whose logic program cannot be evaluated SHALL fail with an error that names the graph model and the graph view and carries the diagnostics.

Source: code

#### Scenario: Syntax error in the model

- **GIVEN** the graph model `test/graphModels/bad` with the content `node(a`
- **WHEN** content holding a graph with that model and the view `test/graphViews/v` is rendered
- **THEN** the rendered content reports a macro error naming `test/graphModels/bad` and `test/graphViews/v`
