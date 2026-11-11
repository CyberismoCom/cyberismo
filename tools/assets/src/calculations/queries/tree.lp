select("title";"statusIndicator";"progress";"rank";"cardType";"isHidden").

% hidden cards stay in the result; consumers that display a navigation tree filter on isHidden
{{#if cardKey}}
result({{cardKey}}).
{{#if recursive}}
% child below
childResult({{cardKey}}, Card, "children") :- parent(Card, {{cardKey}}).
childResult(Parent, Card, "children") :- childResult(_, Parent, "children"), parent(Card, Parent).
{{/if}}

{{else}}
result(Card) :- projectCard(Card), not parent(Card, _).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent).
{{/if}}

order(Level, "children", 1, "rank", "ASC") :-
    level(Level).


% any card in the tree, top level or nested
treeCard(Card) :- result(Card).
treeCard(Card) :- childResult(_, Card, "children").

resultField(Card, "isHidden", true, "boolean") :- treeCard(Card), hiddenInTreeView(Card).
resultField(Card, "isHidden", false, "boolean") :- treeCard(Card), not hiddenInTreeView(Card).
