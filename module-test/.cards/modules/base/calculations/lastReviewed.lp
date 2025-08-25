
% base/workflows/review
onTransitionSetField(Card, "Mark as passed", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/review").

onTransitionSetField(Card, "Mark as failed", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/review").

% base/workflows/reviewTask

onTransitionSetField(Card, "Require changes", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/reviewTask").

onTransitionSetField(Card, "Done", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/reviewTask").

onTransitionSetField(Card, "Review as OK", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/reviewTask").

onTransitionSetField(Card, "Review as not applicable", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/reviewTask").

% base/workflows/recurringTask

onTransitionSetField(Card, "Review as applicable", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/recurringTask").

onTransitionSetField(Card, "Review as not applicable", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/recurringTask").

onTransitionSetField(Card, "Done", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/recurringTask").

onTransitionSetField(Card, "Review as OK", Card, "base/fieldTypes/lastReviewed", @today()) :-
    field(Card, "cardType", CardType),
    customField(CardType, "base/fieldTypes/lastReviewed"),
    field(CardType, "workflow", "base/workflows/recurringTask").
