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
#include <chrono>
#include <cstring>
#include <ctime>
#include <sstream>
#include <stdint.h>
#include <string>

#include <clingo.h>
#include <napi.h>

#include "clingo_solver.h"
#include "program_store.h"
#include "xxhash.h"

// unnamed namespace to avoid polluting the global namespace
namespace
{
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

    /**
    * Helper function to parse the error messages from Clingo
    * @param env The N-API environment.
    * @return NodeClingoLogs containing separated errors and warnings arrays.
    */
    NodeClingoLogs parse_clingo_logs(
        const Napi::Env& env,
        const std::vector<node_clingo::ClingoLogMessage>& logMessages)
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
    /**
    * Helper function to check for and handle Clingo errors.
    * If a Clingo error has occurred (clingo_error_code() != 0),
    * it throws a Napi::Error with the Clingo error message.
    * @param env The N-API environment.
    * @param programKey The string identifier of the program that caused the error
    */
    void handle_clingo_error(
        const Napi::Env& env,
        const std::vector<node_clingo::ClingoLogMessage>& logMessages,
        const std::string& programKey = "")
    {
        // If clingo returns an error, we throw an error to the javascript side
        if (clingo_error_code() != 0)
        {
            Napi::Error error = Napi::Error::New(env, clingo_error_message());

            // Create an object to hold error details
            Napi::Object errorObj = Napi::Object::New(env);

            // Parse errors and warnings using the common routine
            NodeClingoLogs logs = parse_clingo_logs(env, logMessages);

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

    Napi::Object create_napi_object_from_solve_result(const Napi::Env& env, const node_clingo::SolveResult& result)
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

    node_clingo::ClingoSolver g_clingoSolver;
    node_clingo::ProgramStore g_programStore;
    node_clingo::SolveResultCache g_solveResultCache;

    /**
    * Parse refs array argument from N-API info at given index.
    * Throws TypeError if not an array of strings. Returns a vector of refs.
    */
    std::vector<std::string> parse_refs_or_throw(const Napi::CallbackInfo& info, size_t index = 1)
    {
        Napi::Env env = info.Env();
        if (!info[index].IsArray())
        {
            throw Napi::TypeError::New(env, "Second argument must be an array of strings (refs)");
        }

        std::vector<std::string> refs;
        Napi::Array arr = info[index].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); ++i)
        {
            Napi::Value val = arr[i];
            if (!val.IsString())
            {
                throw Napi::TypeError::New(env, "All refs must be strings");
            }
            std::string ref = val.As<Napi::String>().Utf8Value();
            refs.push_back(ref);
        }
        return refs;
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

    std::vector<std::string> categories;

    // Add categories if provided
    if (info.Length() >= 3 && info[2].IsArray())
    {
        Napi::Array categoriesArray = info[2].As<Napi::Array>();
        for (uint32_t i = 0; i < categoriesArray.Length(); ++i)
        {
            Napi::Value val = categoriesArray[i];
            if (val.IsString())
            {
                categories.push_back(val.As<Napi::String>().Utf8Value());
            }
        }
    }

    // Store the program
    g_programStore.addProgram(key, content, categories);
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
    bool removed = g_programStore.removeProgramByKey(key);

    return Napi::Boolean::New(env, removed);
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
    g_programStore.removeAllPrograms();
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
    std::vector<std::string> refs = parse_refs_or_throw(info);

    node_clingo::Query query = g_programStore.prepareQuery(mainProgram, refs);

    for (const auto& program : query.programs)
    {
        if (program->key == "__program__")
        {
            completeProgram << "% Main program\n";
        }
        else
        {
            completeProgram << "% Program: " << program->key << "\n";
        }
        completeProgram << program->content << "\n\n";
    }

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
    auto t1 = std::chrono::high_resolution_clock::now();
    Napi::Env env = info.Env();

    // Check arguments
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "String argument expected for program");
    }
    // Create the program string once
    std::string program = info[0].As<Napi::String>().Utf8Value();
    // stores reference strings
    std::vector<std::string> refs = parse_refs_or_throw(info);

    node_clingo::Query query = g_programStore.prepareQuery(program, refs);

    // try to get the result from the cache
    node_clingo::SolveResult result;
    if (g_solveResultCache.result(query.hash, result))
    {
        auto t2 = std::chrono::high_resolution_clock::now();
        result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1);
        result.stats.add = std::chrono::microseconds::zero();
        result.stats.ground = std::chrono::microseconds::zero();
        result.stats.solve = std::chrono::microseconds::zero();
        return create_napi_object_from_solve_result(env, result);
    }

    auto t2 = std::chrono::high_resolution_clock::now();

    // recalculate the result and store it in the cache
    result = g_clingoSolver.solve(query);
    result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1);
    if (result.isError)
    {
        handle_clingo_error(env, result.logs, result.key);
    }
    Napi::Object resultObj = create_napi_object_from_solve_result(env, result);
    g_solveResultCache.addResult(query.hash, std::move(result));

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

    return exports;
}

NODE_API_MODULE(node_clingo, Init)
