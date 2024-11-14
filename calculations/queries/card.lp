
result({{cardKey}}).

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

field(Field, "fieldDisplayName", Name) :-
    field({{cardKey}}, "cardType", CardType),
    field((CardType, Field), "displayName", Name).

field(Field, "fieldDisplayName", Name) :-
    field(Field, "displayName", Name),
    field({{cardKey}}, "cardType", CardType),
    not field((CardType, Field), "displayName", _).

field(Field, "isEditable", IsEditable) :-
    field({{cardKey}}, "cardType", CardType),
    field((CardType, Field), "isEditable", IsEditable).

field(Field, "isEditable", "true") :-
   field({{cardKey}}, "cardType", CardType),
   alwaysVisibleField(CardType, Field),
   not field((CardType, Field), "isEditable", _).

field(Field, "isEditable", "true") :-
   field({{cardKey}}, "cardType", CardType),
   optionallyVisibleField(CardType, Field),
   not field((CardType, Field), "isEditable", _).

% Add value
field(Field, "value", Value) :-
    field({{cardKey}}, Field, Value).

% Add only non-custom fields
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
select(2, "isEditable").
select(2, "value").

childResult({{cardKey}}, Field) :-
    alwaysVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).

childResult({{cardKey}}, Field) :-
    optionallyVisibleField(CardType, Field),
    field({{cardKey}}, "cardType", CardType).



% For enum fields, add enum values as child results:

select(3, "index").
select(3, "enumDisplayValue").
select(3, "enumDescription").

childResult(Field, (Field, EnumValue)) :-
    enumValue(Field, EnumValue).

order(2, 1, "visibility", "ASC").
order(2, 2, "index", "ASC").
order(3, 1, "index", "ASC").