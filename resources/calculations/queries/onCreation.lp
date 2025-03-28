% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

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

field(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "card", AffectedCard) :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

field(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "field", Field) :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

field(@concatenate("updateFields", Card, CreateTransition, AffectedCard, Field, NewValue), "newValue", NewValue) :-
    updateField(Card, CreateTransition, AffectedCard, Field, NewValue).

childResult(transitionSideEffects, @concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "executeTransition") :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).

field(@concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "card", AffectedCard) :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).

field(@concatenate("executeTransition", Card, CreateTransition, AffectedCard, TransitionToExecute), "transitionToExecute", TransitionToExecute) :-
    executeTransition(Card, CreateTransition, AffectedCard, TransitionToExecute).
