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

% data types for non-shortText default values

dataType(Card, "lastUpdated", "dateTime") :-
    field(Card, "lastUpdated", _).

dataType(Card, "lastSynchronised", "dateTime") :-
    field(Card, "lastSynchronised", _).

% add workflow state category as a calculated field for Cards
field(Card, "workflowStateCategory", Category) :-
    card(Card),
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).


% data types of fields
dataType(Key, Field, DataType) :-
    field(Key, Field, _),
    fieldType(Field),
    field(Field, "dataType", DataType).

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
