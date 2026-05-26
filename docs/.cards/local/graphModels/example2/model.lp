view(Child) :- view(Parent), parent(Child, Parent).

node(Card) :- card(Card), view(Card).
attr(node, Card, "label", Title) :- node(Card), field(Card, "title", Title).
attr(node, Card, "shape", "Box") :- node(Card).

edge((Parent, Child)) :- parent(Child, Parent), view(Child), view(Parent).