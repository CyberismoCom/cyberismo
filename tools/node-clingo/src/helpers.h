/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
#ifndef NODE_CLINGO_HELPERS_H
#define NODE_CLINGO_HELPERS_H

#include <clingo.h>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>
#include <chrono>

namespace node_clingo
{

    /**
     * Enum for resource name parts.
     */
    enum class ResourcePart
    {
        PREFIX = 0,     // Module prefix (e.g., "base")
        TYPE = 1,       // Resource type (e.g., "fieldTypes") 
        IDENTIFIER = 2  // Resource identifier (e.g., "owner")
    };

    /**
     * Get the string representation of a clingo symbol.
     * @param symbol The clingo symbol.
     * @returns The string representation of the symbol.
     */
    std::string get_symbol_string(clingo_symbol_t symbol);

    /**
     * Escapes HTML special characters in a string.
     * Used for the @wrap function implementation.
     * @param input The input string.
     * @returns The HTML-escaped string.
     */
    std::string html_escape(const std::string &input);

    /**
     * Wraps text to a specified line width, similar to Python's textwrap.
     * @param text The text to wrap.
     * @param line_width The maximum width of each line.
     * @returns A vector of strings, each representing a line of the wrapped text.
     */
    std::vector<std::string> text_wrap(const std::string &text, size_t line_width);

    /**
     * Parses an ISO 8601 date string into a time_point. Returns epoch on failure.
     * @param iso_date The date string in ISO 8601 format (YYYY-MM-DD).
     * @returns The time_point value representing the date, or epoch on error.
     */
    std::chrono::system_clock::time_point parse_iso_date(const std::string &iso_date);

    /**
     * Helper function to return a string symbol via callback.
     * @param str The string to return.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool return_string(
        const char *str,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);


    /**
     * Helper function to return an empty string symbol via callback.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool return_empty_string(
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Helper function to validate and extract part of resource name format.
     * @param arguments Array of clingo symbols representing the arguments.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @param part Resource part to extract (PREFIX, TYPE, or IDENTIFIER)
     * @returns True on success, false on error. Calls symbol_callback with result.
     */
    bool extract_resource_part(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data,
        ResourcePart part);

}

#endif // NODE_CLINGO_HELPERS_H