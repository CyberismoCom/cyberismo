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

#include "batch.h"
#include "function_handlers.h"
#include "helpers.h"
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
        // Grounds and solves every instance in `batch` together, in one Control, and
        // returns one SolveResult per instance, in the same order as `batch.instances`. A
        // batch is only valid -- its per-instance split meaningful -- when no instance is
        // individually unsatisfiable: every instance shares the one Control's single
        // model, so one instance's violated integrity constraint makes the whole Control
        // UNSAT, not just that instance. `cacheable` is set to false on that outcome (every
        // instance's returned answers is empty, but not because that is genuinely its own
        // result) so the caller knows not to insert any of them into the shared,
        // content-addressed result cache -- true is not a promise the batch succeeded, only
        // that per-instance answers, if any, are safe to cache.
        std::vector<SolveResult> solveBatch(const BatchQuery& batch, bool& cacheable);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H
