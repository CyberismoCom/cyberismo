%
% Common definitions for all Cards projects
%

% parent and ancestor
ancestor(A, C) :- parent(A, C), card(A), card(B).
ancestor(A, C) :- parent(A, B), ancestor (B, C), card(A), card(B), card(C).

% if the card type is given, then it's a card
card(C) :- field(C, "cardType", _).

% data types for non-shortText default values

dataType(Card, "lastUpdated", "dateTime") :-
    field(Card, "lastUpdated", _).

% add workflow state category as a calculated field for Cards
field(Card, "workflowStateCategory", Category) :-
    card(Card),
    field(Card, "workflowState", State),
    field(Card, "cardType", CardType),
    field(CardType, "workflow", Workflow),
    workflowState(Workflow, State, Category).


% data types of fields
dataType(Key, Field, DataType) :-
    field(Key, Field, _),
    fieldType(Field),
    field(Field, "dataType", DataType).

% data types for enum values

dataType((FieldType, EnumValue), "index", "integer") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDisplayValue", "shortText") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumDescription", "longText") :-
    enumValue(FieldType, EnumValue).

dataType((FieldType, EnumValue), "enumValue", "longText") :-
    enumValue(FieldType, EnumValue).

% descendants of hidden cards are hidden

hiddenInTreeView(Card) :-
    ancestor(Card, Ancestor),
    hiddenInTreeView(Ancestor).

% python functions

#script (python)
from clingo import Number, String, SymbolType
from datetime import date

class Context:
    def daysSince(self, isodate):
        try:
            userdate = date.fromisoformat(isodate.string)
            today = date.today()
            return Number((today-userdate).days)
        except:
            return Number(0)

    def concatenate(self, *args):
        try:
            result = ""
            for arg in args:
                match arg.type:
                    case SymbolType.String:
                        result = result + arg.string
                    case SymbolType.Number:
                        result = result + str(arg.number)
                    case SymbolType.Function:
                        # constants such as card keys are represented as function symbols
                        result = result + arg.name
            return String(result)
        except:
            return String("")

def main(prg):
    prg.ground([("base", [])], context=Context())
    prg.solve()
#end.
