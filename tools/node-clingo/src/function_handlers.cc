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
#include "function_handlers.h"
#include "helpers.h"

#include <chrono>
#include <cstring>
#include <sstream>

#if !defined(__GNUC__) || (__GNUC__ < 13)
#define USE_FORMAT_FALLBACK 1
#else
#define USE_FORMAT_FALLBACK 0
#endif

#if USE_FORMAT_FALLBACK
#include <ctime>
#include <iomanip>
#include <time.h>
#else
#include <format>
#endif

namespace node_clingo
{

    void handle_concatenate(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback cb)
    {
        std::string result;

        for (size_t i = 0; i < arguments.size(); ++i)
        {
            auto type = arguments[i].type();

            if (type == Clingo::SymbolType::String)
            {
                result += arguments[i].string();
            }
            else if (type == Clingo::SymbolType::Number)
            {
                result += std::to_string(arguments[i].number());
            }
            else if (type == Clingo::SymbolType::Function)
            {
                result += arguments[i].to_string();
            }
        }

        return_string(result.c_str(), cb);
    }

    void handle_days_since(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback cb)
    {
        if (arguments.size() != 1)
        {
            throw std::runtime_error("daysSince expects exactly 1 argument");
        }

        auto type = arguments[0].type();
        if (type != Clingo::SymbolType::String)
        {
            auto sym = Clingo::Number(0);
            cb({&sym, 1});
            return;
        }

        const char* date_str = arguments[0].string();
        std::chrono::system_clock::time_point date_point = parse_iso_date(date_str);

        if (date_point == std::chrono::system_clock::time_point{})
        {
            auto sym = Clingo::Number(0);
            cb({&sym, 1});
            return;
        }

        auto now_point = std::chrono::system_clock::now();
        auto duration = now_point - date_point;
        int days = std::chrono::duration_cast<std::chrono::duration<int, std::ratio<86400>>>(duration).count();

        auto sym = Clingo::Number(days);
        cb({&sym, 1});
    }

    void handle_today(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback cb)
    {
        if (arguments.size() != 0)
        {
            throw std::runtime_error("today expects 0 arguments");
        }

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

        return_string(today_str.c_str(), cb);
    }

    void handle_wrap(Clingo::SymbolSpan arguments, Clingo::SymbolSpanCallback cb)
    {
        if (arguments.size() != 1)
        {
            throw std::runtime_error("wrap expects exactly 1 argument");
        }

        auto arg_type = arguments[0].type();
        std::string text_to_wrap;

        if (arg_type == Clingo::SymbolType::String || arg_type == Clingo::SymbolType::Function)
        {
            text_to_wrap = arguments[0].string();
        }
        else if (arg_type == Clingo::SymbolType::Number)
        {
            // skip
        }
        else
        {
            throw std::runtime_error("wrap: unsupported argument type");
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

        return_string(result.c_str(), cb);
    }

    const std::unordered_map<std::string, FunctionHandler>& get_function_handlers()
    {
        static const std::unordered_map<std::string, FunctionHandler> handlers = {
            {"concatenate", handle_concatenate},
            {"daysSince", handle_days_since},
            {"today", handle_today},
            {"wrap", handle_wrap},
            {"resourcePrefix", [](auto args, auto cb) { extract_resource_part(args, cb, ResourcePart::PREFIX); }},
            {"resourceType", [](auto args, auto cb) { extract_resource_part(args, cb, ResourcePart::TYPE); }},
            {"resourceIdentifier", [](auto args, auto cb) { extract_resource_part(args, cb, ResourcePart::IDENTIFIER); }}};
        return handlers;
    }

} // namespace node_clingo
