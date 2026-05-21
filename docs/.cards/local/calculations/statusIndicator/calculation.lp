base_disableDefaultStatusIndicator.

field(Card, "statusIndicator", "error") :-
    base_policyCheckFailure(Card, _, _, _).

field(Card, "statusIndicator", "active") :-
    not base_policyCheckFailure(Card, _, _, _),
    not field(Card, "progress", _),
    field(Card, "lastUpdated", LastUpdated),
    @daysSince(LastUpdated) < 45.

field(Card, "statusIndicator", "active") :-
    not base_policyCheckFailure(Card, _, _, _),
    ancestor(Descendant, Card),
    field(Descendant, "statusIndicator", "active").