% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

% Cyberismo query language

% select(n, collection, field): on result level n and for "collection", "field" should be returned
% selectCollectionField(collection, field): on all result levels for "collection", "field" should be returned
% selectAll(n): on result level n, all fields should be returned for all collections
% select(field): "field" should be returned on all levels of hierarchy for all collections
% selectAll: all fields should be returned on all levels of hierarchy for all collections

% select works similarly for "labels", "links", "notifications", "policyChecks" and "deniedOperations" as it works for fields

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

% result(key): key is a result of the query
#show result(Key) : result(Key), not queryError.

% childResult(key, child key): child key is a child result of key
#show childResult(Key, Child, Collection) : childResult(Key, Child, Collection), not queryError.

% helpers for simplifying some of the #show statements

% resultOrChildResult(key): key is included in the results as a result or a child result
resultOrChildResult(Key) :- result(Key).
resultOrChildResult(Key) :- childResult(_, Key, _).

% showAll(key): whether all fields or field-like things of a key should be included in the results
showAll(Key) :-
    resultOrChildResult(Key),
    resultLevel(Key, Level, _),
    selectAll(Level),
    not queryError.

% showField: whether a certain field or field-like thing of a key should be included in the results
showField(Key, Field) :-
    resultOrChildResult(Key),
    resultLevel(Key, Level, _),
    select(Level, Field),
    not queryError.

showField(Key, Field) :-
    resultOrChildResult(Key),
    resultLevel(Key, Level, Collection),
    select(Level, Collection, Field),
    not queryError.

% Fields
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
    field(Key, Field, Value),
    dataType(Key, Field, DataType),
    DataType != "enum",
    DataType != "list",
    showAll(Key).

#show field(Key, Field, Value, "shortText") :
    field(Key, Field, Value),
    not dataType(Key, Field, _),
    showField(Key, Field).

#show field(Key, Field, Value, "shortText") :
    field(Key, Field, Value),
    not dataType(Key, Field, _),
    showAll(Key).

#show enumField(Key, Field, Value, Index, DisplayValue) :
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    field((Field, Value), "index", Index),
    field((Field, Value), "enumDisplayValue", DisplayValue),
    showField(Key, Field).

#show enumField(Key, Field, Value, Index, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    field((Field, Value), "index", Index),
    not field((Field, Value), "enumDisplayValue", _),
    showField(Key, Field).

#show enumField(Key, Field, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    not field((Field, Value), "index", _),
    not field((Field, Value), "enumDisplayValue", _),
    showField(Key, Field).

#show enumField(Key, Field, Value, Index, DisplayValue) :
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    field((Field, Value), "index", Index),
    field((Field, Value), "enumDisplayValue", DisplayValue),
    showAll(Key).

#show enumField(Key, Field, Value, Index, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "enum"),
    field((Field, Value), "index", Index),
    not field((Field, Value), "enumDisplayValue", _),
    showAll(Key).

#show enumField(Key, Field, Value) :
     field(Key, Field, Value),
     dataType(Key, Field, "enum"),
     not field((Field, Value), "index", _),
     not field((Field, Value), "enumDisplayValue", _),
     showAll(Key).

#show listField(Key, Field, Value, Index, DisplayValue) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    field((Field, Value), "index", Index),
    field((Field, Value), "enumDisplayValue", DisplayValue),
    showField(Key, Field).

#show listField(Key, Field, Value, Index, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    field((Field, Value), "index", Index),
    not field((Field, Value), "enumDisplayValue", _),
    showField(Key, Field).

#show listField(Key, Field, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    not field((Field, Value), "index", _),
    not field((Field, Value), "enumDisplayValue", _),
    showField(Key, Field).

#show listField(Key, Field, Value, Index, DisplayValue) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    field((Field, Value), "index", Index),
    field((Field, Value), "enumDisplayValue", DisplayValue),
    showAll(Key).

#show listField(Key, Field, Value, Index, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    field((Field, Value), "index", Index),
    not field((Field, Value), "enumDisplayValue", _),
    showAll(Key).

#show listField(Key, Field, Value) :
    field(Key, Field, Value),
    dataType(Key, Field, "list"),
    not field((Field, Value), "index", _),
    not field((Field, Value), "enumDisplayValue", _),
    showAll(Key).

% label(key, label): key is tagged with "label"

#show label(Key, Label) :
    label(Key, Label),
    showField(Key, "labels").

#show label(Key, Label) :
    label(Key, Label),
    showAll(Key).

% links

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "user", LinkDescription) :
    userLink(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "user", LinkDescription) :
    userLink(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "user", LinkDescription) :
    userLink(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "user", LinkDescription) :
    userLink(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showAll(Destination).

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "user") :
    userLink(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "user") :
    userLink(Source, Destination, LinkType),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "user") :
    userLink(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "user") :
    userLink(Source, Destination, LinkType),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showAll(Destination).

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "calculated", LinkDescription) :
    calculatedLink(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "calculated", LinkDescription) :
    calculatedLink(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "calculated", LinkDescription) :
    calculatedLink(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "calculated", LinkDescription) :
    calculatedLink(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showAll(Destination).

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "calculated") :
    calculatedLink(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "calculated") :
    calculatedLink(Source, Destination, LinkType),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, "outbound", "calculated") :
    calculatedLink(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, "inbound", "calculated") :
    calculatedLink(Source, Destination, LinkType),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showAll(Destination).

% notifications

#show notification(Key, Category, Title, Message) :
    notification(Key, Category, Title, Message),
    showField(Key, "notifications").

#show notification(Key, Category, Title, Message) :
    notification(Key, Category, Title, Message),
    showAll(Key).

% policy checks

#show policyCheckFailure(Key, Category, Title, ErrorMessage, Field) :
    policyCheckFailure(Key, Category, Title, ErrorMessage, Field),
    showField(Key, "policyChecks").

#show policyCheckFailure(Key, Category, Title, ErrorMessage, Field) :
    policyCheckFailure(Key, Category, Title, ErrorMessage, Field),
    showAll(Key).

#show policyCheckFailure(Key, Category, Title, ErrorMessage) :
    policyCheckFailure(Key, Category, Title, ErrorMessage),
    showField(Key, "policyChecks").

#show policyCheckFailure(Key, Category, Title, ErrorMessage) :
    policyCheckFailure(Key, Category, Title, ErrorMessage),
    showAll(Key).

#show policyCheckSuccess(Key, Category, Title) :
    policyCheckSuccess(Key, Category, Title),
    showField(Key, "policyChecks").

#show policyCheckSuccess(Key, Category, Title) :
    policyCheckSuccess(Key, Category, Title),
    showAll(Key).

% denied operations

#show transitionDenied(Key, Transition, ErrorMessage) :
    transitionDenied(Key, Transition, ErrorMessage),
    showField(Key, "deniedOperations").

#show transitionDenied(Key, Transition, ErrorMessage) :
    transitionDenied(Key, Transition, ErrorMessage),
    showAll(Key).

#show movingCardDenied(Key, ErrorMessage) :
    movingCardDenied(Key, ErrorMessage),
    showField(Key, "deniedOperations").

#show movingCardDenied(Key, ErrorMessage) :
    movingCardDenied(Key, ErrorMessage),
    showAll(Key).

#show deletingCardDenied(Key, ErrorMessage) :
    deletingCardDenied(Key, ErrorMessage),
    showField(Key, "deniedOperations").

#show deletingCardDenied(Key, ErrorMessage) :
    deletingCardDenied(Key, ErrorMessage),
    showAll(Key).

#show editingFieldDenied(Key, Field, ErrorMessage) :
    editingFieldDenied(Key, Field, ErrorMessage),
    showField(Key, "deniedOperations").

#show editingFieldDenied(Key, Field, ErrorMessage) :
    editingFieldDenied(Key, Field, ErrorMessage),
    showAll(Key).

#show editingContentDenied(Key, ErrorMessage) :
    editingContentDenied(Key, ErrorMessage),
    showField(Key, "deniedOperations").

#show editingContentDenied(Key, ErrorMessage) :
    editingContentDenied(Key, ErrorMessage),
    showAll(Key).

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
