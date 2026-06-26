% Resolve which skills are enabled for the current request.
%
% A skill is enabled either globally (enableSkill/1) or for specific cards
% (enableSkill/2) — never both. If both are defined for the same skill, the
% global enablement wins and the per-card terms are ignored.
%
% Each enabled skill name is surfaced via result/1; the caller looks up the
% skill metadata separately. When a cardKey is given, per-card skills are
% limited to that card; otherwise every per-card skill is included.

globallyEnabled(S) :- enableSkill(S).

result(S) :- globallyEnabled(S).
{{#if cardKey}}
result(S) :- enableSkill(S, {{cardKey}}), not globallyEnabled(S).
{{else}}
result(S) :- enableSkill(S, _), not globallyEnabled(S).
{{/if}}
