{{#if cardKey}}
result({{cardKey}}).
{{else}}
result(X) :- projectCard(X).
{{/if}}

% a helper term for display names

displayName(Card, (Card, Field), DisplayName) :-
    field(Card, Field, _),
    fieldType(Field),
    field(Field, "displayName", DisplayName),
    field(Card, "cardType", CardType),
    not field((CardType, Field), "displayName", _).

displayName(Card, (Card, Field), DisplayName) :-
    field(Card, "cardType", CardType),
    field((CardType, Field), "displayName", DisplayName).

% the second level includes metadata for the always visible and optionally visible fields
% we include the card key in the key of the fields, because the same query is used
% when generating static sites for all project cards at the same time

field((Card, Field), "fieldType", Field) :-
    customField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

field((Card, Field), "visibility", "always") :-
    alwaysVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

field((Card, Field), "visibility", "optional") :-
    optionallyVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

field((Card, Field), "index", Index) :-
    alwaysVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

field((Card, Field), "index", Index) :-
    optionallyVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

dataType((Card, Field), "fieldDisplayName", "shortText") :-
    childResult(Card, (Card, Field), "fields"),
    field(Field, "fieldDisplayName", _).

field((Card, Field), "fieldDisplayName", DisplayName) :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    displayName(Card, Field, DisplayName).

dataType((Card, Field), "isCalculated", "boolean") :-
    childResult(Card, (Card, Field), "fields"),
    field(Field, "isCalculated", _).

field((Card, Field), "isCalculated", true) :-
    result(Card),
    field(Card, "cardType", CardType),
    calculatedField(CardType, Field).

field((Card, Field), "isCalculated", false) :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    field(Card, "cardType", CardType),
    not calculatedField(CardType, Field).

% add value
dataType((Card, Field), "value", DataType) :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    field(Card, Field, Value),
    dataType(Card, Field, DataType).

% add value
field((Card, Field), "value", Value) :-
    childResult(Card, (Card, Field), "fields"),
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

select(2, "fields", "fieldType").
select(2, "fields", "visibility").
select(2, "fields", "index").
select(2, "fields", "fieldDisplayName").
select(2, "fields", "fieldDescription").
select(2, "fields", "dataType").
select(2, "fields", "isCalculated").
select(2, "fields", "value").

childResultCollection(Card, "fields") :-
    result(Card).

childResult(Card, (Card, Field), "fields") :-
    alwaysVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

childResult(Card, (Card, Field), "fields") :-
    optionallyVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

% for enum fields, add enum values as child results:
select(3, "index").
select(3, "enumDisplayValue").
select(3, "enumDescription").
select(3, "enumValue").

childResult((Card, Field), (Field, EnumValue), "enumValues") :-
    enumValue(Field, EnumValue),
    result(Card).

field((Field, EnumValue), "enumValue", EnumValue) :-
    enumValue(Field, EnumValue).

order(2, "fields", 1, "visibility", "ASC").
order(2, "fields", 2, "index", "ASC").
order(3, "enumValues", 1, "index", "ASC").