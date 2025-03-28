% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

selectAll.

result(transitionSideEffects).

childResult(transitionSideEffects, @concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "updateFields") :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue),
    not editingFieldDenied(AffectedCard, Field, _).

field(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "card", AffectedCard) :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

field(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "field", Field) :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

field(@concatenate("updateFields", {{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue), "newValue", NewValue) :-
    onTransitionSetField({{cardKey}}, "{{transition}}", AffectedCard, Field, NewValue).

childResult(transitionSideEffects, @concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "executeTransition") :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute),
    not transitionDenied(AffectedCard, TransitionToExecute, _).

field(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "card", AffectedCard) :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute).

field(@concatenate("executeTransition", {{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute), "transitionToExecute", TransitionToExecute) :-
    onTransitionExecuteTransition({{cardKey}}, "{{transition}}", AffectedCard, TransitionToExecute).
