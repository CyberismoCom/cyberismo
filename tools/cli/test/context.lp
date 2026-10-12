% Returns the top-level cards only when run in the commandLine execution context
select("title").
result(Card) :- projectCard(Card), not parent(Card, _), commandLine.
