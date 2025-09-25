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

#include <memory>
#include <sstream>

#include <clingo.h>

#include "function_handlers.h"
#include "helpers.h"
#include "program_store.h"
#include "solve_result_cache.h"

namespace node_clingo
{
    class ClingoSolver {
      private:
        std::vector<ClingoLogMessage> errorMessages;
        std::vector<std::string> answers;

        /**
        * Callback function provided to clingo_control_ground.
        * This function is called by Clingo for each external function encountered during grounding.
        * It looks up the function name in the registered handlers and executes the corresponding handler.
        * @param location Location information (unused).
        * @param name The name of the external function (e.g., "concatenate").
        * @param arguments Array of clingo symbols representing the function arguments.
        * @param arguments_size Number of arguments.
        * @param data User data (unused).
        * @param symbol_callback Callback function to return result symbols to Clingo.
        * @param symbol_callback_data User data for the symbol_callback.
        * @returns True on success, false on error (propagated from the handler).
        */
        static bool ground_callback(
            clingo_location_t const* location,
            char const* name,
            clingo_symbol_t const* arguments,
            size_t arguments_size,
            void* data,
            clingo_symbol_callback_t symbol_callback,
            void* symbol_callback_data);

        /**
        * Callback function provided to clingo_control_solve (via solve_event_callback).
        * This function is called by Clingo for each model (answer set) found.
        * It extracts the symbols from the model, converts them to strings, and stores them.
        * @param model The clingo model object.
        * @param data User data pointer (cast to std::vector<std::string>* to store answers).
        * @param go_on Output parameter; set to true to continue solving, false to stop.
        * @returns True on success, false on error (e.g., allocation failure).
        */
        static bool on_model(clingo_model_t const* model, ClingoSolver* data, bool* go_on);
        /**
        * Wrapper callback for clingo_control_solve.
        * This function receives different types of solve events from Clingo.
        * If the event type is a model (clingo_solve_event_type_model), it calls the on_model handler.
        * @param type The type of the solve event.
        * @param event Pointer to the event data (e.g., clingo_model_t* for models).
        * @param data User data pointer (passed through to on_model).
        * @param go_on Output parameter (passed through to on_model).
        * @returns True on success or if the event is not a model, false on error from on_model.
        */
        static bool solve_event_callback(uint32_t type, void* event, void* data, bool* go_on);
        SolveResult errorResult(const std::string& key = "");

      public:
        ClingoSolver();
        ~ClingoSolver();
        SolveResult solve(const Query& query);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_CLINGO_SOLVER_H