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
#ifndef NODE_CLINGO_HELPERS_H
#define NODE_CLINGO_HELPERS_H

#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

#include <clingo.hh>

#include "xxhash.h"

#ifdef ENABLE_CPP_LOGS
#include <iostream>
#define LOG(msg) std::cout << "[C++] " << msg << std::endl
#else
#define LOG(msg)                                                                                                       \
    do                                                                                                                 \
    {                                                                                                                  \
    } while (0)
#endif
/**
 * Thread-safe, cross-platform localtime.
 * Uses localtime_s on Windows, localtime_r on POSIX.
 */
inline std::tm localtime_safe(const std::time_t* time)
{
    std::tm result{};
#ifdef _WIN32
    localtime_s(&result, time);
#else
    localtime_r(time, &result);
#endif
    return result;
}

namespace node_clingo
{

    using Hash = XXH64_hash_t;

    /**
     * Enum for resource name parts.
     */
    enum class ResourcePart
    {
        PREFIX = 0,    // Module prefix (e.g., "base")
        TYPE = 1,      // Resource type (e.g., "fieldTypes")
        IDENTIFIER = 2 // Resource identifier (e.g., "owner")
    };

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
     * @returns A vector of strings, each representing a line of the wrapped
     * text.
     */
    std::vector<std::string> text_wrap(const std::string& text, size_t line_width);

    /**
     * Parses an ISO 8601 date string into a time_point. Returns epoch on
     * failure.
     * @param iso_date The date string in ISO 8601 format (YYYY-MM-DD).
     * @returns The time_point value representing the date, or epoch on error.
     */
    std::chrono::system_clock::time_point parse_iso_date(const std::string& iso_date);

    /**
     * Helper function to return a string symbol via callback.
     * @param str The string to return.
     * @param cb Callback function to return the result symbol.
     */
    void return_string(const char* str, Clingo::SymbolSpanCallback cb);

    /**
     * Helper function to return an empty string symbol via callback.
     * @param cb Callback function to return the result symbol.
     */
    void return_empty_string(Clingo::SymbolSpanCallback cb);

    /**
     * Helper function to validate and extract part of resource name format.
     * @param args Span of clingo symbols representing the arguments.
     * @param cb Callback function to return the result symbol.
     * @param part Resource part to extract (PREFIX, TYPE, or IDENTIFIER)
     */
    void extract_resource_part(
        Clingo::SymbolSpan args,
        Clingo::SymbolSpanCallback cb,
        ResourcePart part);

    /**
     * Returns current epoch milliseconds.
     */
    int64_t current_epoch_ms();

    /**
     * Returns epoch milliseconds for the next local midnight.
     */
    int64_t next_local_midnight_epoch_ms();

} // namespace node_clingo

#endif // NODE_CLINGO_HELPERS_H
