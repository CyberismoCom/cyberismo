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

% Fields

select(2, "fields", "visibility").
select(2, "fields", "index").
select(2, "fields", "fieldDisplayName").
select(2, "fields", "fieldDescription").
select(2, "fields", "dataType").
select(2, "fields", "isCalculated").
select(2, "fields", "value").

list(Card, "fields") :-
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

% labels
select(1, "labels").

list(Card, "labels") :-
    result(Card).

field(Card, "labels", Label, "stringList") :-
    label(Card, Label),
    result(Card).




% links
select(2, "links", "displayName").
select(2, "links", "linkDescription").
select(2, "links", "direction").
select(2, "links", "linkType").
select(2, "links", "displayName").
select(2, "links", "linkSource").
select(2, "links", "title").
select(2, "links", "key").

list(Card, "links") :-
    result(Card).

childResult(Card, (Card, Destination, LinkType, "", "outbound"), "links") :-
    link(Card, Destination, LinkType),
    result(Card).

childResult(Card, (Card, Destination, LinkType, LinkDescription, "outbound"), "links") :-
    link(Card, Destination, LinkType, LinkDescription),
    result(Card).

childResult(Card, (Source, Card, LinkType, "", "inbound"), "links") :-
    link(Source, Card, LinkType),
    result(Card).

childResult(Card, (Source, Card, LinkType, LinkDescription, "inbound"), "links") :-
    link(Source, Card, LinkType, LinkDescription),
    result(Card).

% links: displayName
field((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "outbound",
    field(LinkType, "outboundDisplayName", DisplayName).

field((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "inbound",
    field(LinkType, "inboundDisplayName", DisplayName).

% links: link description
field((Source, Destination, LinkType, LinkDescription, Direction), "linkDescription", LinkDescription, "shortText") :-
    LinkDescription != "",
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: direction and link type
field((Source, Destination, LinkType, LinkDescription, Direction), "direction", Direction, "linkType", LinkType) :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: link source

field((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType).

field((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType, LinkDescription).

field((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType).

field((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType, LinkDescription).

% links: title
field((Card, Destination, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links"),
    field(Destination, "title", Title).

field((Source, Card, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    field(Source, "title", Title).

% links: key
field((Card, Destination, LinkType, LinkDescription, Direction), "key", Destination, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links").

field((Source, Card, LinkType, LinkDescription, Direction), "key", Source, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    field(Source, "title", Title).

% policy checks
select(3, "successes", "title").
select(3, "successes", "category").
select(3, "failures", "title").
select(3, "failures", "category").
select(3, "failures", "errorMessage").
select(3, "failures", "fieldName").

childObject(Card, (Card, "policyChecks"), "policyChecks") :-
    result(Card).

list((Card, "policyChecks"), "successes") :-
    result(Card).

list((Card, "policyChecks"), "failures") :-
    result(Card).

% successes
childResult((Card, "policyChecks"), (Card, Category, Title), "successes") :-
    result(Card),
    policyCheckSuccess(Card, Category, Title).

field((Card, Category, Title), "category", Category, "title", Title) :-
    result(Card),
    policyCheckSuccess(Card, Category, Title).

% failures

% add empty field for failures with no field
policyCheckFailure(Card, Category, Title, ErrorMessage, "") :-
    result(Card),
    policyCheckFailure(Card, Category, Title, ErrorMessage).

childResult((Card, "policyChecks"), (Card, Category, Title, ErrorMessage, Field), "failures") :-
    result(Card),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

field((Card, Category, Title, ErrorMessage, Field), "category", Category, "title", Title, "errorMessage", ErrorMessage) :-
    result(Card),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

field((Card, Category, Title, ErrorMessage, Field), "fieldName", Field) :-
    result(Card),
    Field != "",
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).


select(2, "notifications", "title").
select(2, "notifications", "category").
select(2, "notifications", "message").

list(Card, "notifications") :-
    result(Card).

% notifications
childResult(Card, (Card, Category, Title, Message), "notifications") :-
    result(Card),
    notification(Card, Category, Title, Message).

field((Card, Category, Title, Message), "key", Card, "category", Category, "title", Title) :-
    result(Card),
    notification(Card, Category, Title, Message).

field((Card, Category, Title, Message), "message", Message) :-
    result(Card),
    notification(Card, Category, Title, Message).

% deniedOperations
select(3, "transition", "transitionName").
select(3, "transition", "errorMessage").
select(3, "move", "errorMessage").
select(3, "delete", "errorMessage").
select(3, "editField", "fieldName").
select(3, "editField", "errorMessage").
select(3, "editContent", "errorMessage").

childObject(Card, (Card, "deniedOperations"), "deniedOperations") :-
    result(Card).

% transition denied operations
list((Card, "deniedOperations"), "transition") :-
    result(Card).

childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition") :-
    result(Card),
    transitionDenied(Card, TransitionName, ErrorMessage).

field((Card, TransitionName, ErrorMessage), "transitionName", TransitionName, "errorMessage", ErrorMessage) :-
    result(Card),
    transitionDenied(Card, TransitionName, ErrorMessage).

% move denied operations
list((Card, "deniedOperations"), "move") :-
    result(Card).

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move") :-
    result(Card),
    movingCardDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    result(Card),
    movingCardDenied(Card, ErrorMessage).

% delete denied operations
list((Card, "deniedOperations"), "delete") :-
    result(Card).

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete") :-
    result(Card),
    deletingCardDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    result(Card),
    deletingCardDenied(Card, ErrorMessage).

% editField denied operations
list((Card, "deniedOperations"), "editField") :-
    result(Card).

childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField") :-
    result(Card),
    editingFieldDenied(Card, FieldName, ErrorMessage).

field((Card, FieldName, ErrorMessage), "fieldName", FieldName, "errorMessage", ErrorMessage) :-
    result(Card),
    editingFieldDenied(Card, FieldName, ErrorMessage).

% editContent denied operations
list((Card, "deniedOperations"), "editContent") :-
    result(Card).

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent") :-
    result(Card),
    editingContentDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    result(Card),
    editingContentDenied(Card, ErrorMessage).

order(2, "fields", 1, "visibility", "ASC").
order(2, "fields", 2, "index", "ASC").
order(3, "enumValues", 1, "index", "ASC").