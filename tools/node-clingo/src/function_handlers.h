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

namespace node_clingo
{

    using FunctionHandler = std::function<bool(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data)>;

    /**
     * Handler for the @concatenate function.
     * Concatenates string arguments.
     * @param arguments Array of clingo symbols representing the arguments.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_concatenate(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @days_since function.
     * Calculates the number of days between two dates.
     * @param arguments Array of clingo symbols representing the date arguments.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_days_since(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @today function.
     * Returns the current date.
     * @param arguments Array of clingo symbols (expected to be empty).
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_today(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @wrap function.
     * Wraps a value within a specified range. Also escapes the result.
     * @param arguments Array of clingo symbols representing the value, min, and max.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_wrap(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @resourcePrefix function.
     * Extracts the module prefix from a resource name (part before first slash).
     * @param arguments Array of clingo symbols representing the resource name.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_resource_prefix(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @resourceType function.
     * Extracts the resource type from a resource name (part between first and second slash).
     * @param arguments Array of clingo symbols representing the resource name.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_resource_type(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Handler for the @resourceIdentifier function.
     * Extracts the resource identifier from a resource name (part after last slash).
     * @param arguments Array of clingo symbols representing the resource name.
     * @param arguments_size Number of arguments.
     * @param symbol_callback Callback function to return the result symbol.
     * @param symbol_callback_data User data for the callback.
     * @returns True on success, false on error.
     */
    bool handle_resource_identifier(
        clingo_symbol_t const *arguments,
        size_t arguments_size,
        clingo_symbol_callback_t symbol_callback,
        void *symbol_callback_data);

    /**
     * Get the map of function names to their handlers.
     * @returns A constant reference to the unordered map containing function handlers.
     */
    const std::unordered_map<std::string, FunctionHandler> &get_function_handlers();

}

#endif // NODE_CLINGO_FUNCTION_HANDLERS_H