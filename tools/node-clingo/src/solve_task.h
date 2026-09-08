/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#ifndef NODE_CLINGO_SOLVE_TASK_H
#define NODE_CLINGO_SOLVE_TASK_H

#include <chrono>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include <napi.h>

#include "BS_thread_pool.hpp"
#include "batch.h"
#include "clingo_solver.h"
#include "napi_helpers.h"
#include "snapshot.h"
#include "solve_result_cache.h"

namespace node_clingo
{
    struct SolveCallbackData
    {
        std::optional<SolveResult> result;
        std::optional<ClingoSolveException> solveException;
        std::string genericError;
        Napi::Promise::Deferred deferred;
        std::chrono::high_resolution_clock::time_point t1;
        std::chrono::high_resolution_clock::time_point t2;
        SolveResultCache& cache;
        Hash queryHash;
    };

    /**
     * Submits a solve task to the thread pool.
     * The task runs ClingoSolver::solve() off the main thread, then marshals
     * the result back via ThreadSafeFunction to resolve/reject the promise.
     */
    inline void spawnSolveTask(
        BS::thread_pool<>& pool,
        SolveResultCache& cache,
        Query query,
        std::chrono::high_resolution_clock::time_point t1,
        std::chrono::high_resolution_clock::time_point t2,
        Napi::Promise::Deferred deferred,
        Napi::Env env)
    {
        auto* data = new SolveCallbackData{
            .result = std::nullopt,
            .solveException = std::nullopt,
            .genericError = {},
            .deferred = deferred,
            .t1 = t1,
            .t2 = t2,
            .cache = cache,
            .queryHash = query.hash,
        };

        // could be shared
        auto tsfn = Napi::ThreadSafeFunction::New(
            env,
            Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
            "SolveCallback",
            0, // unlimited queue
            1  // initial thread count
        );

        pool.detach_task([data, tsfn, query = std::move(query)]() mutable {
            try
            {
                ClingoSolver solver;
                data->result = solver.solve(query);
            }
            catch (const ClingoSolveException& e)
            {
                data->solveException = e;
            }
            catch (const std::exception& e)
            {
                data->genericError = e.what();
            }

            tsfn.BlockingCall(data, [](Napi::Env env, Napi::Function, SolveCallbackData* d) {
                Napi::HandleScope scope(env);

                if (d->solveException)
                {
                    Napi::Error error = Napi::Error::New(env, d->solveException->what());
                    Napi::Object errorObj = Napi::Object::New(env);
                    NodeClingoLogs logs = parse_clingo_logs(env, d->solveException->logs);
                    errorObj.Set("errors", logs.errors);
                    errorObj.Set("warnings", logs.warnings);
                    if (!d->solveException->programKey.empty())
                    {
                        errorObj.Set("program", Napi::String::New(env, d->solveException->programKey));
                    }
                    error.Set("details", errorObj);
                    d->deferred.Reject(error.Value());
                }
                else if (!d->genericError.empty())
                {
                    d->deferred.Reject(Napi::Error::New(env, d->genericError).Value());
                }
                else
                {
                    d->result->stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(d->t2 - d->t1);
                    Napi::Object resultObj = create_napi_object_from_solve_result(env, *d->result);
                    d->cache.addResult(d->queryHash, std::move(*d->result));
                    d->deferred.Resolve(resultObj);
                }

                delete d;
            });

            tsfn.Release();
        });
    }

    struct BatchCallbackData
    {
        // Every instance's final result, in the caller's order. Cache-hit instances are
        // already filled in when this is constructed; `missIndices` says which positions
        // the pool task below still has to fill in from `missResults`.
        std::vector<SolveResult> results;
        std::optional<std::vector<SolveResult>> missResults;
        std::optional<ClingoSolveException> solveException;
        std::string genericError;
        Napi::Promise::Deferred deferred;
        std::chrono::high_resolution_clock::time_point t1;
        std::chrono::high_resolution_clock::time_point t2;
        SolveResultCache& cache;
        std::vector<Hash> missHashes; // parallel to missResults, once populated
        std::vector<size_t> missIndices;
        int totalSize;
    };

    /**
     * Submits a batch solve task to the thread pool for the misses in a solveBatch() call
     * -- any instance the caller already served from the shared cache is not part of this
     * task at all, and is carried through in `results` untouched. Builds the renamed
     * instances (buildBatch(), batch.h) and grounds/solves them together
     * (ClingoSolver::solveBatch()) entirely off the main thread: buildBatch() deep-copies
     * the query layer once per instance, real CPU work that must not block the event loop,
     * and it reads `queryLayer`'s shared, stored Program nodes under their own
     * Program::ast_mutex -- a lock that only matters, and only avoids a data race, because
     * this runs concurrently with other pool workers' plain solve() calls replaying those
     * same programs (see batch.h and clingo_solver.cc's groundPrograms()).
     */
    inline void spawnBatchTask(
        BS::thread_pool<>& pool,
        SolveResultCache& cache,
        std::shared_ptr<const Snapshot> snapshot,
        std::vector<std::shared_ptr<const Program>> queryLayer,
        std::vector<std::string> missQueries,
        std::vector<Hash> missHashes,
        std::vector<SolveResult> results,
        std::vector<size_t> missIndices,
        int totalSize,
        std::chrono::high_resolution_clock::time_point t1,
        std::chrono::high_resolution_clock::time_point t2,
        Napi::Promise::Deferred deferred,
        Napi::Env env)
    {
        auto* data = new BatchCallbackData{
            .results = std::move(results),
            .missResults = std::nullopt,
            .solveException = std::nullopt,
            .genericError = {},
            .deferred = deferred,
            .t1 = t1,
            .t2 = t2,
            .cache = cache,
            .missHashes = missHashes,
            .missIndices = std::move(missIndices),
            .totalSize = totalSize,
        };

        auto tsfn = Napi::ThreadSafeFunction::New(
            env,
            Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
            "BatchCallback",
            0, // unlimited queue
            1  // initial thread count
        );

        pool.detach_task([data,
                          tsfn,
                          snapshot = std::move(snapshot),
                          queryLayer = std::move(queryLayer),
                          missQueries = std::move(missQueries),
                          missHashes]() mutable {
            try
            {
                BatchQuery batch = buildBatch(snapshot, queryLayer, missQueries, missHashes);
                ClingoSolver solver;
                data->missResults = solver.solveBatch(batch);
            }
            catch (const ClingoSolveException& e)
            {
                data->solveException = e;
            }
            catch (const std::exception& e)
            {
                data->genericError = e.what();
            }

            tsfn.BlockingCall(data, [](Napi::Env env, Napi::Function, BatchCallbackData* d) {
                Napi::HandleScope scope(env);

                if (d->solveException)
                {
                    Napi::Error error = Napi::Error::New(env, d->solveException->what());
                    Napi::Object errorObj = Napi::Object::New(env);
                    NodeClingoLogs logs = parse_clingo_logs(env, d->solveException->logs);
                    errorObj.Set("errors", logs.errors);
                    errorObj.Set("warnings", logs.warnings);
                    if (!d->solveException->programKey.empty())
                    {
                        errorObj.Set("program", Napi::String::New(env, d->solveException->programKey));
                    }
                    error.Set("details", errorObj);
                    d->deferred.Reject(error.Value());
                }
                else if (!d->genericError.empty())
                {
                    d->deferred.Reject(Napi::Error::New(env, d->genericError).Value());
                }
                else
                {
                    // Every miss is inserted into the shared cache under its own hash
                    // before being moved into its final position in `results` -- a copy,
                    // since the cache and the response each need their own instance.
                    for (size_t k = 0; k < d->missIndices.size(); ++k)
                    {
                        d->cache.addResult(d->missHashes[k], SolveResult((*d->missResults)[k]));
                        d->results[d->missIndices[k]] = std::move((*d->missResults)[k]);
                    }

                    // `glue` and `batchSize` are call-specific, not cached content -- set
                    // uniformly on every result (hit or miss) for this call, same as
                    // Solve()'s cache-hit branch resets the timing stats it doesn't own.
                    auto glue = std::chrono::duration_cast<std::chrono::microseconds>(d->t2 - d->t1);
                    Napi::Array out = Napi::Array::New(env, d->results.size());
                    for (size_t i = 0; i < d->results.size(); ++i)
                    {
                        d->results[i].stats.glue = glue;
                        d->results[i].stats.batchSize = d->totalSize;
                        out[i] = create_napi_object_from_solve_result(env, d->results[i]);
                    }
                    d->deferred.Resolve(out);
                }

                delete d;
            });

            tsfn.Release();
        });
    }

    struct CommitCallbackData
    {
        std::shared_ptr<Snapshot> result;
        std::optional<ClingoSolveException> solveException;
        std::string genericError;
        Napi::Promise::Deferred deferred;
        std::function<void(std::shared_ptr<const Snapshot>)> onCommitted;
        std::function<void()> onSettled;
    };

    // Runs `fn` exactly once when it goes out of scope. Copies `fn` at construction so it
    // stays valid even if the object it was read from (here, the heap-allocated callback
    // data) is deleted before this guard's destructor runs.
    struct ScopeExit
    {
        std::function<void()> fn;
        ~ScopeExit()
        {
            if (fn)
            {
                fn();
            }
        }
    };

    /**
     * Submits a commit task to the thread pool.
     * The task runs ClingoSolver::solveKnowledge() off the main thread, then marshals the
     * result back via ThreadSafeFunction to resolve/reject the promise. `onCommitted` stores
     * the snapshot on the ClingoContext on success; `onSettled` releases the Ref() the
     * caller took before spawning this task, and runs on every completion path (success,
     * ClingoSolveException, and generic error) via a scope guard. Both run on the main
     * thread, inside the same callback that resolves/rejects the promise.
     *
     * The Ref()/Unref() pairing is what keeps the ClingoContext alive here: a pending
     * Deferred does not itself keep the JS wrapper reachable, and ClingoContext is a
     * Napi::ObjectWrap, so without that Ref() a GC finalizer could delete the C++ object
     * while this task is still running on the pool (e.g. `void ctx.commit()` with no other
     * reference to `ctx` left in JS).
     */
    inline void spawnCommitTask(
        BS::thread_pool<>& pool,
        Query query,
        uint64_t revision,
        Hash knowledgeHash,
        Napi::Promise::Deferred deferred,
        Napi::Env env,
        std::function<void(std::shared_ptr<const Snapshot>)> onCommitted,
        std::function<void()> onSettled)
    {
        auto* data = new CommitCallbackData{
            .result = nullptr,
            .solveException = std::nullopt,
            .genericError = {},
            .deferred = deferred,
            .onCommitted = std::move(onCommitted),
            .onSettled = std::move(onSettled),
        };

        auto tsfn = Napi::ThreadSafeFunction::New(
            env,
            Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
            "CommitCallback",
            0, // unlimited queue
            1  // initial thread count
        );

        pool.detach_task([data, tsfn, query = std::move(query), revision, knowledgeHash]() mutable {
            try
            {
                ClingoSolver solver;
                data->result = solver.solveKnowledge(query, revision, knowledgeHash);
            }
            catch (const ClingoSolveException& e)
            {
                data->solveException = e;
            }
            catch (const std::exception& e)
            {
                data->genericError = e.what();
            }

            tsfn.BlockingCall(data, [](Napi::Env env, Napi::Function, CommitCallbackData* d) {
                Napi::HandleScope scope(env);

                // Releases the Ref() taken before this task was spawned, on every path
                // below -- see spawnCommitTask's doc comment for why that Ref() exists.
                ScopeExit releaseRef{d->onSettled};

                if (d->solveException)
                {
                    Napi::Error error = Napi::Error::New(env, d->solveException->what());
                    Napi::Object errorObj = Napi::Object::New(env);
                    NodeClingoLogs logs = parse_clingo_logs(env, d->solveException->logs);
                    errorObj.Set("errors", logs.errors);
                    errorObj.Set("warnings", logs.warnings);
                    if (!d->solveException->programKey.empty())
                    {
                        errorObj.Set("program", Napi::String::New(env, d->solveException->programKey));
                    }
                    error.Set("details", errorObj);
                    d->deferred.Reject(error.Value());
                }
                else if (!d->genericError.empty())
                {
                    d->deferred.Reject(Napi::Error::New(env, d->genericError).Value());
                }
                else
                {
                    Napi::Object statsObj = Napi::Object::New(env);
                    statsObj.Set("add", d->result->stats.add.count());
                    statsObj.Set("ground", d->result->stats.ground.count());
                    statsObj.Set("solve", d->result->stats.solve.count());

                    Napi::Object resultObj = Napi::Object::New(env);
                    resultObj.Set("revision", Napi::Number::New(env, static_cast<double>(d->result->revision)));
                    resultObj.Set("atoms", Napi::Number::New(env, static_cast<double>(d->result->symbols.size())));
                    resultObj.Set("stats", statsObj);

                    d->onCommitted(d->result);
                    d->deferred.Resolve(resultObj);
                }

                delete d;
            });

            tsfn.Release();
        });
    }

} // namespace node_clingo

#endif // NODE_CLINGO_SOLVE_TASK_H
