onTransitionSetField(Card, "Create", Card, "title", @concatenate(@today(), " Untitled meeting notes")) :-
    field(Card, "cardType", "base/cardTypes/page"),
    field(Card, "title", "Untitled meeting notes").
