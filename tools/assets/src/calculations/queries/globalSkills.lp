% Skills enabled globally via enableSkill/1.
%
% Used to tell a globally-enabled skill apart from a card-specific one when no
% cardKey is supplied — a card-specific skill needs a cardKey to render.

result(S) :- enableSkill(S).
