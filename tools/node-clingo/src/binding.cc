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
#include "xxhash.h"

#include <chrono>
#include <clingo.h>
#include <cstring>
#include <ctime>
#include <iostream>
#include <map>
#include <napi.h>
#include <set>
#include <sstream>
#include <stdint.h>
#include <string>
#include <unordered_map>
#include <vector>

// unnamed namespace to avoid polluting the global namespace
namespace
{
    struct ClingoLogMessage
    {
        clingo_warning_t code;
        bool isError;
        std::string message;
    };

    struct NodeClingoLogs
    {
        Napi::Array errors;
        Napi::Array warnings;

        NodeClingoLogs(Napi::Env env)
        {
            errors = Napi::Array::New(env);
            warnings = Napi::Array::New(env);
        }
    };

    struct Stats
    {
        std::chrono::microseconds glue;
        std::chrono::microseconds add;
        std::chrono::microseconds ground;
        std::chrono::microseconds solve;
    };

    struct SolveResult
    {
        std::vector<std::string> answers;
        std::vector<ClingoLogMessage> logs;
        Stats stats;
    };

    struct CacheEntry
    {
        SolveResult result;
    };

    // Program with categories
    struct Program
    {
        std::string content;
        std::vector<std::string> categories;
        XXH64_hash_t hash;
    };

    // stores all programs
    std::unordered_map<std::string, Program> g_programs;

    // stores previous results
    std::unordered_map<XXH64_hash_t, CacheEntry> g_results;

    // For now error messsages are stored in a global vector,
    // If async/threading is needed, we cannot use a single global variable
    std::vector<ClingoLogMessage> g_errorMessages;

    /**
    * A logger function for Clingo that captures messages.
    * Collects warnings and errors from Clingo for later processing.
    * @param code The warning code.
    * @param message The warning message.
    * @param data User data (unused).
    */
    void message_collector(clingo_warning_t code, char const* message, void* data)
    {
        g_errorMessages.push_back({code, code == clingo_warning_runtime_error, message});
    }

    /**
    * Helper function to parse the error messages from Clingo
    * @param env The N-API environment.
    * @return NodeClingoLogs containing separated errors and warnings arrays.
    */
    NodeClingoLogs parse_clingo_logs(const Napi::Env& env, const std::vector<ClingoLogMessage>& logMessages)
    {
        NodeClingoLogs logs(env);

        size_t errorIndex = 0;
        size_t warningIndex = 0;

        for (const auto& msg : logMessages)
        {
            if (msg.isError)
            {
                logs.errors.Set(errorIndex++, Napi::String::New(env, msg.message));
            }
            else
            {
                logs.warnings.Set(warningIndex++, Napi::String::New(env, msg.message));
            }
        }

        return logs;
    }

    Napi::Object create_napi_object_from_solve_result(const Napi::Env& env, const SolveResult& result)
    {
        Napi::Object resultObj = Napi::Object::New(env);
        Napi::Array answersArray = Napi::Array::New(env, result.answers.size());
        for (size_t i = 0; i < result.answers.size(); ++i)
        {
            answersArray[i] = Napi::String::New(env, result.answers[i]);
        }
        resultObj.Set("answers", answersArray);
        Napi::Object statsObj = Napi::Object::New(env);
        statsObj.Set("glue", result.stats.glue.count());
        statsObj.Set("add", result.stats.add.count());
        statsObj.Set("ground", result.stats.ground.count());
        statsObj.Set("solve", result.stats.solve.count());
        resultObj.Set("stats", statsObj);

        NodeClingoLogs logs = parse_clingo_logs(env, result.logs);
        resultObj.Set("errors", logs.errors);
        resultObj.Set("warnings", logs.warnings);

        return resultObj;
    }

    /**
    * Helper function to check for and handle Clingo errors.
    * If a Clingo error has occurred (clingo_error_code() != 0),
    * it throws a Napi::Error with the Clingo error message.
    * @param env The N-API environment.
    * @param programKey The string identifier of the program that caused the error
    */
    void handle_clingo_error(const Napi::Env& env, const std::string& programKey = "")
    {
        // If clingo returns an error, we throw an error to the javascript side
        if (clingo_error_code() != 0)
        {
            Napi::Error error = Napi::Error::New(env, clingo_error_message());

            // Create an object to hold error details
            Napi::Object errorObj = Napi::Object::New(env);

            // Parse errors and warnings using the common routine
            NodeClingoLogs logs = parse_clingo_logs(env, g_errorMessages);

            errorObj.Set("errors", logs.errors);
            errorObj.Set("warnings", logs.warnings);
            if (!programKey.empty())
            {
                errorObj.Set("program", Napi::String::New(env, programKey));
            }

            error.Set("details", errorObj);
            throw error;
        }
    }

    /**
    * Parse refs array argument from N-API info at given index.
    * Throws TypeError if not an array of strings. Returns a set of refs.
    */
    std::set<std::string> parse_refs_or_throw(const Napi::CallbackInfo& info, size_t index = 1)
    {
        Napi::Env env = info.Env();
        if (!info[index].IsArray())
        {
            throw Napi::TypeError::New(env, "Second argument must be an array of strings (refs)");
        }

        std::set<std::string> refs;
        Napi::Array arr = info[index].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); ++i)
        {
            Napi::Value val = arr[i];
            if (!val.IsString())
            {
                throw Napi::TypeError::New(env, "All refs must be strings");
            }
            std::string ref = val.As<Napi::String>().Utf8Value();
            refs.insert(ref);
        }
        return refs;
    }

    /**
    * Expand refs into concrete programs by exact key or matching category.
    * Calls handler once per unique program. If the program came from a category
    * match, category contains the category string; otherwise it is empty.
    */
    template <typename Handler> void expand_refs_to_programs(const std::set<std::string>& refs, Handler handler)
    {

        // if more optimization is needed, could use a reference to the program instead of a copy
        std::map<std::string, std::pair<Program, std::string>> selected;

        for (const auto& ref : refs)
        {
            auto it = g_programs.find(ref);

            // direct match
            if (it != g_programs.end())
            {
                selected.emplace(ref, std::pair<Program, std::string>(it->second, ""));
                continue;
            }

            // category match
            for (const auto& entry : g_programs)
            {
                const std::string& key = entry.first;
                const Program& program = entry.second;
                if (std::find(program.categories.begin(), program.categories.end(), ref) != program.categories.end())
                {
                    selected.emplace(key, std::pair<Program, std::string>(program, ref));
                }
            }
        }

        for (const auto& [key, programAndCategory] : selected)
        {
            handler(key, programAndCategory.first, programAndCategory.second);
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
    bool ground_callback(
        clingo_location_t const* location,
        char const* name,
        clingo_symbol_t const* arguments,
        size_t arguments_size,
        void* data,
        clingo_symbol_callback_t symbol_callback,
        void* symbol_callback_data)
    {

        // Find the handler for the function and call it
        const auto& handlers = node_clingo::get_function_handlers();

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
    bool on_model(clingo_model_t const* model, void* data, bool* go_on)
    {
        if (!model || !data || !go_on)
        {
            return false;
        }

        std::vector<std::string>* answers = static_cast<std::vector<std::string>*>(data);

        clingo_symbol_t* atoms = nullptr;
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
        catch (const std::bad_alloc&)
        {
            return false;
        }

        // Get the model symbols
        if (!clingo_model_symbols(model, clingo_show_type_shown, atoms, atoms_size))
        {
            delete[] atoms;
            return false;
        }

        std::stringstream answerStream;
        bool success = true;

        // Convert each symbol to string
        for (size_t i = 0; i < atoms_size && success; ++i)
        {
            // Get the string representation
            std::string symbolString = node_clingo::get_symbol_string(atoms[i]);

            // If the string is empty, we skip it
            if (symbolString.empty())
            {
                continue;
            }

            if (i > 0)
                answerStream << std::endl;
            answerStream << symbolString;
        }

        try
        {
            answers->push_back(answerStream.str());
        }
        catch (const std::bad_alloc&)
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
    bool solve_event_callback(uint32_t type, void* event, void* data, bool* go_on)
    {
        if (!event || !data || !go_on)
        {
            return false;
        }

        if (type == clingo_solve_event_type_model)
        {
            return on_model(static_cast<const clingo_model_t*>(event), data, go_on);
        }
        return true;
    }

} // namespace
/**
 * N-API function exposed to JavaScript as `setProgram`.
 * Stores or updates a program with optional categories.
 * @param info N-API callback info containing arguments (key string, program string, optional categories array).
 * @returns undefined
 * @throws Napi::TypeError if arguments are invalid.
 */
Napi::Value SetProgram(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    // Check arguments
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
    {
        throw Napi::TypeError::New(
            env,
            "Expected arguments: key (string), program "
            "(string), optional categories (string[])");
    }

    std::string key = info[0].As<Napi::String>().Utf8Value();
    std::string content = info[1].As<Napi::String>().Utf8Value();

    // Create program entry
    Program program;
    program.content = content;
    program.hash = XXH3_64bits(content.c_str(), content.size());

    // Add categories if provided
    if (info.Length() >= 3 && info[2].IsArray())
    {
        Napi::Array categories = info[2].As<Napi::Array>();
        for (uint32_t i = 0; i < categories.Length(); ++i)
        {
            Napi::Value val = categories[i];
            if (val.IsString())
            {
                program.categories.push_back(val.As<Napi::String>().Utf8Value());
            }
        }
    }

    // Store the program
    g_programs[key] = std::move(program);
    return env.Undefined();
}

/**
 * N-API function exposed to JavaScript as `removeProgram`.
 * Removes a stored program.
 * @param info N-API callback info containing arguments (key string).
 * @returns Napi::Boolean indicating whether the program was found and removed.
 * @throws Napi::TypeError if the argument is invalid.
 */
Napi::Value RemoveProgram(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    // Check arguments
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "Expected argument: key (string)");
    }

    std::string key = info[0].As<Napi::String>().Utf8Value();
    size_t removedCount = g_programs.erase(key);

    return Napi::Boolean::New(env, removedCount > 0);
}

/**
 * N-API function exposed to JavaScript as `removeProgramsByCategory`.
 * Removes all stored programs that have the specified category.
 * @param info N-API callback info containing arguments (category string).
 * @returns Napi::Number indicating the number of programs removed.
 * @throws Napi::TypeError if the argument is invalid.
 */
Napi::Value RemoveProgramsByCategory(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    // Check arguments
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "Expected argument: category (string)");
    }

    std::string category = info[0].As<Napi::String>().Utf8Value();
    size_t removedCount = 0;

    // Iterate through programs and remove those with the specified category
    auto it = g_programs.begin();
    while (it != g_programs.end())
    {
        const auto& program = it->second;
        if (std::find(program.categories.begin(), program.categories.end(), category) != program.categories.end())
        {
            it = g_programs.erase(it);
            removedCount++;
        }
        else
        {
            ++it;
        }
    }

    return Napi::Number::New(env, removedCount);
}

/**
 * N-API function exposed to JavaScript as `clearAllBasePrograms`.
 * Removes all stored base programs.
 * @param info N-API callback info (no arguments expected).
 * @returns Napi::Boolean(true) on success.
 * @throws Napi::Error on errors.
 */
Napi::Value RemoveAllPrograms(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    g_programs.clear();
    return env.Undefined();
}

/**
 * N-API function exposed to JavaScript as `buildProgram`.
 * Assembles a complete logic program by combining the main program with stored base programs.
 * This function provides the same program assembly logic as `solve` but returns the complete
 * program text instead of executing it.
 * @param info N-API callback info containing arguments (program string, optional base program key(s) string or array).
 * @returns A Napi::String containing the complete assembled logic program.
 * @throws Napi::TypeError if arguments are invalid.
 */
Napi::Value BuildProgram(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    // Check arguments
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "String argument expected for program");
    }

    // Get the main program string
    std::string mainProgram = info[0].As<Napi::String>().Utf8Value();

    // Build the complete program string
    std::ostringstream completeProgram;

    // Apply base programs if specified
    if (info.Length() >= 2)
    {
        std::set<std::string> refs = parse_refs_or_throw(info);

        expand_refs_to_programs(refs, [&](const std::string& key, const Program& program, std::string category) {
            if (!category.empty())
            {
                completeProgram << "% Program: " << key << " (category: " << category << ")\n";
            }
            else
            {
                completeProgram << "% Program: " << key << "\n";
            }
            completeProgram << program.content << "\n\n";
        });
    }

    // Add the main program last
    completeProgram << "% Main program\n";
    completeProgram << mainProgram;

    return Napi::String::New(env, completeProgram.str());
}

/**
 * N-API function exposed to JavaScript as `solve`.
 * Solves a given logic program, optionally combining it with stored base programs.
 * Handles grounding with external functions and collects answer sets.
 * @param info N-API callback info containing arguments (program string, optional base program key(s) string or array).
 * @returns A Napi::Object containing:
 *   - `answers`: A Napi::Array of strings, each representing an answer set.
 *   - `stats`: A Napi::Object containing:
 *     - `glue`: A Napi::Number representing the glue time in microseconds.
 *     - `add`: A Napi::Number representing the add time in microseconds.
 *     - `ground`: A Napi::Number representing the ground time in microseconds.
 *     - `solve`: A Napi::Number representing the solve time in microseconds.
 *   - `errors`: A Napi::Array of strings, each representing an error message.
 *   - `warnings`: A Napi::Array of strings, each representing a warning message.
 * @throws Napi::TypeError if arguments are invalid.
 * @throws Napi::Error on Clingo errors or other exceptions.
 */
Napi::Value Solve(const Napi::CallbackInfo& info)
{
    auto t = std::chrono::high_resolution_clock::now();
    Napi::Env env = info.Env();

    // Check arguments
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "String argument expected for program");
    }
    // Create the program string once
    std::string program = info[0].As<Napi::String>().Utf8Value();
    // stores reference strings
    // NOTE: Important that this is defined here, otherwise c strings will be invalidated
    std::set<std::string> refs;

    XXH3_state_t* state = XXH3_createState();
    XXH3_64bits_reset(state);
    XXH3_64bits_update(state, program.c_str(), program.size());

    // Apply base programs if specified
    if (info.Length() >= 2)
    {
        refs = parse_refs_or_throw(info);

        expand_refs_to_programs(refs, [&](const std::string& key, const auto& program, std::string category) {
            (void)category; // unused
            XXH3_64bits_update(state, &program.hash, 8);
        });
    }

    XXH64_hash_t hash = XXH3_64bits_digest(state);
    XXH3_freeState(state);

    if (g_results.find(hash) != g_results.end())
    {
        // create a copy of the result
        Napi::Object result = create_napi_object_from_solve_result(env, g_results[hash].result);
        return result;
    }

    // Error messages must be cleared before grounding
    g_errorMessages.clear();

    // Initialize Clingo control
    clingo_control_t* ctl = nullptr;
    if (!clingo_control_new(nullptr, 0, message_collector, nullptr, 20, &ctl))
    {
        handle_clingo_error(env);
    }

    std::unique_ptr<clingo_control_t, void (*)(clingo_control_t*)> ctl_guard(ctl, clingo_control_free);

    // Create vector to store all parts we need to ground
    std::vector<clingo_part_t> parts;

    // inefficient to call this twice
    expand_refs_to_programs(refs, [&](const std::string& key, const auto& program, std::string category) {
        (void)category; // unused
        if (!clingo_control_add(ctl, key.c_str(), nullptr, 0, program.content.c_str()))
        {
            handle_clingo_error(env, key);
        }
        else
        {
            parts.push_back({key.c_str(), nullptr, 0});
        }
    });

    auto t2 = std::chrono::high_resolution_clock::now();

    // Add the main program last and its part
    if (!clingo_control_add(ctl, "__program__", nullptr, 0, program.c_str()))
    {
        handle_clingo_error(env, "__program__");
    }
    parts.push_back({"__program__", nullptr, 0});

    auto t3 = std::chrono::high_resolution_clock::now();
    // Ground the program
    if (!clingo_control_ground(ctl, parts.data(), parts.size(), ground_callback, nullptr))
    {
        handle_clingo_error(env);
    }

    // Solve the program
    std::vector<std::string> answers;
    clingo_solve_handle_t* handle = nullptr;

    auto t4 = std::chrono::high_resolution_clock::now();

    // Use clingo_solve_mode_yield to get all answer sets
    if (!clingo_control_solve(ctl, clingo_solve_mode_yield, nullptr, 0, solve_event_callback, &answers, &handle))
    {
        handle_clingo_error(env);
    }

    std::unique_ptr<clingo_solve_handle_t, void (*)(clingo_solve_handle_t*)> handle_guard(
        handle, [](clingo_solve_handle_t* h) {
            if (h)
            {
                clingo_solve_handle_close(h);
            }
        });

    // Wait for solving to finish
    clingo_solve_result_bitset_t clingo_result;
    if (!clingo_solve_handle_get(handle, &clingo_result))
    {
        handle_clingo_error(env);
    }

    auto t5 = std::chrono::high_resolution_clock::now();

    SolveResult result = {
        .answers = answers,
        .logs = g_errorMessages,
        .stats =
            {.glue = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t),
             .add = std::chrono::duration_cast<std::chrono::microseconds>(t3 - t2),
             .ground = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t3),
             .solve = std::chrono::duration_cast<std::chrono::microseconds>(t5 - t4)},
    };

    Napi::Object resultObj = create_napi_object_from_solve_result(env, result);

    // Store the result
    g_results[hash] = {result};

    return resultObj;
}

/**
 * N-API module initialization function.
 * Exports certain functions to JavaScript.
 * @param env The N-API environment.
 * @param exports The N-API exports object.
 * @returns The populated exports object.
 */
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "solve"), Napi::Function::New(env, Solve));

    exports.Set(Napi::String::New(env, "buildProgram"), Napi::Function::New(env, BuildProgram));

    exports.Set(Napi::String::New(env, "setProgram"), Napi::Function::New(env, SetProgram));

    exports.Set(Napi::String::New(env, "removeAllPrograms"), Napi::Function::New(env, RemoveAllPrograms));

    exports.Set(Napi::String::New(env, "removeProgram"), Napi::Function::New(env, RemoveProgram));

    exports.Set(Napi::String::New(env, "removeProgramsByCategory"), Napi::Function::New(env, RemoveProgramsByCategory));

    return exports;
}

NODE_API_MODULE(node_clingo, Init)
