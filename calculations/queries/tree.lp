select("title";"workflowStateCategory";"base/fieldTypes/progress";"rank";"cardType").
result(Card) :- card(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
order(Level, "children", 1, "rank", "ASC") :-
    level(Level).

