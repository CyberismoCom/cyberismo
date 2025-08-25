transitionDenied(Card, Transition, ErrorMessage) :-
    field(Card, "cardType", "test/cardTypes/deniedOperations"),
    field(Card, "test/fieldTypes/transitionErrorMessage", ErrorMessage),
    field("test/cardTypes/deniedOperations", "workflow", Workflow),
    workflowTransition(Workflow, Transition, _, _),
    field(Card, "test/fieldTypes/denyTransition", "true").

movingCardDenied(Card, ErrorMessage) :-
    field(Card, "cardType", "test/cardTypes/deniedOperations"),
    field(Card, "test/fieldTypes/moveErrorMessage", ErrorMessage),
    field(Card, "test/fieldTypes/denyMove", "true").

deletingCardDenied(Card, ErrorMessage) :-
    field(Card, "cardType", "test/cardTypes/deniedOperations"),
    field(Card, "test/fieldTypes/deleteErrorMessage", ErrorMessage),
    field(Card, "test/fieldTypes/denyDeleting", "true").

editingFieldDenied(Card, "test/fieldTypes/shortText", ErrorMessage) :-
    field(Card, "cardType", "test/cardTypes/deniedOperations"),
    field(Card, "test/fieldTypes/editingFieldErrorMessage", ErrorMessage),
    field(Card, "test/fieldTypes/denyEditingField", "true").

editingContentDenied(Card, ErrorMessage) :-
    field(Card, "cardType", "test/cardTypes/deniedOperations"),
    field(Card, "test/fieldTypes/editingContentErrorMessage", ErrorMessage),
    field(Card, "test/fieldTypes/denyEditingContent", "true").
