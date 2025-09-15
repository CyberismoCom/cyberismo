% Cyberismo query language

% select(n, collection, field): on result level n and for "collection", "field" should be returned
% selectCollectionField(collection, field): on all result levels for "collection", "field" should be returned
% selectAll(n): on result level n, all fields should be returned for all collections
% select(field): "field" should be returned on all levels of hierarchy for all collections
% selectAll: all fields should be returned on all levels of hierarchy for all collections


select(N, Collection, Field) :- select(Field), resultLevel(_, N, Collection).

selectAll(N) :- selectAll, resultLevel(_, N, _).

select(N, Collection, Field) :-
    selectCollectionField(Collection, Field),
    resultLevel(_, N, Collection).

% the default child result collection is "results"
childResult(Key, Child, "results") :- childResult(Key, Child).

% resultLevel(key, n, collection): result "key" is on result level n in "collection"
resultLevel(Key, 1, "results") :- result(Key).
resultLevel(Child, N+1, Collection) :- childResult(Key, Child, Collection), resultLevel(Key, N, _).
resultLevel(Child, N+1, Collection) :- childObject(Key, Child, Collection), resultLevel(Key, N, _).

% result(key): key is a result of the query
#show result(Key) : result(Key), not queryError.

% childResult(key, child key): child key is a child result of key
#show childResult(Key, Child, Collection) : childResult(Key, Child, Collection), not queryError.
% childObject(key, child, collection): childObject is similar to childResult, expect it is an object
#show childObject(Key, Child, Collection) : childObject(Key, Child, Collection), not queryError.
% helpers for simplifying some of the #show statements

% anyResult(key): key is included in the results as a result or a child result/object
anyResult(Key) :- result(Key).
anyResult(Key) :- childResult(_, Key, _).
anyResult(Key) :- childObject(_, Key, _).

% showAll(key): whether all fields or field-like things of a key should be included in the results
showAll(Key) :-
    anyResult(Key),
    resultLevel(Key, Level, _),
    selectAll(Level),
    not queryError.

% showField: whether a certain field or field-like thing of a key should be included in the results
showField(Key, Field) :-
    anyResult(Key),
    resultLevel(Key, Level, _),
    select(Level, Field),
    not queryError.

showField(Key, Field) :-
    anyResult(Key),
    resultLevel(Key, Level, Collection),
    select(Level, Collection, Field),
    not queryError.

% showField is also defined if showAll is defined so there is only a single show predicate for each result
showField(Key, Field) :- showAll(Key), field(Key, Field, _).

% Allow specifying up to 3 fields at the same time for showField, similar to field
% For specifying 2 fields
resultField(Key, Field, Value, DataType) :-
    resultFields(Key, Field, Value, DataType, _, _, _).

resultField(Key, Field, Value, DataType) :-
    resultFields(Key, _, _, _, Field, Value, DataType).

% For specifying 3 fields
resultField(Key, Field, Value, DataType) :-
    resultFields(Key, Field, Value, DataType, _, _, _, _, _, _).

resultField(Key, Field, Value, DataType) :-
    resultFields(Key, _, _, _, Field, Value, DataType, _, _, _).
    
resultField(Key, Field, Value, DataType) :-
    resultFields(Key, _, _, _, _, _, _, Field, Value, DataType).
%
% field(key, field, value, data type):
% "field" of result/child result "key" has value "value",
% data type of the field is included, if not specified, it is shortText
% a field term like this is returned for all other fields except enum and list
%
% enumField(key, field, value, index, enum display value):
% listField(key, field, value, index, enum display value):
% otherwise the same as field, but for enum and list fields,
% we also need the enum value index and enum display value

#show field(Key, Field, Value, DataType) :
    field(Key, Field, Value),
    dataType(Key, Field, DataType),
    DataType != "enum",
    DataType != "list",
    showField(Key, Field).

#show field(Key, Field, Value, DataType) :
    DataType != "enum",
    DataType != "list",
    resultField(Key, Field, Value, DataType).

#show field(Key, Field, Value, "shortText") :
    field(Key, Field, Value),
    not dataType(Key, Field, _),
    showField(Key, Field).

% list
childResult(Key, (Key, Field, Value), Field) :-
    DataType = "list",
    resultField(Key, Field, Value, DataType).

resultField((Key, Field, Value), "value", Value, "shortText") :-
    childResult(Key, (Key, Field, Value), Field),
    resultField(Key, Field, Value, _).

resultField((Key, Field, Value), "index", Index, "integer") :-
    childResult(Key, (Key, Field, Value), Field),
    resultField(Key, Field, Value, _),
    field((Field, Value), "index", Index).

resultField((Key, Field, Value), "displayName", EnumDisplayValue, "shortText") :-
    childResult(Key, (Key, Field, Value), Field),
    resultField(Key, Field, Value, _),
    field((Field, Value), "enumDisplayValue", EnumDisplayValue).

childResult(Key, (Key, Field, Value), Field) :-
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    showField(Key, Field).

resultField((Key, Field, Value), "value", Value, "shortText") :-
    childResult(Key, (Key, Field, Value), Field),
    field(Key, Field, Value),
    not resultField(Key, Field, Value, "list"),
    dataType(Key, Field, "list").

resultField((Key, Field, Value), "index", Index, "integer") :-
    childResult(Key, (Key, Field, Value), Field),
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    not resultField(Key, Field, Value, "list"),
    field((Field, Value), "index", Index).

resultField((Key, Field, Value), "displayName", EnumDisplayValue, "shortText") :-
    childResult(Key, (Key, Field, Value), Field),
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    not resultField(Key, Field, Value, "list"),
    field((Field, Value), "enumDisplayValue", EnumDisplayValue).

% enum


childObject(Key, (Key, Field), Field) :-
    DataType = "enum",
    resultField(Key, Field, _, DataType).

resultField((Key, Field), "value", Value, "shortText") :-
    childObject(Key, (Key, Field), Field),
    resultField(Key, Field, Value, _).

resultField((Key, Field), "index", Index, "integer") :-
    childObject(Key, (Key, Field), Field),
    resultField(Key, Field, Value, _),
    field((Field, Value), "index", Index).

resultField((Key, Field), "displayValue", EnumDisplayValue, "shortText") :-
    childObject(Key, (Key, Field), Field),
    resultField(Key, Field, Value, _),
    field((Field, Value), "enumDisplayValue", EnumDisplayValue).


childObject(Key, (Key, Field), Field) :-
    field(Key, Field, _),
    dataType(Key, Field, "enum"),
    showField(Key, Field).

resultField((Key, Field), "value", Value, "shortText") :-
    childObject(Key, (Key, Field), Field),
    field(Key, Field, Value),
    not resultField(Key, Field, Value, "enum"),
    dataType(Key, Field, "enum").

resultField((Key, Field), "index", Index, "integer") :-
    childObject(Key, (Key, Field), Field),
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    not resultField(Key, Field, Value, "enum"),
    field((Field, Value), "index", Index).

resultField((Key, Field), "displayValue", EnumDisplayValue, "shortText") :-
    childObject(Key, (Key, Field), Field),
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    not resultField(Key, Field, Value, "enum"),
    field((Field, Value), "enumDisplayValue", EnumDisplayValue).

% Allow specifying up to 3 fields at the same time
field(Key, Field, Value) :-
    fields(Key, Field, Value, _, _).

field(Key, Field, Value) :-
    fields(Key, _, _, Field, Value).

field(Key, Field, Value) :-
    fields(Key, Field, Value, _, _, _, _).

field(Key, Field, Value) :-
    fields(Key, _, _, Field, Value, _, _).
    
field(Key, Field, Value) :-
    fields(Key, _, _, _, _, Field, Value).

% allow using field directly
% fields are always shown


% childResultCollection(ParentKey, Collection): Defines a childResult. Allows guaranteeing an empty list, if no elements are present
#show childResultCollection(ParentKey, Collection) : childResultCollection(ParentKey, Collection).

% order(n, collection, 1, field, direction): the results in the collection on level n should be first ordered by "field" in "direction"
% order(n, collection, 2, field, direction): the results in the collection on level n should be secondly ordered by "field" in "direction"
% etc.
% direction must be "ASC" or "DESC".

% orderBy is syntactic sugar for order, as you can order by 1..3 fields with one term when using the default collection "results"

% orderBy with an even numer of parameters refers to results on all levels of hierarchy.
order(N, "results", 1, Field, Direction) :- orderBy(Field, Direction), resultLevel(_, N, "results").
order(N, "results", 1, Field1, Direction1) :- orderBy(Field1, Direction1, _, _), resultLevel(_, N, "results").
order(N, "results", 2, Field2, Direction2) :- orderBy(_, _, Field2, Direction2), resultLevel(_, N, "results").
order(N, "results", 1, Field1, Direction1) :- orderBy(Field1, Direction1, _, _, _, _), resultLevel(_, N, "results").
order(N, "results", 2, Field2, Direction2) :- orderBy(_, _, Field2, Direction2, _, _), resultLevel(_, N, "results").
order(N, "results", 3, Field3, Direction3) :- orderBy(_, _, _, _, Field3, Direction3), resultLevel(_, N, "results").

% orderBy with an odd numer of parameters has the result level as the first parameter
order(Level, "results", 1, Field, Direction) :- orderBy(Level, Field, Direction).
order(Level, "results", 1, Field1, Direction1) :- orderBy(Level, Field1, Direction1, _, _).
order(Level, "results", 2, Field2, Direction2) :- orderBy(Level, _, _, Field2, Direction2).
order(Level, "results", 1, Field1, Direction1) :- orderBy(Level, Field1, Direction1, _, _, _, _).
order(Level, "results", 2, Field2, Direction2) :- orderBy(Level, _, _, Field2, Direction2, _, _).
order(Level, "results", 3, Field3, Direction3) :- orderBy(Level, _, _, _, _, Field3, Direction3).

% select the fields that are needed for sorting automatically
select(Level, Collection, Field) :- order(Level, Collection, _, Field, _).

queryError("Invalid direction in ordering:", (Level, Collection, Index, Field, Direction)) :-
    order(Level, Collection, Index, Field, Direction),
    Direction != "ASC",
    Direction != "DESC".

queryError("Ordering direction missing:", (Field)) :- orderBy(Field).

queryError("Conflicting ordering for fields: ", (Field1, Field2)) :-
    order(Level, Collection, Index, Field1, _),
    order(Level, Collection, Index, Field2, _),
    Field1 != Field2.

queryError("Conflicting ordering direction", (Field, Collection, Direction1, Direction2)) :-
    order(Level, Collection, Index, Field, Direction1),
    order(Level, Collection, Index, Field, Direction2),
    Direction1 != Direction2.

queryError :- queryError(_, _).

#show order(Level, Collection, Index, Field, Direction) :
    order(Level, Collection, Index, Field, Direction),
    not queryError.

#show queryError/2.

% helper terms

level(Level) :-
    resultLevel(_, Level, _).
