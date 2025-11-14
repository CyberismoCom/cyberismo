% This is a test version of the tree query which does not use handlebars syntax
select("title";"statusIndicator";"progress";"rank";"cardType").
result(Card) :- projectCard(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
order(Level, "children", 1, "rank", "ASC") :-
    level(Level).