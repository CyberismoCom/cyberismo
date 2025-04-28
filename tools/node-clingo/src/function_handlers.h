/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
#ifndef NODE_CLINGO_FUNCTION_HANDLERS_H
#define NODE_CLINGO_FUNCTION_HANDLERS_H

#include <clingo.h>
#include <functional>
#include <string>
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