/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
#include "function_handlers.h"
#include "helpers.h"

#include <chrono>
#include <cstring>
#include <sstream>

#if defined(__clang__) || __GNUC__ < 13
#define USE_FORMAT_FALLBACK 1
#else
#define USE_FORMAT_FALLBACK 0
#endif

#if USE_FORMAT_FALLBACK
#include <ctime>
#include <time.h>
#include <iomanip>
#else
#include <format>
#endif

namespace node_clingo
{

    bool handle_concatenate(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        std::string result;

        for (size_t i = 0; i < arguments_size; ++i)
        {
            clingo_symbol_type_t type = clingo_symbol_type(arguments[i]);

            if (type == clingo_symbol_type_string)
            {
                const char *str;
                if (!clingo_symbol_string(arguments[i], &str))
                {
                    return false;
                }
                result += str;
            }
            else if (type == clingo_symbol_type_number)
            {
                int number;
                if (!clingo_symbol_number(arguments[i], &number))
                {
                    return false;
                }
                result += std::to_string(number);
            }
            else if (type == clingo_symbol_type_function)
            {
                result += get_symbol_string(arguments[i]);
            }
        }

        return return_string(result.c_str(), symbol_callback, symbol_callback_data);
    }

    bool handle_days_since(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        if (arguments_size != 1)
        {
            return false;
        }

        // get type
        clingo_symbol_type_t type = clingo_symbol_type(arguments[0]);
        if (type != clingo_symbol_type_string)
        {
            clingo_symbol_t sym;
            clingo_symbol_create_number(0, &sym);
            return symbol_callback(&sym, 1, symbol_callback_data);
        }

        const char *date_str;
        if (!clingo_symbol_string(arguments[0], &date_str))
        {
            return false;
        }

        std::chrono::system_clock::time_point date_point = parse_iso_date(date_str);

        // Check if parsing failed (returned epoch)
        if (date_point == std::chrono::system_clock::time_point{})
        {
            // Return 0 on failure
            clingo_symbol_t sym;
            clingo_symbol_create_number(0, &sym);
            return symbol_callback(&sym, 1, symbol_callback_data);
        }

        auto now_point = std::chrono::system_clock::now();

        // Calculate difference and cast to days
        auto duration = now_point - date_point;

        int days = std::chrono::duration_cast<std::chrono::duration<int, std::ratio<86400>>>(duration).count();

        clingo_symbol_t sym;
        clingo_symbol_create_number(days, &sym);

        return symbol_callback(&sym, 1, symbol_callback_data);
    }

    bool handle_today(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        if (arguments_size != 0)
        {
            return false;
        }

// clang used on mac does not support
// current_zone and zoned_time
#if USE_FORMAT_FALLBACK
        time_t now = time(nullptr);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&now), "%Y-%m-%d");
        const auto today_str = ss.str();
#else
        const auto now_point = std::chrono::system_clock::now();
        const auto current_zone = std::chrono::current_zone();
        const std::chrono::zoned_time zt{current_zone, now_point};
        const auto today_str = std::format("{:%Y-%m-%d}", zt);
#endif

        return return_string(today_str.c_str(), symbol_callback, symbol_callback_data);
    }

    bool handle_wrap(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        if (arguments_size != 1)
        {
            return false;
        }

        clingo_symbol_type_t arg_type = clingo_symbol_type(arguments[0]);
        std::string text_to_wrap;

        if (arg_type == clingo_symbol_type_string || arg_type == clingo_symbol_type_function)
        {
            const char *text;
            if (!clingo_symbol_string(arguments[0], &text))
            {
                return false;
            }
            text_to_wrap = text;
        }
        else if (arg_type == clingo_symbol_type_number)
        {
            // skip
        }
        else
        {
            // Unsupported type
            return false;
        }

        // Wrap text with line width of 27 (as specified in the original implementation)
        std::vector<std::string> lines = text_wrap(text_to_wrap, 27);

        // Create result with HTML escaping and <br/> tags
        std::string result;

        result.reserve(lines.size() * (27 + 5));

        for (size_t i = 0; i < lines.size(); ++i)
        {
            result += html_escape(lines[i]);
            if (i < lines.size() - 1)
            {
                result += "<br/>";
            }
        }

        return return_string(result.c_str(), symbol_callback, symbol_callback_data);
    }

    bool handle_resource_prefix(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        return extract_resource_part(arguments, arguments_size, symbol_callback, symbol_callback_data, ResourcePart::PREFIX);
    }

    bool handle_resource_type(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        return extract_resource_part(arguments, arguments_size, symbol_callback, symbol_callback_data, ResourcePart::TYPE);
    }

    bool handle_resource_identifier(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)
    {
        return extract_resource_part(arguments, arguments_size, symbol_callback, symbol_callback_data, ResourcePart::IDENTIFIER);
    }

    const std::unordered_map<std::string, FunctionHandler> &get_function_handlers()
    {
        static const std::unordered_map<std::string, FunctionHandler> handlers = {
            {"concatenate", handle_concatenate},
            {"daysSince", handle_days_since},
            {"today", handle_today},
            {"wrap", handle_wrap},
            {"resourcePrefix", handle_resource_prefix},
            {"resourceType", handle_resource_type},
            {"resourceIdentifier", handle_resource_identifier}};
        return handlers;
    }

} // namespace node_clingo