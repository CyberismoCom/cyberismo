% Cyberismo query language

% select(n, field): on result level n, "field" should be returned
% select_all(n): on result level n, all fields should be returned
% select(field): "field" should be returned on all levels of hierarchy
% select_all: all fields should be returned on all levels of hierarchy

% select works similarly for "labels", "links", "policyChecks" and "deniedOperations" as it works for fields

select(N, Field) :- select(Field), result_level(_, N).
select_all(N) :- select_all, result_level(_, N).

% result_level(key, n): result "key" is on result level n
result_level(Key, 1) :- result(Key).
result_level(Child, N+1) :- child_result(Key, Child), result_level(Key, N).

% result(key): key is a result of the query
#show result(Key) : result(Key), not query_error.

% child_result(key, child key): child key is a child result of key
#show child_result(Key, Child) : child_result(Key, Child), not query_error.

% helpers for simplifying some of the #show statements

% result_or_child_result(key): key is included in the results as a result or a child result
result_or_child_result(Key) :- result(Key).
result_or_child_result(Key) :- child_result(Key).

% show_all(key): whether all fields or field-like things of a key should be included in the results
show_all(Key) :-
    result_or_child_result(Key),
    result_level(Key, Level),
    select_all(Level),
    not query_error.

% show_field: whether a certain field or field-like thing of a key should be included in the results
show_field(Key, Field) :-
    result_or_child_result(Key),
    result_level(Key, Level),
    select(Level, Field),
    not query_error.

% field(key, field, value): "field" of result/child result "key" has value "value"
#show field(Key, Field, Value) :
    field(Key, Field, Value),
    show_field(Key, Field).

#show field(Key, Field, Value) :
    field(Key, Field, Value),
    show_all(Key).

% label(key, label): key is tagged with "label"

#show label(Key, Label) :
    label(Key, Label),
    show_field(Key, "labels").

#show label(Key, Label) :
    label(Key, Label),
    show_all(Key).

% links

#show link(Source, Destination, LinkType, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    show_field(Source, "links").

#show link(Source, Destination, LinkType, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    show_field(Destination, "links").

#show link(Source, Destination, LinkType, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    show_all(Source).

#show link(Source, Destination, LinkType, LinkDescription) :
    link(Source, Destination, LinkType, LinkDescription),
    show_all(Destination).

#show link(Source, Destination, LinkType) :
    link(Source, Destination, LinkType),
    show_field(Source, "links").

#show link(Source, Destination, LinkType) :
    link(Source, Destination, LinkType),
    show_field(Destination, "links").

#show link(Source, Destination, LinkType) :
    link(Source, Destination, LinkType),
    show_all(Source).

#show link(Source, Destination, LinkType) :
    link(Source, Destination, LinkType),
    show_all(Destination).

% policy checks

#show policy_check_failure(Key, TestSuite, TestCase, ErrorMessage) :
    policy_check_failure(Key, TestSuite, TestCase, ErrorMessage),
    show_field(Key, "policyChecks").

#show policy_check_failure(Key, TestSuite, TestCase, ErrorMessage) :
    policy_check_failure(Key, TestSuite, TestCase, ErrorMessage),
    show_all(Key).

#show policy_check_success(Key, TestSuite, TestCase, ErrorMessage) :
    policy_check_success(Key, TestSuite, TestCase, ErrorMessage),
    show_field(Key, "policyChecks").

#show policy_check_success(Key, TestSuite, TestCase, ErrorMessage) :
    policy_check_success(Key, TestSuite, TestCase, ErrorMessage),
    show_all(Key).

% denied operations

#show transition_denied(Key, Transition, ErrorMessage) :
    transition_denied(Key, Transition, ErrorMessage),
    show_field(Key, "deniedOperations").

#show transition_denied(Key, Transition, ErrorMessage) :
    transition_denied(Key, Transition, ErrorMessage),
    show_all(Key).

#show moving_card_denied(Key, ErrorMessage) :
    moving_card_denied(Key, ErrorMessage),
    show_field(Key, "deniedOperations").

#show moving_card_denied(Key, ErrorMessage) :
    moving_card_denied(Key, ErrorMessage),
    show_all(Key).

#show deleting_card_denied(Key, ErrorMessage) :
    deleting_card_denied(Key, ErrorMessage),
    show_field(Key, "deniedOperations").

#show deleting_card_denied(Key, ErrorMessage) :
    deleting_card_denied(Key, ErrorMessage),
    show_all(Key).

#show editing_field_denied(Key, Field, ErrorMessage) :
    editing_field_denied(Key, Field, ErrorMessage),
    show_field(Key, "deniedOperations").

#show editing_field_denied(Key, Field, ErrorMessage) :
    editing_field_denied(Key, Field, ErrorMessage),
    show_all(Key).

#show editing_content_denied(Key, ErrorMessage) :
    editing_content_denied(Key, ErrorMessage),
    show_field(Key, "deniedOperations").

#show editing_content_denied(Key, ErrorMessage) :
    editing_content_denied(Key, ErrorMessage),
    show_all(Key).

% order(n, 1, field, direction): the results on level n should be first ordered by "field" in "direction"
% order(n, 2, field, direction): the results on level n should be secondly ordered by "field" in "direction"
% etc.
% direction must be "ASC" or "DESC".

% order_by is syntactic sugar for order, as you can order by 1..3 fields with one predicate

% order_by with an even numer of parameters refers to results on all levels of hierarchy.
order(N, 1, Field, Direction) :- order_by(Field, Direction), result_level(_, N).
order(N, 1, Field1, Direction1) :- order_by(Field1, Direction1, _, _), result_level(_, N).
order(N, 2, Field2, Direction2) :- order_by(_, _, Field2, Direction2), result_level(_, N).
order(N, 1, Field1, Direction1) :- order_by(Field1, Direction1, _, _, _, _), result_level(_, N).
order(N, 2, Field2, Direction2) :- order_by(_, _, Field2, Direction2, _, _), result_level(_, N).
order(N, 3, Field3, Direction3) :- order_by(_, _, _, _, Field3, Direction3), result_level(_, N).

% order_by with an odd numer of parameters has the result level as the first parameter
order(Level, 1, Field, Direction) :- order_by(Level, Field, Direction).
order(Level, 1, Field1, Direction1) :- order_by(Level, Field1, Direction1, _, _).
order(Level, 2, Field2, Direction2) :- order_by(Level, _, _, Field2, Direction2).
order(Level, 1, Field1, Direction1) :- order_by(Level, Field1, Direction1, _, _, _, _).
order(Level, 2, Field2, Direction2) :- order_by(Level, _, _, Field2, Direction2, _, _).
order(Level, 3, Field3, Direction3) :- order_by(Level, _, _, _, _, Field3, Direction3).

query_error("Invalid direction in ordering:", Level, Index, Field, Direction) :-
    order(Level, Index, Field, Direction),
    Direction != "ASC",
    Direction != "DESC".

query_error("Ordering direction missing:", Field) :- order_by(Field).

query_error("Conflicting ordering for fields: ", Field1, Field2) :-
    order(Level, Index, Field1, _),
    order(Level, Index, Field2, _),
    Field1 != Field2.

query_error("Conflicting ordering direction", Field, Direction1, Direction2) :-
    order(Level, Index, Field, Direction1),
    order(Level, Index, Field, Direction2),
    Direction1 != Direction2.

query_error :- query_error(_).
query_error :- query_error(_, _).
query_error :- query_error(_, _, _).
query_error :- query_error(_, _, _, _).
query_error :- query_error(_, _, _, _, _).

#show order(Level, Index, Field, Direction) :
    order(Level, Index, Field, Direction),
    not query_error.

#show query_error/1.
#show query_error/2.
#show query_error/3.
#show query_error/4.
#show query_error/5.