select("title";"statusIndicator";"progress";"rank";"cardType";"template").
{{#each parents}}
result(Card) :- card(Card), parent(Card, "{{this}}").
field(Card, "template", "{{this}}") :- card(Card), parent(Card, "{{this}}"), not hiddenInTreeView(Card).
{{else}}
result(Card) :- card(Card), not parent(Card, _), not hiddenInTreeView(Card).
{{/each}}
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
order(Level, "children", 1, "rank", "ASC") :-
    level(Level).

