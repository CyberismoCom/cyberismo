field(Card, "workflowStateCategory", Category) :-
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).

select("title";"workflowStateCategory";"base/fieldTypes/progress";"rank").
result(Card) :- card(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card) :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
orderBy("rank", "ASC").