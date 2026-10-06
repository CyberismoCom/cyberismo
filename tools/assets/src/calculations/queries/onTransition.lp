selectAll.

result(transitionSideEffects).

childResult(transitionSideEffects, @concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "updateFields") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

% output-only attributes: no field type, so shortText
resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "card", AffectedCard, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "field", Field, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "newValue", NewValue, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

childResult(transitionSideEffects, @concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "executeTransition") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute),
    not transitionDenied(AffectedCard, TransitionToExecute, _).

resultField(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "card", AffectedCard, "shortText") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute),
    not transitionDenied(AffectedCard, TransitionToExecute, _).

resultField(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "transitionToExecute", TransitionToExecute, "shortText") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute),
    not transitionDenied(AffectedCard, TransitionToExecute, _).
