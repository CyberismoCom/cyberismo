{{#if cardKey}}
result({{cardKey}}).
{{else}}
result(X) :- projectCard(X).
{{/if}}

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
    field(Card, "cardType", CardType),
    result(Card).

field(Field, "visibility", "optional") :-
    optionallyVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

field(Field, "index", Index) :-
    alwaysVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

field(Field, "index", Index) :-
    optionallyVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

dataType(Field, "fieldDisplayName", "shortText") :-
    childResult(_, Field, "fields"),
    field(Field, "fieldDisplayName", _).

field(Field, "fieldDisplayName", DisplayName) :-
    childResult(_, Field, "fields"),
    result(Card),
    displayName(Card, Field, DisplayName).

dataType(Field, "isCalculated", "boolean") :-
    childResult(_, Field, "fields"),
    field(Field, "isCalculated", _).

field(Field, "isCalculated", true) :-
    result(Card),
    field(Card, "cardType", CardType),
    calculatedField(CardType, Field).

field(Field, "isCalculated", false) :-
    childResult(_, Field, "fields"),
    result(Card),
    field(Card, "cardType", CardType),
    not calculatedField(CardType, Field).




% add value
dataType(Field, "value", DataType) :-
    childResult(_, Field, "fields"),
    result(Card),
    field(Card, Field, Value),
    dataType(Card, Field, DataType).


% add value
field(Field, "value", Value) :-
    childResult(Card, Field, "fields"),
    field(Card, Field, Value).


% select only non-custom fields
select(1, "cardType").
select(1, "title").
select(1, "key").
select(1, "lastUpdated").
select(1, "workflowState").
select(1, "policyChecks").
select(1, "links").
select(1, "notifications").
select(1, "deniedOperations").
select(1, "labels").

% Fields

select(2, "fields", "visibility").
select(2, "fields", "index").
select(2, "fields", "fieldDisplayName").
select(2, "fields", "fieldDescription").
select(2, "fields", "dataType").
select(2, "fields", "isCalculated").
select(2, "fields", "value").

childResultCollection(Card, "fields") :-
    result(Card).

childResult(Card, Field, "fields") :-
    alwaysVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

childResult(Card, Field, "fields") :-
    optionallyVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

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