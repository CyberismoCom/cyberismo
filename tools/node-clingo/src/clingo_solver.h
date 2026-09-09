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

#include <cstdint>
#include <sstream>

#include <clingo.hh>

#include "function_handlers.h"
#include "helpers.h"
#include "models.h"
#include "program_store.h"
#include "snapshot.h"
#include "solve_result_cache.h"

namespace node_clingo
{
    class ClingoSolver {
      public:
        SolveResult solve(const Query& query);
        // Grounds and solves the knowledge programs alone and returns every atom of the model.
        std::shared_ptr<Snapshot> solveKnowledge(const Query& query, uint64_t revision, Hash knowledgeHash);
        // Grounds `models` (the shared knowledge/snapshot facts, the choice rule, and every
        // instance's guarded rules) exactly once and solves it enumerating every answer
        // set, returning one SolveResult per instance, in the same order as
        // `models.instances`. Unlike the renamed-and-bridged batch this replaces, one
        // instance being individually unsatisfiable cannot affect its siblings: its `q(i)`
        // is simply never chosen in any answer set, so that instance alone gets an empty
        // answer (no ClingoSolveException, no cache poisoning) while every other instance's
        // own answer set is solved and read back normally -- there is no batch-wide failure
        // mode left for a caller to guard against, so unlike solveBatch this takes no
        // `cacheable` out-parameter: every returned SolveResult is always safe to cache
        // under its own instance's hash.
        std::vector<SolveResult> solveModels(const ModelsQuery& models);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H
