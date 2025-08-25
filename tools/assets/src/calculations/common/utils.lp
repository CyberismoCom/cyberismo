% Utils extends the cyberismo query language

% policy checks

childObject(Card, (Card, "policyChecks"), "policyChecks") :-
    showField(Card, "policyChecks").

childResultCollection((Card, "policyChecks"), "successes") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks").

childResultCollection((Card, "policyChecks"), "failures") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks").

% successes
childResult((Card, "policyChecks"), (Card, Category, Title), "successes") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckSuccess(Card, Category, Title).

showFields((Card, Category, Title), "category", Category, "shortText", "title", Title, "shortText") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckSuccess(Card, Category, Title).

% failures

% add empty field for failures with no field
policyCheckFailure(Card, Category, Title, ErrorMessage, "") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckFailure(Card, Category, Title, ErrorMessage).

childResult((Card, "policyChecks"), (Card, Category, Title, ErrorMessage, Field), "failures") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

showFields((Card, Category, Title, ErrorMessage, Field), "category", Category, "shortText", "title", Title, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

showField((Card, Category, Title, ErrorMessage, Field), "fieldName", Field, "shortText") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    Field != "",
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).



% links

childResultCollection(Card, "links") :-
    showField(Card, "links").

childResult(Card, (Card, Destination, LinkType, "", "outbound"), "links") :-
    link(Card, Destination, LinkType),
    showField(Card, "links").

childResult(Card, (Card, Destination, LinkType, LinkDescription, "outbound"), "links") :-
    link(Card, Destination, LinkType, LinkDescription),
    showField(Card, "links").

childResult(Card, (Source, Card, LinkType, "", "inbound"), "links") :-
    link(Source, Card, LinkType),
    showField(Card, "links").

childResult(Card, (Source, Card, LinkType, LinkDescription, "inbound"), "links") :-
    link(Source, Card, LinkType, LinkDescription),
    showField(Card, "links").

% links: displayName
showField((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "outbound",
    field(LinkType, "outboundDisplayName", DisplayName).

showField((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "inbound",
    field(LinkType, "inboundDisplayName", DisplayName).

% links: link description
showField((Source, Destination, LinkType, LinkDescription, Direction), "linkDescription", LinkDescription, "shortText") :-
    LinkDescription != "",
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: direction and link type
showFields((Source, Destination, LinkType, LinkDescription, Direction), "direction", Direction, "shortText", "linkType", LinkType, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: link source

showField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType).

showField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType, LinkDescription).

showField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType).

showField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType, LinkDescription).

% links: title
showField((Card, Destination, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links"),
    field(Destination, "title", Title).

showField((Source, Card, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    field(Source, "title", Title).

% links: key
showField((Card, Destination, LinkType, LinkDescription, Direction), "key", Destination, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links").

showField((Source, Card, LinkType, LinkDescription, Direction), "key", Source, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    field(Source, "title", Title).


% notifications
childResultCollection(Card, "notifications") :-
    showField(Card, "notifications").

% notifications
childResult(Card, (Card, Category, Title, Message), "notifications") :-
    showField(Card, "notifications"),
    notification(Card, Category, Title, Message).

showFields((Card, Category, Title, Message), "key", Card, "shortText", "category", Category, "shortText", "title", Title, "shortText") :-
    childResult(Card, (Card, Category, Title, Message), "notifications").

showField((Card, Category, Title, Message), "message", Message, "shortText") :-
    childResult(Card, (Card, Category, Title, Message), "notifications").


% denied operations

childObject(Card, (Card, "deniedOperations"), "deniedOperations") :-
    showField(Card, "deniedOperations").

% transition denied operations
childResultCollection((Card, "deniedOperations"), "transition") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    transitionDenied(Card, TransitionName, ErrorMessage).

showFields((Card, TransitionName, ErrorMessage), "transitionName", TransitionName, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition").

% move denied operations
childResultCollection((Card, "deniedOperations"), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    movingCardDenied(Card, ErrorMessage).

showField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move").

% delete denied operations
childResultCollection((Card, "deniedOperations"), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    deletingCardDenied(Card, ErrorMessage).

showField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete").

% editField denied operations
childResultCollection((Card, "deniedOperations"), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingFieldDenied(Card, FieldName, ErrorMessage).

showFields((Card, FieldName, ErrorMessage), "fieldName", FieldName, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField").

% editContent denied operations
childResultCollection((Card, "deniedOperations"), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingContentDenied(Card, ErrorMessage).

showField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent").


% labels
childResultCollection(Card, "labels") :-
    showField(Card, "labels").

showField(Card, "labels", Label, "stringList") :-
    showField(Card, "labels"),
    label(Card, Label).
