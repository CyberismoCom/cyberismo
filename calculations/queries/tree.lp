select("title";"workflowStateCategory";"base/fieldTypes/progress";"rank";"cardType").
result(Card) :- card(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card) :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
orderBy("rank", "ASC").