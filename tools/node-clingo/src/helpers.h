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
#include <format>

namespace node_clingo {

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
std::string html_escape(const std::string& input);

/**
 * Wraps text to a specified line width, similar to Python's textwrap.
 * @param text The text to wrap.
 * @param line_width The maximum width of each line.
 * @returns A vector of strings, each representing a line of the wrapped text.
 */
std::vector<std::string> text_wrap(const std::string& text, size_t line_width);

/**
 * Parses an ISO 8601 date string into a time_point. Returns epoch on failure.
 * @param iso_date The date string in ISO 8601 format (YYYY-MM-DD).
 * @returns The time_point value representing the date, or epoch on error.
 */
std::chrono::utc_clock::time_point parse_iso_date(const std::string& iso_date);

}

#endif // NODE_CLINGO_HELPERS_H 