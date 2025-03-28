% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

select("title";"statusIndicator";"progress";"rank";"cardType").
result(Card) :- card(Card), not parent(Card, _), not hiddenInTreeView(Card).
childResult(Parent, Card, "children") :- card(Card), parent(Card, Parent), not hiddenInTreeView(Card).
order(Level, "children", 1, "rank", "ASC") :-
    level(Level).

