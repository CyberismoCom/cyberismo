% Approving a sideEffects card automatically approves its direct children of
% the same card type. The effect cascades: each child's approval re-applies
% this rule to its own children.
onTransitionExecuteTransition(Card, "Approve", Child, "Approve") :-
    field(Card, "cardType", "test/cardTypes/sideEffects"),
    field(Child, "cardType", "test/cardTypes/sideEffects"),
    parent(Child, Card).

% Archiving likewise archives the whole subtree, level by level. The Archive
% transition is available from any state ('*'), so this works regardless of
% where each child currently is.
onTransitionExecuteTransition(Card, "Archive", Child, "Archive") :-
    field(Card, "cardType", "test/cardTypes/sideEffects"),
    field(Child, "cardType", "test/cardTypes/sideEffects"),
    parent(Child, Card).
