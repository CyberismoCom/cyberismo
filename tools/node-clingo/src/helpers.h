#ifndef NODE_CLINGO_HELPERS_H
#define NODE_CLINGO_HELPERS_H

#include <string>
#include <vector>
#include <sstream>
#include <ctime>
#include <iomanip>
#include <clingo.h>
namespace node_clingo {

// Get the string representation of a clingo symbol
std::string get_symbol_string(clingo_symbol_t symbol);

// HTML escape function for wrap implementation
std::string html_escape(const std::string& input);

// Improved text wrap function that matches Python's textwrap behavior
std::vector<std::string> text_wrap(const std::string& text, size_t line_width);

// Parse an ISO 8601 date string to a time_t value
std::time_t parse_iso_date(const std::string& iso_date);

}

#endif // NODE_CLINGO_HELPERS_H 