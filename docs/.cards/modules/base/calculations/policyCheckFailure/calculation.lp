% a helper term for finding failures regardless of they have a field or not
base_policyCheckFailure(Card, Category, Title, Message) :-
    policyCheckFailure(Card, Category, Title, Message).

base_policyCheckFailure(Card, Category, Title, Message) :-
    policyCheckFailure(Card, Category, Title, Message, Field).
