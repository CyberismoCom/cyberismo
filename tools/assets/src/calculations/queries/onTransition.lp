selectAll.

result(transitionSideEffects).

childResult(transitionSideEffects, @concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "updateFields") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

% These synthetic side-effect objects (keyed by @concatenate, not a real
% card/field) are output, not information -- resultField, always shown since
% selectAll above already made these unconditional. "card"/"field"/
% "newValue"/"transitionToExecute" are never real schema field names, so
% they never resolved a dataType via the old field/3 lookup either: shortText
% is what showed before and is supplied directly now.
resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "card", AffectedCard, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "field", Field, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

resultField(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "newValue", NewValue, "shortText") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

childResult(transitionSideEffects, @concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "executeTransition") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute),
    not transitionDenied(AffectedCard, TransitionToExecute, _).

resultField(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "card", AffectedCard, "shortText") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute).

resultField(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "transitionToExecute", TransitionToExecute, "shortText") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute).
