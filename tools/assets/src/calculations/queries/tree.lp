select("title";"statusIndicator";"progress";"rank";"cardType").

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

% Children by rank, and cards of the same rank by key
order(Level, "children", 1, "rank", "ASC") :-
    level(Level).
order(Level, "children", 2, "key", "ASC") :-
    level(Level).

% The tree returns every card, hidden ones included. isHidden is true when the
% card or one of its ancestors is hiddenInTreeView. It only says the card is left
% out of navigation trees (the sidebar, exported sites); a hidden card is still
% a real card that can be opened, linked to and shown in breadcrumbs.
treeCard(Card) :- result(Card).
treeCard(Card) :- childResult(_, Card, "children").

resultField(Card, "isHidden", true, "boolean") :- treeCard(Card), hiddenInTreeView(Card).
resultField(Card, "isHidden", false, "boolean") :- treeCard(Card), not hiddenInTreeView(Card).
