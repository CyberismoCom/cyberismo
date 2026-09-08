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
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <sstream>
#include <string>

#include <clingo.hh>
#include <napi.h>

#include "ast_rename.h"
#include "helpers.h"
#include "napi_helpers.h"
#include "program_store.h"
#include "snapshot.h"
#include "solve_task.h"
#include "validator.h"
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
    // Named once: both commit() and solve()'s snapshot freshness check need it.
    constexpr const char* kKnowledgeCategory = "knowledge";

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

    /**
     * Parse the programs array argument (solveBatch()'s first argument) from N-API info.
     * Throws TypeError if not an array of strings. Returns one query text per instance.
     */
    std::vector<std::string> parse_programs_or_throw(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        if (!info[0].IsArray())
        {
            throw Napi::TypeError::New(env, "First argument must be an array of strings (programs)");
        }

        std::vector<std::string> programs;
        Napi::Array arr = info[0].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); ++i)
        {
            Napi::Value val = arr[i];
            if (!val.IsString())
            {
                throw Napi::TypeError::New(env, "All programs must be strings");
            }
            programs.push_back(val.As<Napi::String>().Utf8Value());
        }
        return programs;
    }

    // Outcome of deciding whether { snapshot: true } can be honored right now: either a
    // usable snapshot, or a coded reason it cannot be used. Shared by solve() and
    // solveBatch() so the freshness rule (knowledge hash match, @today not rolled over)
    // cannot drift between the two; each caller still creates and settles its own Deferred,
    // since that differs (solveBatch() rejects the whole batch, solve() rejects one query).
    struct SnapshotCheck
    {
        std::shared_ptr<const node_clingo::Snapshot> snapshot;
        const char* code = nullptr;
        const char* reason = nullptr;
    };

    SnapshotCheck checkSnapshot(
        const std::shared_ptr<const node_clingo::Snapshot>& current,
        node_clingo::ProgramStore& store)
    {
        SnapshotCheck result;
        if (!current)
        {
            result.code = "SNAPSHOT_MISSING";
            result.reason = "no snapshot; call commit() first";
            return result;
        }
        // Fresh only if the knowledge programs still hash to what was committed, and
        // (when the commit involved @today) that day has not rolled over yet. Scoped to
        // the knowledge category alone: a queryLayer edit must not trip this.
        if (current->knowledgeHash != store.categoryHash(kKnowledgeCategory) ||
            (current->valid_until && current->valid_until <= node_clingo::current_epoch_ms()))
        {
            result.code = "SNAPSHOT_STALE";
            result.reason = "snapshot is older than the knowledge programs";
            return result;
        }
        result.snapshot = current;
        return result;
    }

    /**
     * Finds the first knowledge program carrying a top-level statement that changes what
     * model.symbols() returns for the *whole* solve -- #show, #external, #minimize,
     * #project, #defined -- rather than merely deriving atoms. The snapshot's fact_nodes
     * are plain facts and cannot carry any of these, so replaying them instead of the
     * knowledge programs would silently change which atoms come back.
     * A program that failed to pre-parse has empty ast_nodes (it falls back to raw-text
     * parsing at ground time) and is not inspected here.
     * Returns nullptr if no knowledge program carries such a statement.
     */
    const node_clingo::Program* findUncarriableStatement(
        const std::vector<std::shared_ptr<const node_clingo::Program>>& programs)
    {
        for (const auto& program : programs)
        {
            for (const auto& node : program->ast_nodes)
            {
                switch (node.type())
                {
                    case Clingo::AST::Type::ShowSignature:
                    case Clingo::AST::Type::ShowTerm:
                    case Clingo::AST::Type::External:
                    case Clingo::AST::Type::ProjectAtom:
                    case Clingo::AST::Type::Minimize:
                    case Clingo::AST::Type::Defined:
                        return program.get();
                    default:
                        break;
                }
            }
        }
        return nullptr;
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
                InstanceMethod("solveBatch", &ClingoContext::SolveBatch),
                InstanceMethod("buildProgram", &ClingoContext::BuildProgram),
                InstanceMethod("commit", &ClingoContext::Commit),
            });
        exports.Set(Napi::String::New(env, "ClingoContext"), ctor);
        return exports;
    }

    ClingoContext(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ClingoContext>(info) {}

    node_clingo::ProgramStore m_store;

  private:
    std::shared_ptr<const node_clingo::Snapshot> m_snapshot;
    uint64_t m_revision = 0;

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
     * options.snapshot: replay the committed knowledge snapshot instead of grounding the
     * `knowledge` programs. Rejects with a coded error (SNAPSHOT_MISSING, SNAPSHOT_STALE)
     * if there is no snapshot or it no longer matches the current knowledge programs, so
     * the caller can fall back to a full solve.
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

        if (info.Length() > 2 && !info[2].IsUndefined() && !info[2].IsNull() && !info[2].IsObject())
        {
            throw Napi::TypeError::New(env, "Third argument must be an options object");
        }

        bool useSnapshot = false;
        if (info.Length() > 2 && info[2].IsObject())
        {
            Napi::Object opts = info[2].As<Napi::Object>();
            useSnapshot = opts.Has("snapshot") && opts.Get("snapshot").ToBoolean().Value();
        }

        if (useSnapshot && std::find(refs.begin(), refs.end(), kKnowledgeCategory) != refs.end())
        {
            throw Napi::TypeError::New(
                env,
                std::string("solve(): cannot combine { snapshot: true } with the \"") + kKnowledgeCategory +
                    "\" category in refs -- that grounds the knowledge layer twice");
        }

        std::shared_ptr<const node_clingo::Snapshot> snapshot;
        if (useSnapshot)
        {
            // Only decides *whether* to reject and with what; the Deferred itself is
            // created below, only on the path that actually settles it. Creating it
            // unconditionally up front and settling it in just two of three branches leaves
            // it unresolved -- and abandoned on the common (fresh) path -- which leaks
            // (napi_create_promise holds a strong reference until settled).
            SnapshotCheck check = checkSnapshot(m_snapshot, m_store);
            if (check.code)
            {
                auto deferred = Napi::Promise::Deferred::New(env);
                deferred.Reject(
                    node_clingo::coded_error(env, check.code, (std::string("solve(): ") + check.reason).c_str()));
                return deferred.Promise();
            }
            snapshot = std::move(check.snapshot);
        }

        node_clingo::Query query = m_store.prepareQuery(program, refs, snapshot);

        // Cache hit — resolve immediately on the main thread.
        node_clingo::SolveResult result;
        if (g_cache.result(query.hash, result))
        {
            auto cacheHitTime = std::chrono::high_resolution_clock::now();
            result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(cacheHitTime - startTime);
            result.stats.add = std::chrono::microseconds::zero();
            result.stats.inject = std::chrono::microseconds::zero();
            result.stats.ground = std::chrono::microseconds::zero();
            result.stats.solve = std::chrono::microseconds::zero();
            result.stats.cacheHit = true;
            // batchSize is call-specific, not cached content -- a plain solve() is never
            // itself part of a batch, regardless of whether this cache entry happens to
            // have been produced by an earlier solveBatch() call for the same query.
            result.stats.batchSize = 0;

            auto deferred = Napi::Promise::Deferred::New(env);
            deferred.Resolve(node_clingo::create_napi_object_from_solve_result(env, result));
            return deferred.Promise();
        }

        auto afterCacheCheckTime = std::chrono::high_resolution_clock::now();

        auto deferred = Napi::Promise::Deferred::New(env);
        auto promise = deferred.Promise();
        node_clingo::spawnSolveTask(
            get_thread_pool(), g_cache, std::move(query), startTime, afterCacheCheckTime, std::move(deferred), env);
        return promise;
    }

    /**
     * solveBatch(programs, refs, options?) → Promise<SolveResult[]>
     * Grounds and solves N query instances together in one Control over the committed
     * knowledge snapshot, and returns one result per instance in `programs`' order. Every
     * instance's own predicates are isolated from every other instance's (see batch.h), so
     * the result is the same as solving each instance separately -- batching only changes
     * how the work is scheduled. An instance already in the shared cache is served directly
     * and never enters the batch; only the misses are ground and solved together. Requires
     * { snapshot: true }: batching without a committed snapshot to share is not
     * implemented (see BatchQuery in batch.h).
     */
    Napi::Value SolveBatch(const Napi::CallbackInfo& info)
    {
        auto startTime = std::chrono::high_resolution_clock::now();
        Napi::Env env = info.Env();

        std::vector<std::string> programs = parse_programs_or_throw(info);
        std::vector<std::string> refs = parse_refs_or_throw(info, 1);

        if (info.Length() > 2 && !info[2].IsUndefined() && !info[2].IsNull() && !info[2].IsObject())
        {
            throw Napi::TypeError::New(env, "Third argument must be an options object");
        }

        bool useSnapshot = false;
        if (info.Length() > 2 && info[2].IsObject())
        {
            Napi::Object opts = info[2].As<Napi::Object>();
            useSnapshot = opts.Has("snapshot") && opts.Get("snapshot").ToBoolean().Value();
        }

        if (!useSnapshot)
        {
            throw Napi::TypeError::New(
                env,
                "solveBatch(): requires { snapshot: true } -- batching without a committed snapshot to share is "
                "not supported");
        }

        if (std::find(refs.begin(), refs.end(), kKnowledgeCategory) != refs.end())
        {
            throw Napi::TypeError::New(
                env,
                std::string("solveBatch(): cannot combine { snapshot: true } with the \"") + kKnowledgeCategory +
                    "\" category in refs -- that grounds the knowledge layer twice");
        }

        SnapshotCheck check = checkSnapshot(m_snapshot, m_store);
        if (check.code)
        {
            auto deferred = Napi::Promise::Deferred::New(env);
            deferred.Reject(
                node_clingo::coded_error(env, check.code, (std::string("solveBatch(): ") + check.reason).c_str()));
            return deferred.Promise();
        }
        std::shared_ptr<const node_clingo::Snapshot> snapshot = std::move(check.snapshot);

        const size_t n = programs.size();
        std::vector<node_clingo::SolveResult> results(n);
        std::vector<std::string> missQueries;
        std::vector<node_clingo::Hash> missHashes;
        std::vector<size_t> missIndices;

        for (size_t i = 0; i < n; ++i)
        {
            node_clingo::Query query = m_store.prepareQuery(programs[i], refs, snapshot);
            node_clingo::SolveResult cached;
            if (g_cache.result(query.hash, cached))
            {
                cached.stats.add = std::chrono::microseconds::zero();
                cached.stats.ground = std::chrono::microseconds::zero();
                cached.stats.solve = std::chrono::microseconds::zero();
                cached.stats.inject = std::chrono::microseconds::zero();
                cached.stats.cacheHit = true;
                results[i] = std::move(cached);
            }
            else
            {
                missIndices.push_back(i);
                missQueries.push_back(programs[i]);
                missHashes.push_back(query.hash);
            }
        }

        auto afterCacheCheckTime = std::chrono::high_resolution_clock::now();

        if (missIndices.empty())
        {
            // Every instance was already cached -- resolve immediately on the main thread,
            // same as solve()'s own cache-hit path.
            auto glue = std::chrono::duration_cast<std::chrono::microseconds>(afterCacheCheckTime - startTime);
            Napi::Array out = Napi::Array::New(env, n);
            for (size_t i = 0; i < n; ++i)
            {
                results[i].stats.glue = glue;
                results[i].stats.batchSize = static_cast<int>(n);
                out[i] = node_clingo::create_napi_object_from_solve_result(env, results[i]);
            }
            auto deferred = Napi::Promise::Deferred::New(env);
            deferred.Resolve(out);
            return deferred.Promise();
        }

        // The query layer's shared programs -- the same for every instance, since `refs`
        // applies to the whole batch. Fetched via the same empty-query trick buildProgram()
        // and commit() use to read back just a category's members: "" parses to no
        // statements, so query.programs is exactly `refs`' members plus that empty
        // placeholder, dropped below.
        node_clingo::Query queryLayerQuery = m_store.prepareQuery("", refs, snapshot);
        std::vector<std::shared_ptr<const node_clingo::Program>> queryLayer = std::move(queryLayerQuery.programs);
        queryLayer.pop_back();

        auto deferred = Napi::Promise::Deferred::New(env);
        auto promise = deferred.Promise();
        node_clingo::spawnBatchTask(
            get_thread_pool(),
            g_cache,
            std::move(snapshot),
            std::move(queryLayer),
            std::move(missQueries),
            std::move(missHashes),
            std::move(results),
            std::move(missIndices),
            static_cast<int>(n),
            startTime,
            afterCacheCheckTime,
            std::move(deferred),
            env);
        return promise;
    }

    /**
     * commit() → Promise<{ revision, atoms, stats }>: solves the `knowledge` category once
     * on the pool and keeps its conclusions as a snapshot for later cheap replay.
     */
    Napi::Value Commit(const Napi::CallbackInfo& info)
    {
        Napi::Env env = info.Env();
        auto deferred = Napi::Promise::Deferred::New(env);
        node_clingo::Query query = m_store.prepareQuery("", {kKnowledgeCategory});
        if (query.programs.size() <= 1) // only the empty __program__
        {
            deferred.Reject(
                Napi::Error::New(env, std::string("commit(): no programs in category \"") + kKnowledgeCategory + "\"")
                    .Value());
            return deferred.Promise();
        }

        if (const node_clingo::Program* offender = findUncarriableStatement(query.programs))
        {
            deferred.Reject(
                Napi::Error::New(
                    env,
                    std::string("commit(): knowledge program \"") + offender->key +
                        "\" contains a #show/#external/#minimize/#project/#defined statement, which a snapshot "
                        "replay cannot carry")
                    .Value());
            return deferred.Promise();
        }

        uint64_t revision = ++m_revision;
        node_clingo::Hash knowledgeHash = m_store.categoryHash(kKnowledgeCategory);

        // Keeps this ClingoContext alive until the commit settles: see spawnCommitTask's
        // doc comment for why a pending Deferred alone does not do that. Released by
        // onSettled below, on every completion path.
        Ref();
        node_clingo::spawnCommitTask(
            get_thread_pool(),
            std::move(query),
            revision,
            knowledgeHash,
            deferred,
            env,
            [this](std::shared_ptr<const node_clingo::Snapshot> snap) {
                // Pool tasks can complete out of submission order; never let an older
                // commit clobber a newer one. A commit that is rejected (or superseded
                // here) still leaves a gap in the revision sequence, so nothing may treat
                // revisions as contiguous.
                if (!m_snapshot || snap->revision > m_snapshot->revision)
                {
                    m_snapshot = std::move(snap);
                }
            },
            [this]() { Unref(); });
        return deferred.Promise();
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
 * validateProgram(program) — parse + safety-check a logic program without
 * grounding or solving. Returns { valid, errors, warnings }.
 */
Napi::Value ValidateProgram(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString())
    {
        throw Napi::TypeError::New(env, "String argument expected for program");
    }

    node_clingo::ValidationResult result = node_clingo::validate_program(info[0].As<Napi::String>().Utf8Value());

    Napi::Object resultObj = Napi::Object::New(env);
    resultObj.Set("valid", Napi::Boolean::New(env, result.valid));
    node_clingo::NodeClingoLogs logs = node_clingo::parse_clingo_logs(env, result.logs);
    resultObj.Set("errors", logs.errors);
    resultObj.Set("warnings", logs.warnings);
    return resultObj;
}

namespace
{
    // Joins printed statements one per line, for RenameForTest's two outputs below.
    std::string printNodes(const std::vector<Clingo::AST::Node>& nodes)
    {
        std::ostringstream out;
        for (size_t i = 0; i < nodes.size(); ++i)
        {
            if (i > 0)
            {
                out << "\n";
            }
            out << nodes[i].to_string();
        }
        return out.str();
    }
} // namespace

/**
 * _renameForTest(program, prefix) -> { renamed, original } — parses `program`, computes
 * which predicates it defines, and returns both the renamed copy's source and the
 * original parsed nodes' own printed source (one statement per line each), so a test can
 * assert `rename_predicates` never mutates its input -- the property Task 4's shared,
 * concurrently-read stored query-layer nodes most depend on. Debug export for the AST
 * renamer used to merge coalesced query solves; never registered outside of
 * NODE_CLINGO_TEST_EXPORTS, so it never reaches a shipped build. That is a *runtime* gate
 * only: shipping this for real would need it compiled out entirely (e.g. behind a build
 * flag), since a runtime check still leaves the code and its symbol in the binary.
 */
Napi::Value RenameForTest(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString())
    {
        throw Napi::TypeError::New(env, "Expected arguments: program (string), prefix (string)");
    }

    std::string program = info[0].As<Napi::String>().Utf8Value();
    std::string prefix = info[1].As<Napi::String>().Utf8Value();

    std::vector<Clingo::AST::Node> nodes;
    try
    {
        Clingo::AST::parse_string(program.c_str(), [&nodes](Clingo::AST::Node node) { nodes.push_back(node); });
    }
    catch (const std::exception& e)
    {
        throw Napi::Error::New(env, e.what());
    }

    std::string original = printNodes(nodes);

    auto sigs = node_clingo::head_signatures(nodes);
    auto renamed = node_clingo::rename_predicates(nodes, sigs, prefix);

    Napi::Object result = Napi::Object::New(env);
    result.Set("renamed", Napi::String::New(env, printNodes(renamed)));
    result.Set("original", Napi::String::New(env, original));
    return result;
}

/**
 * Module initialization.
 */
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    ClingoContext::Init(env, exports);
    exports.Set(Napi::String::New(env, "clearCache"), Napi::Function::New(env, ClearCache));
    exports.Set(Napi::String::New(env, "validateProgram"), Napi::Function::New(env, ValidateProgram));
    // POC-grade gate: fine for keeping this off a dev's own production process, not fine
    // to ship -- RenameForTest and its symbol are still compiled into the binary either
    // way. Shipping this for real needs it compiled out entirely (e.g. an ifdef behind a
    // build flag), not just left unregistered at runtime.
    if (std::getenv("NODE_CLINGO_TEST_EXPORTS") != nullptr)
    {
        exports.Set(Napi::String::New(env, "_renameForTest"), Napi::Function::New(env, RenameForTest));
    }
    return exports;
}

NODE_API_MODULE(node_clingo, Init)
