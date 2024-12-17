%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

% data types for non-shortText default values

dataType(Card, "lastUpdated", "dateTime") :-
    field(Card, "lastUpdated", _).

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

% data types for enum values

dataType((FieldType, EnumValue), "index", "integer") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDisplayValue", "shortText") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDescription", "longText") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumValue", "longText") :-
    enumValue(FieldType, EnumValue).

% descendants of hidden cards are hidden

hiddenInTreeView(Card) :-
    ancestor(Card, Ancestor),
    hiddenInTreeView(Ancestor).