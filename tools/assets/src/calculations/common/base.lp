%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(C).
ancestor(A, C) :- parent(A, C), card(A), template(C).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), template(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

projectCard(C) :- card(C), field(C, "container", "project").
templateCard(C) :- card(C), field(C, "container", "template").

% Built-in fields (card/connector metadata written directly by the data
% handler, not schema-defined custom fields) have no field-type resource
% file to carry a "dataType" fact. Declare them here as ordinary field
% types instead, so field(F, "dataType", T) is the single source of truth
% for every field's data type, built-in or custom.
fieldType("lastUpdated").
field("lastUpdated", "dataType", "dateTime").

fieldType("createdAt").
field("createdAt", "dataType", "dateTime").

fieldType("lastSynchronised").
field("lastSynchronised", "dataType", "dateTime").

fieldType("progress").
field("progress", "dataType", "integer").

% "index" is not a card field either - it's the query layer's own field name
% for enum-value and visible-field ordering (see queries/card.lp), always an
% integer regardless of subject. Declared here rather than in the query
% layer so field(_, "dataType", _) keeps a single writer.
fieldType("index").
field("index", "dataType", "integer").

% add workflow state category as a calculated field for Cards
field(Card, "workflowStateCategory", Category) :-
    card(Card),
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).

% app-relative path for navigating to a card, e.g. as an href in a graph view.
% Only project cards have one; template cards are viewed under /configuration.
field(Card, "urlPath", @concatenate("/projects/", ProjectPrefix, "/cards/", Card)) :-
    projectCard(Card),
    project(ProjectPrefix).

% descendants of hidden cards are hidden

hiddenInTreeView(Card) :-
    ancestor(Card, Ancestor),
    hiddenInTreeView(Ancestor).

% TODO: remove this compatibility rule, once content repositories have been updated (INTDEV-666)
field(Card, "progress", Progress) :- field(Card, "base/fieldTypes/progress", Progress).

% user-defined links are links
link(Source, Destination, LinkType) :- userLink(Source, Destination, LinkType).
link(Source, Destination, LinkType, LinkDescription) :- userLink(Source, Destination, LinkType, LinkDescription).

% if a link is not user-defined, then it is calculated
calculatedLink(Source, Destination, LinkType) :-
    link(Source, Destination, LinkType),
    not userLink(Source, Destination, LinkType).

calculatedLink(Source, Destination, LinkType, LinkDescription) :-
    link(Source, Destination, LinkType, LinkDescription),
    not userLink(Source, Destination, LinkType, LinkDescription).

% calculated fields with override support: a user override wins; otherwise the
% calculated value applies, but only for fields the card type declares calculated.
field(Card, Field, Value) :- fieldOverride(Card, Field, Value).

% The fieldCalculated -> field bridge is generated per field name by the data
% handler: a generic field/3 head here makes every `not field(...)` in every
% calculation undecidable at grounding time.

% warn when a scalar field ends up with conflicting values, e.g. a calculation
% still uses a field() head for an override-enabled field
notification(Card, "Fields", "Conflicting field values", @concatenate("Field ", Field, " has multiple values. If the field is calculated, make sure calculations use fieldCalculated instead of field.")) :-
    card(Card),
    field(Card, Field, V1),
    field(Card, Field, V2),
    V1 != V2,
    field(Field, "dataType", DataType),
    DataType != "list".
