% Cyberismo query language

% select(n, field): on result level n, "field" should be returned
% selectAll(n): on result level n, all fields should be returned
% select(field): "field" should be returned on all levels of hierarchy
% selectAll: all fields should be returned on all levels of hierarchy

% select works similarly for "labels", "links", "notifications", "policyChecks" and "deniedOperations" as it works for fields

select(N, Field) :- select(Field), resultLevel(_, N).
selectAll(N) :- selectAll, resultLevel(_, N).

% resultLevel(key, n): result "key" is on result level n
resultLevel(Key, 1) :- result(Key).
resultLevel(Child, N+1) :- childResult(Key, Child), resultLevel(Key, N).

% result(key): key is a result of the query
#show result(Key) : result(Key), not queryError.

% childResult(key, child key): child key is a child result of key
#show childResult(Key, Child) : childResult(Key, Child), not queryError.

% helpers for simplifying some of the #show statements

% resultOrChildResult(key): key is included in the results as a result or a child result
resultOrChildResult(Key) :- result(Key).
resultOrChildResult(Key) :- childResult(_, Key).

% showAll(key): whether all fields or field-like things of a key should be included in the results
showAll(Key) :-
    resultOrChildResult(Key),
    resultLevel(Key, Level),
    selectAll(Level),
    not queryError.

% showField: whether a certain field or field-like thing of a key should be included in the results
showField(Key, Field) :-
    resultOrChildResult(Key),
    resultLevel(Key, Level),
    select(Level, Field),
    not queryError.

% field(key, field, value): "field" of result/child result "key" has value "value"
#show field(Key, Field, Value) :
    field(Key, Field, Value),
    showField(Key, Field).

#show field(Key, Field, Value) :
    field(Key, Field, Value),
    showAll(Key).

% label(key, label): key is tagged with "label"

#show label(Key, Label) :
    label(Key, Label),
    showField(Key, "labels").

#show label(Key, Label) :
    label(Key, Label),
    showAll(Key).

% links

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showAll(Destination).

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName) :
    link(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showField(Source, "links").

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName) :
    link(Source, Destination, LinkType),
    field(Source, "title", SourceTitle),
    field(LinkType, "inboundDisplayName", InboundDisplayName),
    showField(Destination, "links").

#show link(Source, Destination, DestinationTitle, LinkType, OutboundDisplayName) :
    link(Source, Destination, LinkType),
    field(Destination, "title", DestinationTitle),
    field(LinkType, "outboundDisplayName", OutboundDisplayName),
    showAll(Source).

#show link(Destination, Source, SourceTitle, LinkType, InboundDisplayName) :
    link(Source, Destination, LinkType),
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

% order(n, 1, field, direction): the results on level n should be first ordered by "field" in "direction"
% order(n, 2, field, direction): the results on level n should be secondly ordered by "field" in "direction"
% etc.
% direction must be "ASC" or "DESC".

% orderBy is syntactic sugar for order, as you can order by 1..3 fields with one predicate

% orderBy with an even numer of parameters refers to results on all levels of hierarchy.
order(N, 1, Field, Direction) :- orderBy(Field, Direction), resultLevel(_, N).
order(N, 1, Field1, Direction1) :- orderBy(Field1, Direction1, _, _), resultLevel(_, N).
order(N, 2, Field2, Direction2) :- orderBy(_, _, Field2, Direction2), resultLevel(_, N).
order(N, 1, Field1, Direction1) :- orderBy(Field1, Direction1, _, _, _, _), resultLevel(_, N).
order(N, 2, Field2, Direction2) :- orderBy(_, _, Field2, Direction2, _, _), resultLevel(_, N).
order(N, 3, Field3, Direction3) :- orderBy(_, _, _, _, Field3, Direction3), resultLevel(_, N).

% orderBy with an odd numer of parameters has the result level as the first parameter
order(Level, 1, Field, Direction) :- orderBy(Level, Field, Direction).
order(Level, 1, Field1, Direction1) :- orderBy(Level, Field1, Direction1, _, _).
order(Level, 2, Field2, Direction2) :- orderBy(Level, _, _, Field2, Direction2).
order(Level, 1, Field1, Direction1) :- orderBy(Level, Field1, Direction1, _, _, _, _).
order(Level, 2, Field2, Direction2) :- orderBy(Level, _, _, Field2, Direction2, _, _).
order(Level, 3, Field3, Direction3) :- orderBy(Level, _, _, _, _, Field3, Direction3).

queryError("Invalid direction in ordering:", Level, Index, Field, Direction) :-
    order(Level, Index, Field, Direction),
    Direction != "ASC",
    Direction != "DESC".

queryError("Ordering direction missing:", Field) :- orderBy(Field).

queryError("Conflicting ordering for fields: ", Field1, Field2) :-
    order(Level, Index, Field1, _),
    order(Level, Index, Field2, _),
    Field1 != Field2.

queryError("Conflicting ordering direction", Field, Direction1, Direction2) :-
    order(Level, Index, Field, Direction1),
    order(Level, Index, Field, Direction2),
    Direction1 != Direction2.

queryError :- queryError(_).
queryError :- queryError(_, _).
queryError :- queryError(_, _, _).
queryError :- queryError(_, _, _, _).
queryError :- queryError(_, _, _, _, _).

#show order(Level, Index, Field, Direction) :
    order(Level, Index, Field, Direction),
    not queryError.

#show queryError/1.
#show queryError/2.
#show queryError/3.
#show queryError/4.
#show queryError/5.