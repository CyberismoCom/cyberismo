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

resultFields((Card, Category, Title), "category", Category, "shortText", "title", Title, "shortText") :-
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

resultFields((Card, Category, Title, ErrorMessage, Field), "category", Category, "shortText", "title", Title, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

resultField((Card, Category, Title, ErrorMessage, Field), "fieldName", Field, "shortText") :-
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
resultField((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "outbound",
    field(LinkType, "outboundDisplayName", DisplayName).

resultField((Source, Destination, LinkType, LinkDescription, Direction), "displayName", DisplayName, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    Direction = "inbound",
    field(LinkType, "inboundDisplayName", DisplayName).

% links: link description
resultField((Source, Destination, LinkType, LinkDescription, Direction), "linkDescription", LinkDescription, "shortText") :-
    LinkDescription != "",
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: direction and link type
resultFields((Source, Destination, LinkType, LinkDescription, Direction), "direction", Direction, "shortText", "linkType", LinkType, "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links").

% links: link source

resultField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType).

resultField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "user", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    userLink(Source, Destination, LinkType, LinkDescription).

resultField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType).

resultField((Source, Destination, LinkType, LinkDescription, Direction), "linkSource", "calculated", "shortText") :-
    childResult(_, (Source, Destination, LinkType, LinkDescription, Direction), "links"),
    calculatedLink(Source, Destination, LinkType, LinkDescription).

% links: title - for card destinations
resultField((Card, Destination, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links"),
    field(Destination, "title", Title),
    card(Destination).

% links: title - for external item destinations (from externalItem facts)
resultField((Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "links"),
    field((Connector, ItemKey), "title", Title).

% links: title - for external item destinations (fallback to key if no title fact)
resultField((Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "title", ItemKey, "shortText") :-
    childResult(Card, (Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "links"),
    not field((Connector, ItemKey), "title", _).

% links: title - for card sources (inbound)
resultField((Source, Card, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    field(Source, "title", Title),
    card(Source).

% links: title - for external item sources (inbound, from externalItem facts)
resultField(((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "title", Title, "shortText") :-
    childResult(Card, ((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "links"),
    field((Connector, ItemKey), "title", Title).

% links: title - for external item sources (inbound, fallback to key if no title fact)
resultField(((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "title", ItemKey, "shortText") :-
    childResult(Card, ((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "links"),
    not field((Connector, ItemKey), "title", _).

% links: key - for card destinations
resultField((Card, Destination, LinkType, LinkDescription, Direction), "key", Destination, "shortText") :-
    childResult(Card, (Card, Destination, LinkType, LinkDescription, Direction), "links"),
    card(Destination).

% links: key - for external item destinations
resultField((Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "key", ItemKey, "shortText") :-
    childResult(Card, (Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "links").

% links: key - for card sources (inbound)
resultField((Source, Card, LinkType, LinkDescription, Direction), "key", Source, "shortText") :-
    childResult(Card, (Source, Card, LinkType, LinkDescription, Direction), "links"),
    card(Source).

% links: key - for external item sources (inbound)
resultField(((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "key", ItemKey, "shortText") :-
    childResult(Card, ((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "links").

% links: connector - for external item destinations
resultField((Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "connector", Connector, "shortText") :-
    childResult(Card, (Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "links").

% links: connector - for external item sources (inbound)
resultField(((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "connector", Connector, "shortText") :-
    childResult(Card, ((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "links").

% links: url - for external item destinations (only if url fact exists)
resultField((Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "url", Url, "shortText") :-
    childResult(Card, (Card, (Connector, ItemKey), LinkType, LinkDescription, Direction), "links"),
    field((Connector, ItemKey), "url", Url).

% links: url - for external item sources (inbound, only if url fact exists)
resultField(((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "url", Url, "shortText") :-
    childResult(Card, ((Connector, ItemKey), Card, LinkType, LinkDescription, Direction), "links"),
    field((Connector, ItemKey), "url", Url).


% notifications
childResultCollection(Card, "notifications") :-
    showField(Card, "notifications").

% notifications
childResult(Card, (Card, Category, Title, Message), "notifications") :-
    showField(Card, "notifications"),
    notification(Card, Category, Title, Message).

resultFields((Card, Category, Title, Message), "key", Card, "shortText", "category", Category, "shortText", "title", Title, "shortText") :-
    childResult(Card, (Card, Category, Title, Message), "notifications").

resultField((Card, Category, Title, Message), "message", Message, "shortText") :-
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

resultFields((Card, TransitionName, ErrorMessage), "transitionName", TransitionName, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition").

% move denied operations
childResultCollection((Card, "deniedOperations"), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    movingCardDenied(Card, ErrorMessage).

resultField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move").

% delete denied operations
childResultCollection((Card, "deniedOperations"), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    deletingCardDenied(Card, ErrorMessage).

resultField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete").

% editField denied operations
childResultCollection((Card, "deniedOperations"), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingFieldDenied(Card, FieldName, ErrorMessage).

resultFields((Card, FieldName, ErrorMessage), "fieldName", FieldName, "shortText", "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField").

% editContent denied operations
childResultCollection((Card, "deniedOperations"), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingContentDenied(Card, ErrorMessage).

resultField((Card, ErrorMessage), "errorMessage", ErrorMessage, "shortText") :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent").


% labels
childResultCollection(Card, "labels") :-
    showField(Card, "labels").

resultField(Card, "labels", Label, "stringList") :-
    showField(Card, "labels"),
    label(Card, Label).
