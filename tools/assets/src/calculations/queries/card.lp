{{#if cardKey}}
result({{cardKey}}).
{{else}}
result(X) :- projectCard(X).
{{/if}}

% a helper term for display names

displayName(Card, (Card, Field), DisplayName) :-
    fieldType(Field),
    field(Field, "displayName", DisplayName),
    field(Card, "cardType", CardType),
    not field((CardType, Field), "displayName", _).

displayName(Card, (Card, Field), DisplayName) :-
    field(Card, "cardType", CardType),
    fieldType(Field),
    field((CardType, Field), "displayName", DisplayName).

% the second level includes metadata for the always visible and optionally visible fields
% we include the card key in the key of the fields, because the same query is used
% when generating static sites for all project cards at the same time

resultField((Card, Field), "key", Field, "shortText") :-
    customField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).
resultField((Card, Field), "visibility", "always", "shortText") :-
    alwaysVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

resultField((Card, Field), "visibility", "optional", "shortText") :-
    optionallyVisibleField(CardType, Field),
    field(Card, "cardType", CardType),
    result(Card).

resultField((Card, Field), "index", Index, "integer") :-
    alwaysVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

resultField((Card, Field), "index", Index, "integer") :-
    optionallyVisibleField(CardType, Field),
    field((CardType, Field), "index", Index),
    field(Card, "cardType", CardType),
    result(Card).

resultField((Card, Field), "fieldDisplayName", DisplayName, "shortText") :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    displayName(Card, (Card, Field), DisplayName).

resultField((Card, Field), "fieldDescription", Description, "shortText") :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    field(Field, "description", Description).

dataType((Card, Field), "isCalculated", "boolean") :-
    childResult(Card, (Card, Field), "fields"),
    field((Card, Field), "isCalculated", _).

resultField((Card, Field), "isCalculated", true, "boolean") :-
    result(Card),
    field(Card, "cardType", CardType),
    calculatedField(CardType, Field).

field((Card, Field), "isCalculated", false, "boolean") :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    field(Card, "cardType", CardType),
    not calculatedField(CardType, Field).

% add dataType of field
resultField((Card, Field), "dataType", DataType, "shortText") :-
    childResult(Card, (Card, Field), "fields"),
    result(Card),
    field(Field, "dataType", DataType).

% add value
resultField((Card, Field), "value", Value, DataType) :-
    childResult(Card, (Card, Field), "fields"),
    dataType(Card, Field, DataType),
    field(Card, Field, Value).

% add cardTypeDisplayName
resultField(Card, "cardTypeDisplayName", DisplayName, "shortText") :-
    result(Card),
    field(Card, "cardType", CardType),
    field(CardType, "displayName", DisplayName).

% select only non-custom fields
select(1, "results", "cardType").
select(1, "results", "cardTypeDisplayName").
select(1, "results", "title").
select(1, "results", "key").
select(1, "results", "lastUpdated").
select(1, "results", "workflowState").
select(1, "results", "policyChecks").
select(1, "results", "links").
select(1, "results", "notifications").
select(1, "results", "deniedOperations").
select(1, "results", "labels").

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
select(3, "enumValues", "index").
select(3, "enumValues", "enumDisplayValue").
select(3, "enumValues", "enumDescription").
select(3, "enumValues", "enumValue").

childResult((Card, Field), (Field, EnumValue), "enumValues") :-
    enumValue(Field, EnumValue),
    childResult(Card, (Card, Field), "fields").

field((Field, EnumValue), "enumValue", EnumValue) :-
    enumValue(Field, EnumValue).

order(2, "fields", 1, "visibility", "ASC").
order(2, "fields", 2, "index", "ASC").
order(3, "enumValues", 1, "index", "ASC").
