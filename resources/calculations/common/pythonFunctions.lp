% Copyright © Cyberismo Ltd and contributors 2025
%
% License: https://github.com/CyberismoCom/cyberismo/blob/main/LICENSE
% The use of the Cyberismo trademark: https://cyberismo.com/trademark-policy/
% This content is distributed in the hope that it will be useful, but
% WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
% FITNESS FOR A PARTICULAR PURPOSE.

% python functions

#script (python)
from clingo import Number, String, SymbolType
from datetime import date, datetime, timezone
from html import escape
import textwrap

class Functions:
    def concatenate(self, *args):
        """Concatenate strings, constants or numbers as a single string

        Args:
            A variable number of Clingo Strings, Numbers, or Functions (constants)
        Returns
            All the arguments concatenated together as a Clingo string
        """
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
        """Calculates the number of dates since a date

        Args:
            isodate: a Clingo string that is a date in the ISO format

        Returns:
            A Clingo number that is the number of days since isodate
        """
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
        """Returns the current date in the ISO format as a Clingo string. For example '2025-03-03'  """
        return String(date.today().isoformat())

    def wrap(self, original_text):
        """ Adds line break tags <br/> and HTML escaping in a string
        to make the string work better as a title in graphs

        Args:
            original_text: A Clingo string that needs to be wrapped and escaped
        Returns:
            A Clingo string that has been wrapped and escaped to work in diagrams

        """
        try:
            result = ""
            #column with of 27 seems to work fine in diagrams
            line_width = 27
            lines = textwrap.wrap(original_text.string, line_width)
            numlines = len(lines)
            counter = 0
            for line in lines:
                counter += 1
                if counter == numlines:
                    result = result + escape(line)
                else:
                    result = result + escape(line) + "<br/>"
            return String(result)
        except:
            return String("")

def main(prg):
    prg.ground([("base", [])], context=Functions())
    prg.solve()
#end.
