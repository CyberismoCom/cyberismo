
%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

% data types and display names for the default card fields
dataType(Card, "cardType", "shortText") :-
    field(Card, "cardType", _).

displayName(Card, "cardType", "Card type") :-
    field(Card, "cardType", _).

dataType(Card, "title", "shortText") :-
    field(Card, "title", _).

displayName(Card, "title", "Title") :-
    field(Card, "title", _).

dataType(Card, "lastUpdated", "dateTime") :-
    field(Card, "lastUpdated", _).

displayName(Card, "lastUpdated", "Last updated") :-
    field(Card, "lastUpdated", _).

dataType(Card, "workflowState", "shortText") :-
    field(Card, "workflowState", _).

displayName(Card, "workflowState", "Workflow state") :-
    field(Card, "workflowState", _).

% add workflow state category as a calculated field for Cards
field(Card, "workflowStateCategory", Category) :-
    card(Card),
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).

dataType(Card, "workflowStateCategory", "shortText") :-
    field(Card, "workflowStateCategory", _).

displayName(Card, "workflowStateCategory", "Workflow state category") :-
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

% data types and display names for enum values

dataType((FieldType, EnumValue), "index", "integer") :-
    enumValue(FieldType, EnumValue).

displayName((FieldType, EnumValue), "index", "Enum value index") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDisplayValue", "shortText") :-
    enumValue(FieldType, EnumValue).

displayName((FieldType, EnumValue), "enumDisplayValue", "Enum display value") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDescription", "longText") :-
    enumValue(FieldType, EnumValue).

displayName((FieldType, EnumValue), "enumDescription", "Enum description") :-
    enumValue(FieldType, EnumValue).
