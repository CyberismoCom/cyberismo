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
#include "helpers.h"

#include <chrono>
#include <sstream>
#include <string>
#include <vector>

// Use fallback if GCC version is defined and less than 14
// Let's delete this once GCC 14 is default
#if defined(__GNUC__) && (__GNUC__ < 14)
#define USE_CHRONO_FROM_STREAM_FALLBACK 1
#else
#define USE_CHRONO_FROM_STREAM_FALLBACK 0
#endif

#if USE_CHRONO_FROM_STREAM_FALLBACK
#include <ctime>
#include <iomanip>
#endif

namespace node_clingo
{

    std::string get_symbol_string(clingo_symbol_t symbol)
    {
        char* string = nullptr;
        size_t n;
        // determine size of the string representation of the next symbol in the model
        if (!clingo_symbol_to_string_size(symbol, &n))
        {
            return "";
        }

        // allocate memory for the symbol's string
        string = (char*)malloc(n);
        if (!string)
        {
            return "";
        }

        // retrieve the symbol's string
        if (!clingo_symbol_to_string(symbol, string, n))
        {
            free(string);
            return "";
        }
        std::string result(string);
        free(string);
        return result;
    }

    std::string html_escape(const std::string& input)
    {
        std::string result;
        result.reserve(input.size());

        static const std::string amp = "&amp;";
        static const std::string quot = "&quot;";
        static const std::string apos = "&apos;";
        static const std::string lt = "&lt;";
        static const std::string gt = "&gt;";

        for (char c : input)
        {
            switch (c)
            {
                case '&':
                    result += amp;
                    break;
                case '<':
                    result += lt;
                    break;
                case '>':
                    result += gt;
                    break;
                default:
                    result += c;
                    break;
            }
        }

        return result;
    }

    std::vector<std::string> text_wrap(const std::string& text, size_t line_width)
    {
        std::vector<std::string> result;
        std::string line;
        line.reserve(line_width);

        // Split input text into words
        std::istringstream iss(text);
        std::vector<std::string> words;
        words.reserve(text.size() / 3);
        std::string word;
        while (iss >> word)
        {
            words.push_back(word);
        }

        if (words.empty())
        {
            return result;
        }

        line = words[0];
        for (size_t i = 1; i < words.size(); ++i)
        {
            if (line.length() + 1 + words[i].length() <= line_width)
            {
                // Word fits on current line with a space
                line.push_back(' ');
                line.append(words[i]);
            }
            else
            {
                // Word doesn't fit, add current line to result and start a new line
                result.push_back(line);
                line = words[i];
            }
        }

        // Don't forget the last line
        if (!line.empty())
        {
            result.push_back(line);
        }

        return result;
    }

    std::chrono::system_clock::time_point parse_iso_date(const std::string& iso_date)
    {
        std::istringstream ss(iso_date);

        // List of ISO date formats to try, notice that fallback does not support extended offset for now
#if USE_CHRONO_FROM_STREAM_FALLBACK
        const std::vector<std::string> date_formats = {
            "%Y-%m-%dT%TZ", // e.g., 2023-10-26T12:00:00Z (Explicit UTC)
            "%Y-%m-%dT%T",  // e.g., 2023-10-26T12:00:00 (Assumed UTC if no TZ info)
            "%Y-%m-%d"      // e.g., 2023-10-26 (Assumed 00:00:00 UTC)
        };
#else
        const std::vector<std::string> date_formats = {
            "%FT%T%Ez", // e.g., 2023-10-26T12:00:00-05:00 (ISO 8601 with extended offset)
            "%FT%TZ",   // e.g., 2023-10-26T12:00:00Z (Explicit UTC)
            "%FT%T",    // e.g., 2023-10-26T12:00:00 (Assumed UTC if no TZ info)
            "%F"        // e.g., 2023-10-26 (Assumed 00:00:00 UTC)
        };
#endif

        for (const auto& fmt : date_formats)
        {
            // Reset the stringstream state for each attempt
            ss.clear();
            ss.str(iso_date);

#if USE_CHRONO_FROM_STREAM_FALLBACK
            // Fallback: std::get_time + timegm
            std::tm t{};
            ss >> std::get_time(&t, fmt.c_str());

            if (!ss.fail())
            {
                // If parsing succeeded, convert to time_point
                // Note: timegm interprets struct tm as UTC
                std::time_t tt = timegm(&t);
                if (tt != (std::time_t)-1)
                { // timegm returns -1 on error
                    return std::chrono::system_clock::from_time_t(tt);
                }
            }
#else
            std::chrono::system_clock::time_point date_point;
            if (std::chrono::from_stream(ss, fmt.c_str(), date_point))
            {
                // Successfully parsed
                return date_point;
            }
#endif
        }

        // Return epoch time_point on parsing failure for all formats
        return std::chrono::system_clock::time_point{};
    }

    bool return_string(const char* str, clingo_symbol_callback_t symbol_callback, void* symbol_callback_data)
    {
        clingo_symbol_t sym;
        if (!clingo_symbol_create_string(str, &sym))
        {
            return false;
        }
        return symbol_callback(&sym, 1, symbol_callback_data);
    }

    bool return_empty_string(clingo_symbol_callback_t symbol_callback, void* symbol_callback_data)
    {
        return return_string("", symbol_callback, symbol_callback_data);
    }

    bool extract_resource_part(
        clingo_symbol_t const* arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void* symbol_callback_data,
        ResourcePart part)
    {
        if (arguments_size != 1)
        {
            return false;
        }

        clingo_symbol_type_t type = clingo_symbol_type(arguments[0]);
        if (type != clingo_symbol_type_string)
        {
            // Return empty string for non-string input
            return return_empty_string(symbol_callback, symbol_callback_data);
        }

        const char* resource_name;
        if (!clingo_symbol_string(arguments[0], &resource_name))
        {
            return false;
        }

        std::string resource_str(resource_name);

        if (resource_str.empty())
        {
            return return_empty_string(symbol_callback, symbol_callback_data);
        }

        size_t first_slash = resource_str.find('/');
        if (first_slash == std::string::npos)
        {
            // No slashes - invalid format
            return return_empty_string(symbol_callback, symbol_callback_data);
        }

        size_t second_slash = resource_str.find('/', first_slash + 1);
        if (second_slash == std::string::npos)
        {
            // Only 1 slash - invalid format
            return return_empty_string(symbol_callback, symbol_callback_data);
        }

        size_t third_slash = resource_str.find('/', second_slash + 1);
        if (third_slash != std::string::npos)
        {
            // More than 2 slashes - invalid format
            return return_empty_string(symbol_callback, symbol_callback_data);
        }

        // Extract the requested part
        std::string result;
        switch (part)
        {
            case ResourcePart::PREFIX:
                result = resource_str.substr(0, first_slash);
                break;
            case ResourcePart::TYPE:
                result = resource_str.substr(first_slash + 1, second_slash - first_slash - 1);
                break;
            case ResourcePart::IDENTIFIER:
                result = resource_str.substr(second_slash + 1);
                break;
        }

        return return_string(result.c_str(), symbol_callback, symbol_callback_data);
    }

    int64_t current_epoch_ms()
    {
        auto now = std::chrono::system_clock::now().time_since_epoch();
        return std::chrono::duration_cast<std::chrono::milliseconds>(now).count();
    }

    int64_t next_local_midnight_epoch_ms()
    {
        time_t now = time(nullptr);
        std::tm local_tm = *std::localtime(&now);
        local_tm.tm_isdst = -1; // let the system determine DST
        local_tm.tm_hour = 0;
        local_tm.tm_min = 0;
        local_tm.tm_sec = 0;
        local_tm.tm_mday += 1;
        time_t next_midnight = mktime(&local_tm);
        return static_cast<int64_t>(next_midnight) * 1000LL;
    }

} // namespace node_clingo
