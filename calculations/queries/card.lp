result({{cardKey}}).

% a helper term for display names

displayName(Card, Field, DisplayName) :-
    field(Card, Field, _),
    fieldType(Field),
    field(Field, "displayName", DisplayName),
    field(Card, "cardType", CardType),
    not field((CardType, Field), "displayName", _).

displayName(Card, Field, DisplayName) :-
    field(Card, "cardType", CardType),
    field((CardType, Field), "displayName", DisplayName).

% the second level includes metadata for the always visible and optionally visible fields

field(Field, "visibility", "always") :-
    alwaysVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).

field(Field, "visibility", "optional") :-
    optionallyVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).

field(Field, "index", Index) :-
    alwaysVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field({{cardKey}}, "cardType", CardType).

field(Field, "index", Index) :-
    optionallyVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field({{cardKey}}, "cardType", CardType).

dataType(Field, "fieldDisplayName", "shortText") :-
    childResult(_, Field, "fields"),
    field(Field, "fieldDisplayName", _).

field(Field, "fieldDisplayName", DisplayName) :-
    childResult(_, Field, "fields"),
    displayName({{cardKey}}, Field, DisplayName).

dataType(Field, "isCalculated", "boolean") :-
    childResult(_, Field, "fields"),
    field(Field, "isCalculated", _).

field(Field, "isCalculated", isCalculated) :-
    field({{cardKey}}, "cardType", CardType),
    field((CardType, Field), "isCalculated", isCalculated).

field(Field, "isCalculated", "false") :-
   field({{cardKey}}, "cardType", CardType),
   alwaysVisibleField(CardType, Field),
   not field((CardType, Field), "isCalculated", _).

field(Field, "isCalculated", "false") :-
   field({{cardKey}}, "cardType", CardType),
   optionallyVisibleField(CardType, Field),
   not field((CardType, Field), "isCalculated", _).

% add value
dataType(Field, "value", DataType) :-
    childResult(_, Field, "fields"),
    field({{cardKey}}, Field, Value),
    dataType({{cardKey}}, Field, DataType).


% add value
field(Field, "value", Value) :-
    childResult({{cardKey}}, Field, "fields"),
    field({{cardKey}}, Field, Value).


% select only non-custom fields
select(1, "cardType").
select(1, "title").
select(1, "key").
select(1, "lastUpdated").
select(1, "workflowState").
select(1, "notifications").
select(1, "policyChecks").
select(1, "links").
select(1, "deniedOperations").
select(1, "labels").

select(2, "visibility").
select(2, "index").
select(2, "fieldDisplayName").
select(2, "fieldDescription").
select(2, "dataType").
select(2, "isCalculated").
select(2, "value").

childResult({{cardKey}}, Field, "fields") :-
    alwaysVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).

childResult({{cardKey}}, Field, "fields") :-
    optionallyVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).

% for enum fields, add enum values as child results:
select(3, "index").
select(3, "enumDisplayValue").
select(3, "enumDescription").
select(3, "enumValue").

childResult(Field, (Field, EnumValue), "enumValues") :-
    enumValue(Field, EnumValue).

field((Field, EnumValue), "enumValue", EnumValue) :-
    enumValue(Field, EnumValue).

order(2, "fields", 1, "visibility", "ASC").
order(2, "fields", 2, "index", "ASC").
order(3, "enumValues", 1, "index", "ASC").