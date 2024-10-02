
%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

% the default fields are not calculated, so let's mark them as user fields.
userField(CardKey, "cardType") :- field(CardKey, "cardType", CardType).
userField(CardKey, "title") :- field(CardKey, "cardType", CardType).
userField(CardKey, "workflowState") :- field(CardKey, "cardType", CardType).

% if all values of a field are cardKeys, then the field is of type "cardKeys"
fieldType(X, Field, "cardKeys") :- field(X, Field, _), card(Value) : field(X, Field, Value).

