notification(Card, Category, Title, Message) :-
    field(Card, "cardType", "test/cardTypes/checks"),
    field(Card, "test/fieldTypes/notificationCategory", Category),
    field(Card, "test/fieldTypes/notificationTitle", Title),
    field(Card, "test/fieldTypes/notificationMessage", Message),
    field(Card, "test/fieldTypes/enableNotification", "true").

policyCheckFailure(Card, Category, Title, Message) :-
    field(Card, "cardType", "test/cardTypes/checks"),
    field(Card, "test/fieldTypes/failureCategory", Category),
    field(Card, "test/fieldTypes/failureTitle", Title),
    field(Card, "test/fieldTypes/failureMessage", Message),
    field(Card, "test/fieldTypes/enableFailingCheck", "true").

policyCheckSuccess(Card, Category, Title) :-
    field(Card, "cardType", "test/cardTypes/checks"),
    field(Card, "test/fieldTypes/successCategory", Category),
    field(Card, "test/fieldTypes/successTitle", Title),
    field(Card, "test/fieldTypes/enableSuccessfulCheck", "true").