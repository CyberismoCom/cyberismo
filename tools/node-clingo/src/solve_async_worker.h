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
#ifndef NODE_CLINGO_SOLVE_ASYNC_WORKER_H
#define NODE_CLINGO_SOLVE_ASYNC_WORKER_H

#include <chrono>
#include <optional>

#include <napi.h>

#include "clingo_solver.h"
#include "napi_helpers.h"
#include "solve_result_cache.h"

extern bool g_cacheEnabled;

namespace node_clingo
{

    class SolveAsyncWorker : public Napi::AsyncWorker {
      public:
        SolveAsyncWorker(
            Napi::Env env,
            Query query,
            std::chrono::high_resolution_clock::time_point t1,
            std::chrono::high_resolution_clock::time_point t2,
            SolveResultCache& cache)
            : Napi::AsyncWorker(env),
              m_deferred(Napi::Promise::Deferred::New(env)),
              m_query(std::move(query)),
              m_t1(t1),
              m_t2(t2),
              m_cache(cache)
        {
        }

        Napi::Promise::Deferred& Deferred() { return m_deferred; }

        void Execute() override
        {
            try
            {
                ClingoSolver solver;
                m_result = solver.solve(m_query);
            }
            catch (const ClingoSolveException& e)
            {
                // Store structured error for OnOK to handle (SetError only takes a string)
                m_solveException = e;
            }
            catch (const std::exception& e)
            {
                SetError(e.what());
            }
        }

        void OnOK() override
        {
            Napi::HandleScope scope(Env());

            if (m_solveException)
            {
                // Build the same detailed error that throw_solve_error produces
                Napi::Error error = Napi::Error::New(Env(), m_solveException->what());

                Napi::Object errorObj = Napi::Object::New(Env());
                NodeClingoLogs logs = parse_clingo_logs(Env(), m_solveException->logs);
                errorObj.Set("errors", logs.errors);
                errorObj.Set("warnings", logs.warnings);
                if (!m_solveException->programKey.empty())
                {
                    errorObj.Set("program", Napi::String::New(Env(), m_solveException->programKey));
                }
                error.Set("details", errorObj);

                m_deferred.Reject(error.Value());
                return;
            }

            // Set glue timing (main-thread prep time)
            m_result->stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(m_t2 - m_t1);

            Napi::Object resultObj = create_napi_object_from_solve_result(Env(), *m_result);
            if (g_cacheEnabled)
            {
                m_cache.addResult(m_query.hash, std::move(*m_result));
            }

            m_deferred.Resolve(resultObj);
        }

        void OnError(const Napi::Error& error) override
        {
            m_deferred.Reject(error.Value());
        }

      private:
        Napi::Promise::Deferred m_deferred;
        Query m_query;
        std::chrono::high_resolution_clock::time_point m_t1;
        std::chrono::high_resolution_clock::time_point m_t2;
        SolveResultCache& m_cache;

        std::optional<SolveResult> m_result;
        std::optional<ClingoSolveException> m_solveException;
    };

} // namespace node_clingo

#endif // NODE_CLINGO_SOLVE_ASYNC_WORKER_H
