% python functions

#script (python)
from clingo import Number, String, SymbolType
from datetime import date, datetime, timezone

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
            userdate = datetime.fromisoformat(isodate.string)
            # add UTC timezone in case the isodate was just a date without time
            # datetimes are stored in UTC format in Cyberismo, so for them there is no effect
            userdate = userdate.replace(tzinfo=timezone.utc)
            today = datetime.now(timezone.utc)
            return Number((today-userdate).days)
        except:
            return Number(0)

    def today(self):
        return String(date.today().isoformat())

def main(prg):
    prg.ground([("base", [])], context=Functions())
    prg.solve()
#end.
