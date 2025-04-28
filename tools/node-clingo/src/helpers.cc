/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
#include "helpers.h"

#include <algorithm>
#include <chrono>
#include <iostream>

namespace node_clingo {

std::string get_symbol_string(clingo_symbol_t symbol) {
  char *string = nullptr;
  size_t n;
  // determine size of the string representation of the next symbol in the model
  if (!clingo_symbol_to_string_size(symbol, &n)) { 
    return "";
  }

  // allocate memory for the symbol's string
  string = (char*)malloc(n);
  if (!string) {
    return "";
  }

  // retrieve the symbol's string
  if (!clingo_symbol_to_string(symbol, string, n)) { 
    free(string);
    return "";
  }
  std::string result(string);
  free(string);
  return result;
}

std::string html_escape(const std::string& input) {
    std::string result;
    result.reserve(input.size());
    
    for (char c : input) {
        switch (c) {
            case '&': result += "&amp;"; break;
            case '\"': result += "&quot;"; break;
            case '\'': result += "&apos;"; break;
            case '<': result += "&lt;"; break;
            case '>': result += "&gt;"; break;
            default: result += c; break;
        }
    }
    
    return result;
}

std::vector<std::string> text_wrap(const std::string& text, size_t line_width) {
    std::vector<std::string> result;
    std::string line;
    
    // Split input text into words
    std::istringstream iss(text);
    std::vector<std::string> words;
    std::string word;
    while (iss >> word) {
        words.push_back(word);
    }
    
    if (words.empty()) {
        return result;
    }
    
    line = words[0];
    for (size_t i = 1; i < words.size(); ++i) {
        if (line.length() + 1 + words[i].length() <= line_width) {
            // Word fits on current line with a space
            line += " " + words[i];
        } else {
            // Word doesn't fit, add current line to result and start a new line
            result.push_back(line);
            line = words[i];
        }
    }
    
    // Don't forget the last line
    if (!line.empty()) {
        result.push_back(line);
    }
    
    return result;
}

std::time_t parse_iso_date(const std::string& iso_date) {
    std::tm tm = {};
    std::string format;
    std::string date_copy = iso_date;
    
    // Remove trailing 'Z' if present (UTC indicator)
    if (!date_copy.empty() && date_copy.back() == 'Z') {
        date_copy.pop_back();
    }
    
    // Handle different ISO date formats
    if (date_copy.find('T') != std::string::npos) {
        // Format with time component: YYYY-MM-DDTHH:MM:SS
        if (date_copy.find(':') != std::string::npos) {
            // Has time with colons
            size_t colon_count = std::count(date_copy.begin(), date_copy.end(), ':');
            if (colon_count == 1) {
                format = "%Y-%m-%dT%H:%M";
            } else {
                format = "%Y-%m-%dT%H:%M:%S";
            }
        } else {
            // Has time without colons
            format = "%Y-%m-%dT%H%M%S";
        }
    } else {
        // Simple date format: YYYY-MM-DD
        format = "%Y-%m-%d";
    }
    
    std::istringstream ss(date_copy);
    ss >> std::get_time(&tm, format.c_str());
    
    if (ss.fail()) {
        // Return epoch time on failure
        return 0;
    }
    
    // Set to UTC as per the Python implementation
    tm.tm_isdst = 0;
    
    return std::mktime(&tm);
}

} // namespace node_clingo 