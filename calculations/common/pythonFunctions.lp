% python functions

#script (python)
from clingo import Number, String, SymbolType
from datetime import date

class Functions:
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

    def daysSince(self, isodate):
        try:
            userdate = date.fromisoformat(isodate.string)
            today = date.today()
            return Number((today-userdate).days)
        except:
            return Number(0)

def main(prg):
    prg.ground([("base", [])], context=Functions())
    prg.solve()
#end.
