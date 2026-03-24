/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#ifndef NODE_CLINGO_NAPI_HELPERS_H
#define NODE_CLINGO_NAPI_HELPERS_H

#include <napi.h>

#include "solve_result_cache.h"

namespace node_clingo
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

    inline NodeClingoLogs parse_clingo_logs(const Napi::Env& env, const std::vector<ClingoLogMessage>& logMessages)
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

    inline Napi::Object create_napi_object_from_solve_result(const Napi::Env& env, const SolveResult& result)
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
        statsObj.Set("cacheHit", result.stats.cacheHit);
        resultObj.Set("stats", statsObj);

        NodeClingoLogs logs = parse_clingo_logs(env, result.logs);
        resultObj.Set("errors", logs.errors);
        resultObj.Set("warnings", logs.warnings);

        return resultObj;
    }

} // namespace node_clingo

#endif // NODE_CLINGO_NAPI_HELPERS_H
