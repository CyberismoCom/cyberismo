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
#include "clingo_solver.h"

namespace node_clingo
{

    bool ClingoSolver::ground_callback(
        clingo_location_t const* location,
        char const* name,
        clingo_symbol_t const* arguments,
        size_t arguments_size,
        void* data,
        clingo_symbol_callback_t symbol_callback,
        void* symbol_callback_data)
    {

        // Find the handler for the function and call it
        const auto& handlers = node_clingo::get_function_handlers();

        auto it = handlers.find(name);
        if (it != handlers.end())
        {
            // Mark solver as time dependent when calling the @today handler
            if (it->first == std::string("today"))
            {
                ClingoSolver* solver = static_cast<ClingoSolver*>(data);
                solver->todayCalled = true;
            }
            return it->second(arguments, arguments_size, symbol_callback, symbol_callback_data);
        }

        // If function name not matched, we simply do not handle it
        return true;
    }

    bool ClingoSolver::on_model(clingo_model_t const* model, ClingoSolver* data, bool* go_on)
    {
        if (!model || !data || !go_on)
        {
            return false;
        }

        clingo_symbol_t* atoms = nullptr;
        size_t atoms_size;

        // Get the size of the model
        if (!clingo_model_symbols_size(model, clingo_show_type_shown, &atoms_size))
        {
            return false;
        }

        if (atoms_size == 0)
        {
            data->answers.push_back("");
            *go_on = true;
            return true;
        }

        // Allocate space for the atoms
        try
        {
            atoms = new clingo_symbol_t[atoms_size];
        }
        catch (const std::bad_alloc&)
        {
            return false;
        }

        // Get the model symbols
        if (!clingo_model_symbols(model, clingo_show_type_shown, atoms, atoms_size))
        {
            delete[] atoms;
            return false;
        }

        std::stringstream answerStream;
        bool success = true;

        // Convert each symbol to string
        for (size_t i = 0; i < atoms_size && success; ++i)
        {
            // Get the string representation
            std::string symbolString = node_clingo::get_symbol_string(atoms[i]);

            // If the string is empty, we skip it
            if (symbolString.empty())
            {
                continue;
            }

            if (i > 0)
                answerStream << std::endl;
            answerStream << symbolString;
        }

        try
        {
            data->answers.push_back(answerStream.str());
        }
        catch (const std::bad_alloc&)
        {
            success = false;
        }

        delete[] atoms;
        *go_on = success;
        return success;
    }

    bool ClingoSolver::solve_event_callback(uint32_t type, void* event, void* data, bool* go_on)
    {
        if (!event || !data || !go_on)
        {
            return false;
        }

        if (type == clingo_solve_event_type_model)
        {
            return on_model(static_cast<const clingo_model_t*>(event), static_cast<ClingoSolver*>(data), go_on);
        }
        return true;
    }

    SolveResult ClingoSolver::errorResult(const std::string& key)
    {
        return {
            .isError = true,
            .answers = {},
            .logs = errorMessages,
            .stats =
                {std::chrono::microseconds(0),
                 std::chrono::microseconds(0),
                 std::chrono::microseconds(0),
                 std::chrono::microseconds(0)},
            .key = key};
    }

    SolveResult ClingoSolver::solve(const Query& query)
    {
        errorMessages.clear();
        todayCalled = false;
        auto t1 = std::chrono::high_resolution_clock::now();

        // Initialize Clingo control
        clingo_control_t* ctl = nullptr;
        if (!clingo_control_new(
                nullptr,
                0,
                [](clingo_warning_t code, char const* message, void* data) {
                    // Use data parameter to pass the instance
                    if (data)
                    {
                        static_cast<ClingoSolver*>(data)->errorMessages.push_back(
                            {code, code == clingo_warning_runtime_error, message});
                    }
                },
                this,
                20,
                &ctl))
        {
            return errorResult();
        }

        std::unique_ptr<clingo_control_t, void (*)(clingo_control_t*)> ctl_guard(ctl, clingo_control_free);

        // Create vector to store all parts we need to ground
        std::vector<clingo_part_t> parts;

        for (const auto& program : query.programs)
        {
            if (!clingo_control_add(ctl, program->key.c_str(), nullptr, 0, program->content.c_str()))
            {
                return errorResult(program->key);
            }
            parts.push_back({program->key.c_str(), nullptr, 0});
        }

        auto t2 = std::chrono::high_resolution_clock::now();
        // Ground the program
        if (!clingo_control_ground(ctl, parts.data(), parts.size(), ground_callback, this))
        {
            return errorResult();
        }

        // Solve the program
        answers.clear(); // Use the member variable
        clingo_solve_handle_t* handle = nullptr;

        auto t3 = std::chrono::high_resolution_clock::now();

        // Use clingo_solve_mode_yield to get all answer sets
        if (!clingo_control_solve(ctl, clingo_solve_mode_yield, nullptr, 0, solve_event_callback, this, &handle))
        {
            return errorResult();
        }

        std::unique_ptr<clingo_solve_handle_t, void (*)(clingo_solve_handle_t*)> handle_guard(
            handle, [](clingo_solve_handle_t* h) {
                if (h)
                {
                    clingo_solve_handle_close(h);
                }
            });

        // Wait for solving to finish
        clingo_solve_result_bitset_t clingo_result;
        if (!clingo_solve_handle_get(handle, &clingo_result))
        {
            return errorResult();
        }

        auto t4 = std::chrono::high_resolution_clock::now();

        SolveResult result = {
            .isError = false,
            .answers = answers,
            .logs = errorMessages,
            .stats =
                {
                    .glue = std::chrono::microseconds(0), // set by the caller
                    .add = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1),
                    .ground = std::chrono::duration_cast<std::chrono::microseconds>(t3 - t2),
                    .solve = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t3),
                },
            .key = "",
            .valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0,

        };
        return result;
    }
} // namespace node_clingo
