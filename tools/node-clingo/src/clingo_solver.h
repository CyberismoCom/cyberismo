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

#include <sstream>

#include <clingo.hh>

#include "function_handlers.h"
#include "helpers.h"
#include "program_store.h"
#include "solve_result_cache.h"

namespace node_clingo
{

    const int MAX_CLINGO_LOG_MESSAGES = 50;

    class ClingoSolver : public Clingo::SolveEventHandler {
      private:
        std::vector<std::string>* answers = nullptr;
        bool todayCalled = false;

        bool on_model(Clingo::Model& model) override;

      public:
        ClingoSolver() = default;
        ~ClingoSolver() override = default;
        SolveResult solve(const Query& query);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H
