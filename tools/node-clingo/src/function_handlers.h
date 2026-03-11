/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#ifndef NODE_CLINGO_FUNCTION_HANDLERS_H
#define NODE_CLINGO_FUNCTION_HANDLERS_H

#include <functional>
#include <string>
#include <unordered_map>

#include <clingo.hh>

namespace node_clingo
{

    using FunctionHandler =
        std::function<void(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback symbolCallback)>;

    /**
     * Handler for the @concatenate function.
     * Concatenates string arguments.
     */
    void handle_concatenate(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback symbolCallback);

    /**
     * Handler for the @days_since function.
     * Calculates the number of days between two dates.
     */
    void handle_days_since(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback symbolCallback);

    /**
     * Handler for the @today function.
     * Returns the current date.
     */
    void handle_today(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback symbolCallback);

    /**
     * Handler for the @wrap function.
     * Wraps a value within a specified range. Also escapes the result.
     */
    void handle_wrap(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback symbolCallback);

    /**
     * Get the map of function names to their handlers.
     * @returns A constant reference to the unordered map containing function handlers.
     */
    const std::unordered_map<std::string, FunctionHandler>& get_function_handlers();

} // namespace node_clingo

#endif // NODE_CLINGO_FUNCTION_HANDLERS_H
