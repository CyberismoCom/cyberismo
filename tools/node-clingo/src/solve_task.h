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

#include <napi.h>

#include "BS_thread_pool.hpp"
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

    struct CommitCallbackData
    {
        std::shared_ptr<Snapshot> result;
        std::optional<ClingoSolveException> solveException;
        std::string genericError;
        Napi::Promise::Deferred deferred;
        std::function<void(std::shared_ptr<const Snapshot>)> onCommitted;
    };

    /**
     * Submits a commit task to the thread pool.
     * The task runs ClingoSolver::solveKnowledge() off the main thread, then marshals the
     * result back via ThreadSafeFunction to resolve/reject the promise. `onCommitted` runs
     * inside that same main-thread callback, right before resolving — so its `this` capture
     * (storing the snapshot on the ClingoContext) is safe: it never runs concurrently with
     * anything else touching the context, and the context outlives the promises it hands out.
     */
    inline void spawnCommitTask(
        BS::thread_pool<>& pool,
        Query query,
        uint64_t revision,
        Hash knowledgeHash,
        Napi::Promise::Deferred deferred,
        Napi::Env env,
        std::function<void(std::shared_ptr<const Snapshot>)> onCommitted)
    {
        auto* data = new CommitCallbackData{
            .result = nullptr,
            .solveException = std::nullopt,
            .genericError = {},
            .deferred = deferred,
            .onCommitted = std::move(onCommitted),
        };

        // could be shared
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
