% Utils extends the cyberismo query language

% policy checks
selectCollectionField("successes", "title").
selectCollectionField("successes", "category").
selectCollectionField("failures", "title").
selectCollectionField("failures", "category").
selectCollectionField("failures", "errorMessage").
selectCollectionField("failures", "fieldName").

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

fields((Card, Category, Title), "category", Category, "title", Title) :-
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

fields((Card, Category, Title, ErrorMessage, Field), "category", Category, "title", Title, "errorMessage", ErrorMessage) :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).

field((Card, Category, Title, ErrorMessage, Field), "fieldName", Field) :-
    childObject(Card, (Card, "policyChecks"), "policyChecks"),
    Field != "",
    policyCheckFailure(Card, Category, Title, ErrorMessage, Field).



% links
selectCollectionField("links", "displayName").
selectCollectionField("links", "linkDescription").
selectCollectionField("links", "direction").
selectCollectionField("links", "linkType").
selectCollectionField("links", "displayName").
selectCollectionField("links", "linkSource").
selectCollectionField("links", "title").
selectCollectionField("links", "key").

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
fields((Source, Destination, LinkType, LinkDescription, Direction), "direction", Direction, "linkType", LinkType) :-
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


% notifications
select(2, "notifications", "title").
select(2, "notifications", "category").
select(2, "notifications", "message").

childResultCollection(Card, "notifications") :-
    showField(Card, "notifications").

% notifications
childResult(Card, (Card, Category, Title, Message), "notifications") :-
    showField(Card, "notifications"),
    notification(Card, Category, Title, Message).

fields((Card, Category, Title, Message), "key", Card, "category", Category, "title", Title) :-
    childResult(Card, (Card, Category, Title, Message), "notifications").

field((Card, Category, Title, Message), "message", Message) :-
    childResult(Card, (Card, Category, Title, Message), "notifications").


% denied operations
selectCollectionField("transition", "transitionName").
selectCollectionField("transition", "errorMessage").
selectCollectionField("move", "errorMessage").
selectCollectionField("delete", "errorMessage").
selectCollectionField("editField", "fieldName").
selectCollectionField("editField", "errorMessage").
selectCollectionField("editContent", "errorMessage").

childObject(Card, (Card, "deniedOperations"), "deniedOperations") :-
    showField(Card, "deniedOperations").

% transition denied operations
childResultCollection((Card, "deniedOperations"), "transition") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    transitionDenied(Card, TransitionName, ErrorMessage).

fields((Card, TransitionName, ErrorMessage), "transitionName", TransitionName, "errorMessage", ErrorMessage) :-
    childResult((Card, "deniedOperations"), (Card, TransitionName, ErrorMessage), "transition").

% move denied operations
childResultCollection((Card, "deniedOperations"), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    movingCardDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "move").

% delete denied operations
childResultCollection((Card, "deniedOperations"), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    deletingCardDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "delete").

% editField denied operations
childResultCollection((Card, "deniedOperations"), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingFieldDenied(Card, FieldName, ErrorMessage).

fields((Card, FieldName, ErrorMessage), "fieldName", FieldName, "errorMessage", ErrorMessage) :-
    childResult((Card, "deniedOperations"), (Card, FieldName, ErrorMessage), "editField").

% editContent denied operations
childResultCollection((Card, "deniedOperations"), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations").

childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent") :-
    childObject(Card, (Card, "deniedOperations"), "deniedOperations"),
    editingContentDenied(Card, ErrorMessage).

field((Card, ErrorMessage), "errorMessage", ErrorMessage) :-
    childResult((Card, "deniedOperations"), (Card, ErrorMessage), "editContent").


% labels
childResultCollection(Card, "labels") :-
    showField(Card, "labels").

field(Card, "labels", Label, "stringList") :-
    showField(Card, "labels"),
    label(Card, Label).
