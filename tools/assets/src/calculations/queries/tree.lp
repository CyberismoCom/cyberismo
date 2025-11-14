select("title";"statusIndicator";"progress";"rank";"cardType").

{{#if cardKey}}
result({{cardKey}}).
{{#if recursive}}
% child below
childResult({{cardKey}}, Card, "children") :- parent(Card, {{cardKey}}), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- childResult(_, Parent, "children"), parent(Card, Parent), not hiddenInTreeView(Card).
{{/if}}

{{else}}
result(Card) :- projectCard(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
{{/if}}

order(Level, "children", 1, "rank", "ASC") :-
    level(Level).

