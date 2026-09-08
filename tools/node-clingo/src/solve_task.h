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
    // Runs `fn` exactly once when it goes out of scope. Copies `fn` at construction so it
    // stays valid even if the object it was read from (here, a heap-allocated callback
    // data struct) is deleted before this guard's destructor runs.
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
        // > 0 overrides the resolved value's stats.batchSize for this call only -- the
        // cached copy is never touched, so this cannot leak into a later reader. Used by
        // ClingoContext::pump() (binding.cc) to mark a coalesced group that reduced to one
        // real query as having gone through the pump, same as solveBatch() already reports
        // 1 for a manual batch of one; 0 (the default) leaves the result untouched, which
        // is what the plain, non-snapshot solve() path -- this function's original caller
        // -- still gets.
        int reportedBatchSize;
        // Runs once this call's Deferred has settled, on every path (success, solve
        // exception, generic error). Empty for the plain solve() path, which has no extra
        // bookkeeping to do; ClingoContext::pump() uses it to release the Ref() it took for
        // this request and to resume the queue (see pump()'s doc comment in binding.cc).
        std::function<void()> onSettled;
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
        Napi::Env env,
        int reportedBatchSize = 0,
        std::function<void()> onSettled = {})
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
            .reportedBatchSize = reportedBatchSize,
            .onSettled = std::move(onSettled),
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
                ScopeExit notifySettled{d->onSettled};

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
                    if (d->reportedBatchSize > 0)
                    {
                        // The cache insertion just below uses the untouched `*d->result`
                        // (batchSize 0, its natural default), so this override is visible
                        // to this call's own caller only -- see reportedBatchSize's doc
                        // comment on SolveCallbackData.
                        resultObj.Get("stats").As<Napi::Object>().Set(
                            "batchSize", Napi::Number::New(env, d->reportedBatchSize));
                    }
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
        // False when solveBatch() found the whole batch unsatisfiable (or otherwise could
        // not split per instance): every miss's `answers` is then empty because the batch
        // failed, not because that instance's own query has no answers, so none of them
        // may be written into the shared cache under their individual hashes.
        bool cacheable = true;
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
     * Returns a copy of `result` fit for the shared, content-addressed cache. A batch
     * result carries values that describe *this call*, not the query's own content --
     * `batchSize` and `unprefixedAtoms` are both a function of which other instances
     * happened to be batched alongside this one, and `logs` is the whole shared Control's
     * logger output with no way to tell which instance a given message belongs to, copied
     * onto every instance alike (see ClingoSolver::solveBatch). Caching any of them under
     * one instance's hash would surface another call's leftovers -- another instance's
     * batchSize, or its (possibly q<i>_-mangled) warning -- the next time that hash is
     * read, hit or miss, batch or plain solve(). Stripping them here, once, at the single
     * point every batch result enters the cache, is the fix: a later reader never needs to
     * re-zero anything, because the cache itself cannot hold a call-specific value.
     */
    inline SolveResult stripCallSpecific(SolveResult result)
    {
        result.stats.batchSize = 0;
        result.stats.unprefixedAtoms = 0;
        result.logs.clear();
        return result;
    }

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
            .cacheable = true,
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
                data->missResults = solver.solveBatch(batch, data->cacheable);
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
                    // Every miss is inserted into the shared cache under its own hash --
                    // stripped of whatever is a property of this call rather than of the
                    // query's content (see stripCallSpecific) -- before being moved into
                    // its final position in `results` untouched; the cache and the
                    // response each need their own instance either way. Skipped
                    // entirely when the batch itself was not cacheable (see
                    // ClingoSolver::solveBatch's doc comment): every miss's answer would
                    // then be empty because the whole batch failed, not because that is
                    // genuinely each instance's own result, so none of them may be written
                    // into the shared cache.
                    for (size_t k = 0; k < d->missIndices.size(); ++k)
                    {
                        if (d->cacheable)
                        {
                            d->cache.addResult(d->missHashes[k], stripCallSpecific((*d->missResults)[k]));
                        }
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

    struct QueuedBatchCallbackData
    {
        // Every entry here is already a confirmed miss -- ClingoContext::pump() (binding.cc)
        // resolves any cache hit directly, before this is ever spawned, so unlike
        // BatchCallbackData there is no pre-filled `results` to merge into.
        std::optional<std::vector<SolveResult>> missResults;
        bool cacheable = true;
        std::optional<ClingoSolveException> solveException;
        std::string genericError;
        // One Deferred per instance, parallel to `hashes` and `t1s` -- these came from N
        // independent solve() calls the pump coalesced, not from one solveBatch() call, so
        // there is no single array-returning Deferred to share.
        std::vector<Napi::Promise::Deferred> deferreds;
        std::vector<std::chrono::high_resolution_clock::time_point> t1s;
        std::chrono::high_resolution_clock::time_point t2;
        SolveResultCache& cache;
        std::vector<Hash> hashes;
        int totalSize;
        std::function<void()> onSettled;
    };

    /**
     * Submits a batch solve task for a group ClingoContext::pump() assembled from
     * independently-queued solve({ snapshot: true }) calls, rather than one solveBatch()
     * call. Mechanically this is spawnBatchTask's pool work (buildBatch() then
     * ClingoSolver::solveBatch()) -- same renaming, same bridging, same all-or-nothing
     * UNSAT handling -- the only real difference is on the way out: N independent
     * Deferreds are resolved or rejected individually instead of one Deferred resolving to
     * an array, since each came from its own solve() call and each request's own promise
     * must settle on its own. `onSettled` runs exactly once, after every deferred has
     * settled, on every completion path; pump() uses it to release this group's inflight
     * slot and resume the queue (see pump()'s doc comment in binding.cc).
     */
    inline void spawnQueuedBatchTask(
        BS::thread_pool<>& pool,
        SolveResultCache& cache,
        std::shared_ptr<const Snapshot> snapshot,
        std::vector<std::shared_ptr<const Program>> queryLayer,
        std::vector<std::string> queries,
        std::vector<Hash> hashes,
        std::vector<Napi::Promise::Deferred> deferreds,
        std::vector<std::chrono::high_resolution_clock::time_point> t1s,
        std::chrono::high_resolution_clock::time_point t2,
        std::function<void()> onSettled,
        Napi::Env env)
    {
        const int totalSize = static_cast<int>(deferreds.size());
        auto* data = new QueuedBatchCallbackData{
            .missResults = std::nullopt,
            .cacheable = true,
            .solveException = std::nullopt,
            .genericError = {},
            .deferreds = std::move(deferreds),
            .t1s = std::move(t1s),
            .t2 = t2,
            .cache = cache,
            .hashes = hashes,
            .totalSize = totalSize,
            .onSettled = std::move(onSettled),
        };

        auto tsfn = Napi::ThreadSafeFunction::New(
            env,
            Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
            "QueuedBatchCallback",
            0, // unlimited queue
            1  // initial thread count
        );

        pool.detach_task([data,
                          tsfn,
                          snapshot = std::move(snapshot),
                          queryLayer = std::move(queryLayer),
                          queries = std::move(queries),
                          hashes]() mutable {
            try
            {
                BatchQuery batch = buildBatch(snapshot, queryLayer, queries, hashes);
                ClingoSolver solver;
                data->missResults = solver.solveBatch(batch, data->cacheable);
            }
            catch (const ClingoSolveException& e)
            {
                data->solveException = e;
            }
            catch (const std::exception& e)
            {
                data->genericError = e.what();
            }

            tsfn.BlockingCall(data, [](Napi::Env env, Napi::Function, QueuedBatchCallbackData* d) {
                Napi::HandleScope scope(env);
                ScopeExit notifySettled{d->onSettled};

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
                    // The same error value rejects every sibling: they all failed for the
                    // one shared reason (one Control, one grounding attempt), and a JS
                    // rejection reason may be shared across settlements of different
                    // promises like any other value.
                    Napi::Value errorValue = error.Value();
                    for (auto& deferred : d->deferreds)
                    {
                        deferred.Reject(errorValue);
                    }
                }
                else if (!d->genericError.empty())
                {
                    Napi::Value errorValue = Napi::Error::New(env, d->genericError).Value();
                    for (auto& deferred : d->deferreds)
                    {
                        deferred.Reject(errorValue);
                    }
                }
                else
                {
                    // Same cache discipline as spawnBatchTask: every miss is stripped of
                    // its call-specific stats before being cached, under its own hash,
                    // skipped entirely when the batch was not cacheable (see
                    // ClingoSolver::solveBatch's doc comment).
                    for (size_t k = 0; k < d->deferreds.size(); ++k)
                    {
                        SolveResult result = std::move((*d->missResults)[k]);
                        if (d->cacheable)
                        {
                            d->cache.addResult(d->hashes[k], stripCallSpecific(result));
                        }
                        // Each instance's own wait -- it may have queued for longer than
                        // its neighbours before this group was dispatched -- so `glue` is
                        // computed per instance, not shared across the group like
                        // spawnBatchTask's single-Deferred response can afford to.
                        result.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(d->t2 - d->t1s[k]);
                        result.stats.batchSize = d->totalSize;
                        Napi::Object resultObj = create_napi_object_from_solve_result(env, result);
                        d->deferreds[k].Resolve(resultObj);
                    }
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
