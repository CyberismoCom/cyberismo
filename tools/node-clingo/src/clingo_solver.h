// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

#ifndef NODE_CLINGO_CLINGO_SOLVER_H
#define NODE_CLINGO_CLINGO_SOLVER_H

#include <sstream>

#include <clingo.hh>

#include "function_handlers.h"
#include "helpers.h"
#include "program_store.h"
#include "solve_result_cache.h"

namespace node_clingo
{

    class ClingoSolver {
      public:
        SolveResult solve(const Query& query);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H
