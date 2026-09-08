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
#ifndef NODE_CLINGO_CLINGO_SOLVER_H
#define NODE_CLINGO_CLINGO_SOLVER_H

#include <chrono>
#include <cstdint>
#include <sstream>

#include <clingo.hh>

#include "function_handlers.h"
#include "helpers.h"
#include "program_store.h"
#include "snapshot.h"
#include "solve_result_cache.h"

namespace node_clingo
{
    // The two timestamps solve() and solveKnowledge() both derive add/ground stats from.
    struct GroundTimings
    {
        std::chrono::high_resolution_clock::time_point afterAdd;
        std::chrono::high_resolution_clock::time_point afterGround;
    };

    class ClingoSolver {
      public:
        SolveResult solve(const Query& query);
        // Grounds and solves the knowledge programs alone and returns every atom of the model.
        std::shared_ptr<Snapshot> solveKnowledge(const Query& query, uint64_t revision, Hash knowledgeHash);

      private:
        // Assembles `programs` into control's base part (AST replay, or parse-string fallback
        // for content that did not pre-parse) and grounds it through the registered function
        // handlers. Shared by solve() and solveKnowledge(): both ground a set of stored
        // programs the same way and only differ in how they collect the resulting model.
        GroundTimings groundPrograms(
            Clingo::Control& control,
            const std::vector<std::shared_ptr<const Program>>& programs,
            const Clingo::Logger& logger,
            bool& todayCalled,
            std::string& currentKey);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H
