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

#include <clingo.hh>
#include <napi.h>

#include "napi_helpers.h"
#include "program_store.h"
#include "solve_async_worker.h"
#include "xxhash.h"

// unnamed namespace to avoid polluting the global namespace
namespace
{
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

bool g_cacheEnabled = true;

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
 * N-API function exposed to JavaScript as `setCacheEnabled`.
 * Enables or disables the solve result cache.
 * @param info N-API callback info containing arguments (enabled boolean).
 * @returns undefined
 * @throws Napi::TypeError if the argument is invalid.
 */
Napi::Value SetCacheEnabled(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_cacheEnabled = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}

/**
 * N-API function exposed to JavaScript as `setAsyncSolve`.
 * Enables or disables async worker thread solving.
 * When disabled, solve() blocks the event loop — intended for benchmarking only.
 * @param info N-API callback info containing arguments (enabled boolean).
 * @returns undefined
 * @throws Napi::TypeError if the argument is invalid.
 */
Napi::Value SetAsyncSolve(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_asyncSolve = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}

/**
 * N-API function exposed to JavaScript as `setPreParsing`.
 * Enables or disables AST pre-parsing of LP text at setProgram time.
 * When disabled, programs store raw text and parsing happens at solve time.
 * @param info N-API callback info containing arguments (enabled boolean).
 * @returns undefined
 * @throws Napi::TypeError if the argument is invalid.
 */
Napi::Value SetPreParsing(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_programStore.preParsing = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}

/**
 * N-API function exposed to JavaScript as `solve`.
 * Solves a given logic program asynchronously using a worker thread.
 * Returns a Promise that resolves with the solve result.
 * @param info N-API callback info containing arguments (program string, optional base program key(s) string or array).
 * @returns A Napi::Promise that resolves to an object containing:
 *   - `answers`: An array of strings, each representing an answer set.
 *   - `stats`: An object containing timing statistics.
 *   - `errors`: An array of error message strings.
 *   - `warnings`: An array of warning message strings.
 * @throws Napi::TypeError if arguments are invalid.
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
    if (g_cacheEnabled && g_solveResultCache.result(query.hash, result))
    {
        auto t2 = std::chrono::high_resolution_clock::now();
        result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1);
        result.stats.add = std::chrono::microseconds::zero();
        result.stats.ground = std::chrono::microseconds::zero();
        result.stats.solve = std::chrono::microseconds::zero();
        result.stats.cacheHit = true;

        auto deferred = Napi::Promise::Deferred::New(env);
        deferred.Resolve(node_clingo::create_napi_object_from_solve_result(env, result));
        return deferred.Promise();
    }

    auto t2 = std::chrono::high_resolution_clock::now();

    // Queue the expensive solve work on a worker thread
    auto* worker = new node_clingo::SolveAsyncWorker(env, std::move(query), t1, t2, g_solveResultCache);
    auto promise = worker->Deferred().Promise();
    worker->Queue();

    return promise;
}

/**
 * N-API function exposed to JavaScript as `clearCache`.
 * Clears the solve result cache.
 * @param info N-API callback info (no arguments expected).
 * @returns undefined
 */
Napi::Value ClearCache(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    g_solveResultCache.clear();
    return env.Undefined();
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

    exports.Set(Napi::String::New(env, "clearCache"), Napi::Function::New(env, ClearCache));

    exports.Set(Napi::String::New(env, "setCacheEnabled"), Napi::Function::New(env, SetCacheEnabled));

    exports.Set(Napi::String::New(env, "setAsyncSolve"), Napi::Function::New(env, SetAsyncSolve));

    exports.Set(Napi::String::New(env, "setPreParsing"), Napi::Function::New(env, SetPreParsing));

    return exports;
}

NODE_API_MODULE(node_clingo, Init)
