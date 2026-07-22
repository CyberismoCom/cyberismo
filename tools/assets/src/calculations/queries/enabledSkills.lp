% Resolve which skills are enabled for the current request.
%
% A skill is enabled either globally (enableSkill/1) or for specific cards
% (enableSkill/2) — never both. If both are defined for the same skill, the
% global enablement wins and the per-card terms are ignored.
%
% Each enabled skill name is surfaced via result/1, together with its scope
% ("global" or "card") via resultField/4. When a cardKey is given, per-card
% skills are limited to that card; otherwise every per-card skill is included.

result(S) :- enableSkill(S).
{{#if cardKey}}
result(S) :- enableSkill(S, {{cardKey}}).
{{else}}
result(S) :- enableSkill(S, _).
{{/if}}

resultField(S, "scope", "global", "shortText") :- enableSkill(S).
resultField(S, "scope", "card", "shortText") :- result(S), not enableSkill(S).
