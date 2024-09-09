
%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the cardtype is given, then it's a card
card(C) :- field(C, "cardtype", _).

% the default fields are not calculated, so let's mark them as user fields.
userfield(Cardkey, "cardtype") :- field(Cardkey, "cardtype", Cardtype).
userfield(Cardkey, "title") :- field(Cardkey, "cardtype", Cardtype).
userfield(Cardkey, "workflowState") :- field(Cardkey, "cardtype", Cardtype).

% if all values of a field are cardkeys, then the field is of type "cardkeys"
fieldtype(X, Field, "cardkeys") :- field(X, Field, _), card(Value) : field(X, Field, Value).

