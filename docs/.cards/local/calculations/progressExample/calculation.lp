field(Card, "progress", 100 * Closed / Total) :-
    label(Card, "task-progress"),
    Closed = #count {
        card(Descendant) :
        ancestor(Descendant, Card),
        field(Descendant, "workflowStateCategory", "closed")
    },
    Total = #count {
        card(Descendant) :
        ancestor(Descendant, Card)
    },
    Total != 0.