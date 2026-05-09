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
#include <sstream>
#include <string>

#include <clingo.hh>
#include <napi.h>

#include "napi_helpers.h"
#include "program_store.h"
#include "solve_task.h"
#include "xxhash.h"

// Shared solve result cache — content-addressed, safe to share across all instances.
static node_clingo::SolveResultCache g_cache;

// Lazy-initialized thread pool for Clingo solves.
// Must be lazy-initialized as otherwise there could be a deadlock on environments using musl
static BS::thread_pool<>& get_thread_pool()
{
    static BS::thread_pool<> pool;
    return pool;
}

namespace
{
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
            refs.push_back(val.As<Napi::String>().Utf8Value());
        }
        return refs;
    }

} // namespace

/**
 * Per-instance Clingo context.
 * Owns a ProgramStore (isolated per project / caller).
 * The solve result cache is shared globally across all instances.
 */
class ClingoContext : public Napi::ObjectWrap<ClingoContext> {
  public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        Napi::Function ctor = DefineClass(
            env,
            "ClingoContext",
            {
                InstanceMethod("setProgram", &ClingoContext::SetProgram),
                InstanceMethod("removeProgram", &ClingoContext::RemoveProgram),
                InstanceMethod("removeAllPrograms", &ClingoContext::RemoveAllPrograms),
                InstanceMethod("solve", &ClingoContext::Solve),
                InstanceMethod("buildProgram", &ClingoContext::BuildProgram),
            });
        exports.Set(Napi::String::New(env, "ClingoContext"), ctor);
        return exports;
    }

    /**
     * Constructor. Accepts an optional options object:
     *   { preParsing?: boolean }
     */
    ClingoContext(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ClingoContext>(info)
    {
        if (info.Length() > 0 && info[0].IsObject())
        {
            Napi::Object opts = info[0].As<Napi::Object>();
            if (opts.Has("preParsing") && opts.Get("preParsing").IsBoolean())
            {
                m_store.preParsing = opts.Get("preParsing").As<Napi::Boolean>().Value();
            }
        }
    }

    node_clingo::ProgramStore m_store;

  private:
    /**
     * setProgram(key, program, categories?)
     */
    Napi::Value SetProgram(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
        {
            throw Napi::TypeError::New(
                env, "Expected arguments: key (string), program (string), optional categories (string[])");
        }

        std::string key = info[0].As<Napi::String>().Utf8Value();
        std::string content = info[1].As<Napi::String>().Utf8Value();
        std::vector<std::string> categories;

        if (info.Length() >= 3 && info[2].IsArray())
        {
            Napi::Array arr = info[2].As<Napi::Array>();
            for (uint32_t i = 0; i < arr.Length(); ++i)
            {
                Napi::Value val = arr[i];
                if (val.IsString())
                {
                    categories.push_back(val.As<Napi::String>().Utf8Value());
                }
            }
        }

        m_store.addProgram(key, content, categories);
        return env.Undefined();
    }

    /**
     * removeProgram(key) → boolean
     */
    Napi::Value RemoveProgram(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "Expected argument: key (string)");
        }
        return Napi::Boolean::New(env, m_store.removeProgramByKey(info[0].As<Napi::String>().Utf8Value()));
    }

    /**
     * removeAllPrograms()
     */
    Napi::Value RemoveAllPrograms(const Napi::CallbackInfo& info)
    {
        m_store.removeAllPrograms();
        return info.Env().Undefined();
    }

    /**
     * buildProgram(program, refs) → string
     */
    Napi::Value BuildProgram(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "String argument expected for program");
        }

        std::string mainProgram = info[0].As<Napi::String>().Utf8Value();
        std::vector<std::string> refs = parse_refs_or_throw(info);
        node_clingo::Query query = m_store.prepareQuery(mainProgram, refs);

        std::ostringstream out;
        for (const auto& program : query.programs)
        {
            if (program->key == "__program__")
            {
                out << "% Main program\n";
            }
            else
            {
                out << "% Program: " << program->key << "\n";
            }
            out << program->content << "\n\n";
        }
        return Napi::String::New(env, out.str());
    }

    /**
     * solve(program, refs, options?) → Promise<SolveResult>
     *   options.cache: when false, skip the cache entirely for this call —
     *                  no hash, no lookup, no store. Default: true.
     */
    Napi::Value Solve(const Napi::CallbackInfo& info)
    {
        auto startTime = std::chrono::high_resolution_clock::now();
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString())
        {
            throw Napi::TypeError::New(env, "String argument expected for program");
        }

        std::string program = info[0].As<Napi::String>().Utf8Value();
        std::vector<std::string> refs = parse_refs_or_throw(info);

        bool cacheEnabled = true;
        if (info.Length() >= 3 && info[2].IsObject())
        {
            Napi::Object opts = info[2].As<Napi::Object>();
            if (opts.Has("cache") && opts.Get("cache").IsBoolean())
            {
                cacheEnabled = opts.Get("cache").As<Napi::Boolean>().Value();
            }
        }

        node_clingo::Query query = m_store.prepareQuery(program, refs, cacheEnabled);

        // Cache hit — resolve immediately on the main thread.
        // Skipped entirely when the caller opted out of the cache.
        if (cacheEnabled)
        {
            node_clingo::SolveResult result;
            if (g_cache.result(query.hash, result))
            {
                auto cacheHitTime = std::chrono::high_resolution_clock::now();
                result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(cacheHitTime - startTime);
                result.stats.add = std::chrono::microseconds::zero();
                result.stats.ground = std::chrono::microseconds::zero();
                result.stats.solve = std::chrono::microseconds::zero();
                result.stats.cacheHit = true;

                auto deferred = Napi::Promise::Deferred::New(env);
                deferred.Resolve(node_clingo::create_napi_object_from_solve_result(env, result));
                return deferred.Promise();
            }
        }

        auto afterCacheCheckTime = std::chrono::high_resolution_clock::now();

        auto deferred = Napi::Promise::Deferred::New(env);
        auto promise = deferred.Promise();
        node_clingo::spawnSolveTask(
            get_thread_pool(),
            g_cache,
            std::move(query),
            startTime,
            afterCacheCheckTime,
            std::move(deferred),
            env,
            cacheEnabled);
        return promise;
    }
};

/**
 * clearCache() — clears the shared solve result cache.
 */
Napi::Value ClearCache(const Napi::CallbackInfo& info)
{
    g_cache.clear();
    return info.Env().Undefined();
}

/**
 * Module initialization.
 */
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    ClingoContext::Init(env, exports);
    exports.Set(Napi::String::New(env, "clearCache"), Napi::Function::New(env, ClearCache));
    return exports;
}

NODE_API_MODULE(node_clingo, Init)
