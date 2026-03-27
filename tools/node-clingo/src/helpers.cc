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

    std::string html_escape(const std::string& input)
    {
        std::string result;
        result.reserve(input.size());

        static const std::string amp = "&amp;";
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
        std::istringstream wordStream(text);
        std::vector<std::string> words;
        words.reserve(text.size() / 3);
        std::string word;
        while (wordStream >> word)
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
        std::istringstream dateStream(iso_date);

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

        for (const auto& dateFormat : date_formats)
        {
            // Reset the stringstream state for each attempt
            dateStream.clear();
            dateStream.str(iso_date);

#if USE_CHRONO_FROM_STREAM_FALLBACK
            // Fallback: std::get_time + timegm
            std::tm timeComponents{};
            dateStream >> std::get_time(&timeComponents, dateFormat.c_str());

            if (!dateStream.fail())
            {
                // If parsing succeeded, convert to time_point
                // Note: timegm interprets struct tm as UTC
                std::time_t unixTimestamp = timegm(&timeComponents);
                if (unixTimestamp != (std::time_t)-1)
                { // timegm returns -1 on error
                    return std::chrono::system_clock::from_time_t(unixTimestamp);
                }
            }
#else
            std::chrono::system_clock::time_point date_point;
            if (std::chrono::from_stream(dateStream, dateFormat.c_str(), date_point))
            {
                // Successfully parsed
                return date_point;
            }
#endif
        }

        // Return epoch time_point on parsing failure for all formats
        return std::chrono::system_clock::time_point{};
    }

    std::string extract_resource_part(const std::string& resource, ResourcePart part)
    {
        if (resource.empty())
        {
            return "";
        }

        size_t first_slash = resource.find('/');
        if (first_slash == std::string::npos)
        {
            return "";
        }

        size_t second_slash = resource.find('/', first_slash + 1);
        if (second_slash == std::string::npos)
        {
            return "";
        }

        size_t third_slash = resource.find('/', second_slash + 1);
        if (third_slash != std::string::npos)
        {
            return "";
        }

        switch (part)
        {
            case ResourcePart::PREFIX:
                return resource.substr(0, first_slash);
            case ResourcePart::TYPE:
                return resource.substr(first_slash + 1, second_slash - first_slash - 1);
            case ResourcePart::IDENTIFIER:
                return resource.substr(second_slash + 1);
        }

        return "";
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
