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
#include <clingo.h>
#include <ctime>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <napi.h>
#include <sstream>
#include <stdint.h>
#include <string>
#include <unordered_map>
#include <vector>

// Store base programs in a map, keyed by name
std::unordered_map<std::string, std::string> g_basePrograms;

/**
 * A logger function for Clingo that does nothing.
 * Used to silence Clingo's output (warnings, info messages).
 * @param code The warning code.
 * @param message The warning message.
 * @param data User data (unused).
 */
void silent_logger(clingo_warning_t code, char const *message, void *data)
{
    // Do nothing - this silences all Clingo output
}

/**
 * Helper function to check for and handle Clingo errors.
 * If a Clingo error has occurred (clingo_error_code() != 0),
 * it throws a Napi::Error with the Clingo error message.
 * @param env The N-API environment.
 */
void handle_clingo_error(const Napi::Env &env)
{
    // If clingo returns an error, we throw an error to the javascript side
    if (clingo_error_code() != 0)
    {
        throw Napi::Error::New(env, clingo_error_message());
    }
}

/**
 * Callback function provided to clingo_control_ground.
 * This function is called by Clingo for each external function encountered during grounding.
 * It looks up the function name in the registered handlers and executes the corresponding handler.
 * @param location Location information (unused).
 * @param name The name of the external function (e.g., "concatenate").
 * @param arguments Array of clingo symbols representing the function arguments.
 * @param arguments_size Number of arguments.
 * @param data User data (unused).
 * @param symbol_callback Callback function to return result symbols to Clingo.
 * @param symbol_callback_data User data for the symbol_callback.
 * @returns True on success, false on error (propagated from the handler).
 */
bool ground_callback(clingo_location_t const *location,
                     char const *name,
                     clingo_symbol_t const *arguments,
                     size_t arguments_size,
                     void *data, clingo_symbol_callback_t symbol_callback,
                     void *symbol_callback_data)
{

    // Find the handler for the function and call it
    const auto &handlers = node_clingo::get_function_handlers();

    auto it = handlers.find(name);
    if (it != handlers.end())
    {
        return it->second(arguments, arguments_size, symbol_callback, symbol_callback_data);
    }

    // If function name not matched, we simply do not handle it
    return true;
}

/**
 * Callback function provided to clingo_control_solve (via solve_event_callback).
 * This function is called by Clingo for each model (answer set) found.
 * It extracts the symbols from the model, converts them to strings, and stores them.
 * @param model The clingo model object.
 * @param data User data pointer (cast to std::vector<std::string>* to store answers).
 * @param go_on Output parameter; set to true to continue solving, false to stop.
 * @returns True on success, false on error (e.g., allocation failure).
 */
bool on_model(clingo_model_t const *model, void *data, bool *go_on)
{
    if (!model || !data || !go_on)
    {
        return false;
    }

    std::vector<std::string> *answers = static_cast<std::vector<std::string> *>(data);

    clingo_symbol_t *atoms = nullptr;
    size_t atoms_size;

    // Get the size of the model
    if (!clingo_model_symbols_size(model, clingo_show_type_shown, &atoms_size))
    {
        return false;
    }

    if (atoms_size == 0)
    {
        answers->push_back("");
        *go_on = true;
        return true;
    }

    // Allocate space for the atoms
    try
    {
        atoms = new clingo_symbol_t[atoms_size];
    }
    catch (const std::bad_alloc &)
    {
        return false;
    }

    // Get the model symbols
    if (!clingo_model_symbols(model, clingo_show_type_shown, atoms, atoms_size))
    {
        delete[] atoms;
        return false;
    }

    std::stringstream ss;
    bool success = true;

    // Convert each symbol to string
    for (size_t i = 0; i < atoms_size && success; ++i)
    {
        // Get the string representation
        std::string str = node_clingo::get_symbol_string(atoms[i]);

        // If the string is empty, we skip it
        if (str.empty())
        {
            continue;
        }

        if (i > 0)
            ss << std::endl;
        ss << str;
    }

    try
    {
        answers->push_back(ss.str());
    }
    catch (const std::bad_alloc &)
    {
        success = false;
    }

    delete[] atoms;
    *go_on = success;
    return success;
}

/**
 * Wrapper callback for clingo_control_solve.
 * This function receives different types of solve events from Clingo.
 * If the event type is a model (clingo_solve_event_type_model), it calls the on_model handler.
 * @param type The type of the solve event.
 * @param event Pointer to the event data (e.g., clingo_model_t* for models).
 * @param data User data pointer (passed through to on_model).
 * @param go_on Output parameter (passed through to on_model).
 * @returns True on success or if the event is not a model, false on error from on_model.
 */
bool solve_event_callback(uint32_t type, void *event, void *data, bool *go_on)
{
    if (!event || !data || !go_on)
    {
        return false;
    }

    if (type == clingo_solve_event_type_model)
    {
        return on_model(static_cast<const clingo_model_t *>(event), data, go_on);
    }
    return true;
}

/**
 * N-API function exposed to JavaScript as `setBaseProgram`.
 * Stores or updates a named base logic program string.
 * @param info N-API callback info containing arguments (program string, key string).
 * @returns Napi::Boolean(true) on success.
 * @throws Napi::TypeError if arguments are invalid.
 * @throws Napi::Error on other errors.
 */
Napi::Value SetBaseProgram(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        // Check arguments
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
        {
            throw Napi::TypeError::New(env, "Expected arguments: program (string), key (string)");
        }

        std::string program = info[0].As<Napi::String>().Utf8Value();
        std::string key = info[1].As<Napi::String>().Utf8Value();

        // Update the named base program
        g_basePrograms[key] = program;

        return Napi::Boolean::New(env, true);
    }
    catch (const Napi::Error &e)
    {
        // Let Napi errors propagate as they are
        throw e;
    }
    catch (const std::exception &e)
    {
        throw Napi::Error::New(env, e.what());
    }
    catch (...)
    {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

/**
 * N-API function exposed to JavaScript as `clearBaseProgram`.
 * Removes a specific named base program.
 * @param info N-API callback info containing arguments (key string).
 * @returns Napi::Boolean(true) on success.
 * @throws Napi::TypeError if the argument is invalid.
 * @throws Napi::Error on other errors.
 */
Napi::Value ClearBaseProgram(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        // Check arguments
        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "Expected argument: key (string)");
        }

        std::string key = info[0].As<Napi::String>().Utf8Value();
        g_basePrograms.erase(key);

        return Napi::Boolean::New(env, true);
    }
    catch (const Napi::Error &e)
    {
        throw e;
    }
    catch (const std::exception &e)
    {
        throw Napi::Error::New(env, e.what());
    }
    catch (...)
    {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

/**
 * N-API function exposed to JavaScript as `clearAllBasePrograms`.
 * Removes all stored base programs.
 * @param info N-API callback info (no arguments expected).
 * @returns Napi::Boolean(true) on success.
 * @throws Napi::Error on errors.
 */
Napi::Value ClearAllBasePrograms(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {
        g_basePrograms.clear();
        return Napi::Boolean::New(env, true);
    }
    catch (const Napi::Error &e)
    {
        throw e;
    }
    catch (const std::exception &e)
    {
        throw Napi::Error::New(env, e.what());
    }
    catch (...)
    {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

/**
 * N-API function exposed to JavaScript as `solve`.
 * Solves a given logic program, optionally combining it with stored base programs.
 * Handles grounding with external functions and collects answer sets.
 * @param info N-API callback info containing arguments (program string, optional base program key(s) string or array).
 * @returns A Napi::Object containing:
 *   - `answers`: A Napi::Array of strings, each representing an answer set.
 *   - `executionTime`: A Napi::Number representing the solve time in microseconds.
 * @throws Napi::TypeError if arguments are invalid.
 * @throws Napi::Error on Clingo errors or other exceptions.
 */
Napi::Value Solve(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    try
    {

        // Check arguments
        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "String argument expected for program");
        }

        auto start = std::chrono::high_resolution_clock::now();

        // Create the program string once
        std::string program = info[0].As<Napi::String>().Utf8Value();

        // Apply base programs if specified
        if (info.Length() >= 2)
        {
            if (info[1].IsString())
            {
                // If a single base program name is provided
                std::string key = info[1].As<Napi::String>().Utf8Value();
                auto it = g_basePrograms.find(key);
                if (it != g_basePrograms.end())
                {
                    program = it->second + "\n" + program;
                }
            }
            else if (info[1].IsArray())
            {
                // If an array of base program names is provided
                Napi::Array basePrograms = info[1].As<Napi::Array>();
                std::string combinedBase = "";
                for (uint32_t i = 0; i < basePrograms.Length(); ++i)
                {
                    Napi::Value val = basePrograms[i];
                    if (val.IsString())
                    {
                        std::string key = val.As<Napi::String>().Utf8Value();
                        auto it = g_basePrograms.find(key);
                        if (it != g_basePrograms.end())
                        {
                            if (!combinedBase.empty())
                                combinedBase += "\n";
                            combinedBase += it->second;
                        }
                    }
                }
                if (!combinedBase.empty())
                {
                    program = combinedBase + "\n" + program;
                }
            }
        }

        // Create control object with silent logger
        clingo_control_t *ctl = nullptr;
        if (!clingo_control_new(nullptr, 0, silent_logger, nullptr, 20, &ctl))
        {
            handle_clingo_error(env);
        }

        std::unique_ptr<clingo_control_t, void (*)(clingo_control_t *)> ctl_guard(ctl, clingo_control_free);

        // Add the program
        if (!clingo_control_add(ctl, "base", nullptr, 0, program.c_str()))
        {
            handle_clingo_error(env);
        }

        // Ground the program
        clingo_part_t parts[] = {{"base", nullptr, 0}};

        if (!clingo_control_ground(ctl, parts, 1, ground_callback, nullptr))
        {
            handle_clingo_error(env);
        }

        // Solve the program
        std::vector<std::string> answers;
        clingo_solve_handle_t *handle = nullptr;

        // Use clingo_solve_mode_yield to get all answer sets
        if (!clingo_control_solve(ctl, clingo_solve_mode_yield, nullptr, 0, solve_event_callback, &answers, &handle))
        {
            handle_clingo_error(env);
        }

        std::unique_ptr<clingo_solve_handle_t, void (*)(clingo_solve_handle_t *)> handle_guard(
            handle,
            [](clingo_solve_handle_t *h)
            {
                if (h)
                {
                    clingo_solve_handle_close(h);
                }
            });

        // Wait for solving to finish
        clingo_solve_result_bitset_t result;
        if (!clingo_solve_handle_get(handle, &result))
        {
            handle_clingo_error(env);
        }

        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

        // Create result object with answers and execution time
        Napi::Object resultObj = Napi::Object::New(env);

        Napi::Array answersArray = Napi::Array::New(env, answers.size());
        for (size_t i = 0; i < answers.size(); ++i)
        {
            answersArray[i] = Napi::String::New(env, answers[i]);
        }
        resultObj.Set("answers", answersArray);
        resultObj.Set("executionTime", Napi::Number::New(env, duration.count()));

        return resultObj;
    }
    catch (const Napi::Error &e)
    {
        // Let Napi errors propagate as they are
        throw e;
    }
    catch (const std::exception &e)
    {
        throw Napi::Error::New(env, e.what());
    }
    catch (...)
    {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

/**
 * N-API module initialization function.
 * Exports the `solve`, `setBaseProgram`, `clearBaseProgram`, and `clearAllBasePrograms` functions to JavaScript.
 * @param env The N-API environment.
 * @param exports The N-API exports object.
 * @returns The populated exports object.
 */
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(
        Napi::String::New(env, "solve"),
        Napi::Function::New(env, Solve));

    exports.Set(
        Napi::String::New(env, "setBaseProgram"),
        Napi::Function::New(env, SetBaseProgram));

    exports.Set(
        Napi::String::New(env, "clearBaseProgram"),
        Napi::Function::New(env, ClearBaseProgram));

    exports.Set(
        Napi::String::New(env, "clearAllBasePrograms"),
        Napi::Function::New(env, ClearAllBasePrograms));

    return exports;
}

NODE_API_MODULE(node_clingo, Init)