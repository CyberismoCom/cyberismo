
%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

% data types for the default card fields
dataType(Card, "cardType", "shortText") :-
    field(Card, "cardType", _).

dataType(Card, "title", "shortText") :-
    field(Card, "title", _).

dataType(Card, "lastUpdated", "dateTime") :-
    field(Card, "lastUpdated", _).

dataType(Card, "workflowState", "shortText") :-
    field(Card, "workflowState", _).

dataType(Card, "rank", "shortText") :-
    field(Card, "rank", _).

% add workflow state category as a calculated field for Cards
field(Card, "workflowStateCategory", Category) :-
    card(Card),
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).

dataType(Card, "workflowStateCategory", "shortText") :-
    field(Card, "workflowStateCategory", _).

% data types and display names of fields
dataType(Key, Field, DataType) :-
    field(Key, Field, _),
    fieldType(Field),
    field(Field, "dataType", DataType).

displayName(Card, Field, DisplayName) :-
    field(Card, Field, _),
    fieldType(Field),
    field(Field, "displayName", DisplayName),
    field(Card, "cardType", CardType),
    not field((CardType, Field), "displayName", _).

displayName(Card, Field, DisplayName) :-
    field(Card, Field, _),
    field(Card, "cardType", CardType),
    field((CardType, Field), "displayName", _).

% data types for enum values

dataType((FieldType, EnumValue), "index", "integer") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDisplayValue", "shortText") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDescription", "longText") :-
    enumValue(FieldType, EnumValue).
