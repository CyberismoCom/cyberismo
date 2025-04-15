#ifndef NODE_CLINGO_FUNCTION_HANDLERS_H
#define NODE_CLINGO_FUNCTION_HANDLERS_H

#include <clingo.h>
#include <string>
#include <functional>
#include <unordered_map>

namespace node_clingo {

using FunctionHandler = std::function<bool(
    clingo_symbol_t const* arguments,
    size_t arguments_size,
    clingo_symbol_callback_t symbol_callback,
    void* symbol_callback_data)>;

bool handle_concatenate(
    clingo_symbol_t const* arguments,
    size_t arguments_size,
    clingo_symbol_callback_t symbol_callback,
    void* symbol_callback_data);

bool handle_days_since(
    clingo_symbol_t const* arguments,
    size_t arguments_size,
    clingo_symbol_callback_t symbol_callback,
    void* symbol_callback_data);

bool handle_today(
    clingo_symbol_t const* arguments,
    size_t arguments_size,
    clingo_symbol_callback_t symbol_callback,
    void* symbol_callback_data);

bool handle_wrap(
    clingo_symbol_t const* arguments,
    size_t arguments_size,
    clingo_symbol_callback_t symbol_callback,
    void* symbol_callback_data);

// Get the function handlers map
const std::unordered_map<std::string, FunctionHandler>& get_function_handlers();

}

#endif // NODE_CLINGO_FUNCTION_HANDLERS_H 