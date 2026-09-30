{{#each cardKeys}}
createdCard({{this}}).
{{/each}}

updateField(Card, CreateTransition, AffectedCard, Field, NewValue) :-
    createdCard(Card),
    onTransitionSetField(Card, CreateTransition, AffectedCard, Field, NewValue),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowTransition(Workflow, CreateTransition, "", _),
    not editingFieldDenied(AffectedCard, Field, _).

executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute) :-
    createdCard(Card),
    onTransitionExecuteTransition(Card, CreateTransition, AffectedCard, TransitionToExecute),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowTransition(Workflow, CreateTransition, "", _),
    not transitionDenied(AffectedCard, TransitionToExecute, _).

selectAll.

result(transitionSideEffects).

childResult(transitionSideEffects, @concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "updateFields") :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

% output-only attributes: no field type, so shortText
resultField(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "card", AffectedCard, "shortText") :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

resultField(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "field", Field, "shortText") :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

resultField(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "newValue", NewValue, "shortText") :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

childResult(transitionSideEffects, @concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "executeTransition") :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).

resultField(@concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "card", AffectedCard, "shortText") :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).

resultField(@concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "transitionToExecute", TransitionToExecute, "shortText") :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).
