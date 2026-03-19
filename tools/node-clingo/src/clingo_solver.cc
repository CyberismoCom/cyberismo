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

    bool ClingoSolver::on_model(Clingo::Model& model)
    {
        auto symbols = model.symbols();

        if (symbols.empty())
        {
            answers->push_back("");
            return true;
        }

        std::stringstream answerStream;

        for (size_t i = 0; i < symbols.size(); ++i)
        {
            std::string symbolString = symbols[i].to_string();

            if (symbolString.empty())
            {
                continue;
            }

            if (i > 0)
            {
                answerStream << std::endl;
            }
            answerStream << symbolString;
        }

        answers->push_back(answerStream.str());

        return true;
    }

    SolveResult ClingoSolver::solve(const Query& query)
    {
        std::vector<ClingoLogMessage> logMessages;
        std::vector<std::string> localAnswers;
        answers = &localAnswers;
        todayCalled = false;
        std::string currentKey;
        auto t1 = std::chrono::high_resolution_clock::now();

        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        try
        {
            Clingo::Control ctl{{}, logger, static_cast<unsigned>(MAX_CLINGO_LOG_MESSAGES)};

            std::vector<Clingo::Part> parts;

            Clingo::AST::with_builder(ctl, [&](Clingo::AST::ProgramBuilder& builder) {
                for (const auto& program : query.programs)
                {
                    currentKey = program->key;
                    if (!program->ast_nodes.empty())
                    {
                        for (const auto& node : program->ast_nodes)
                        {
                            builder.add(node);
                        }
                    }
                    else
                    {
                        Clingo::AST::parse_string(program->content.c_str(),
                            [&builder](Clingo::AST::Node node) {
                                builder.add(node);
                            });
                    }
                }
            });
            parts.emplace_back("base", Clingo::SymbolSpan{});

            auto t2 = std::chrono::high_resolution_clock::now();

            const auto& handlers = node_clingo::get_function_handlers();

            Clingo::GroundCallback ground_cb = [this, &handlers](
                                                   Clingo::Location, char const* name, Clingo::SymbolSpan args,
                                                   Clingo::SymbolSpanCallback cb) {
                auto it = handlers.find(name);
                if (it != handlers.end())
                {
                    if (std::string(name) == "today")
                    {
                        todayCalled = true;
                    }
                    it->second(args, cb);
                }
            };

            currentKey.clear();
            ctl.ground(parts, ground_cb);

            localAnswers.clear();
            auto t3 = std::chrono::high_resolution_clock::now();

            auto handle = ctl.solve(Clingo::SymbolicLiteralSpan{}, this);
            handle.get();

            auto t4 = std::chrono::high_resolution_clock::now();

            answers = nullptr;
            return {
                .answers = std::move(localAnswers),
                .logs = std::move(logMessages),
                .stats =
                    {
                        .glue = std::chrono::microseconds(0), // set by the caller
                        .add = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1),
                        .ground = std::chrono::duration_cast<std::chrono::microseconds>(t3 - t2),
                        .solve = std::chrono::duration_cast<std::chrono::microseconds>(t4 - t3),
                    },
                .valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0,
            };
        }
        catch (const std::exception& e)
        {
            answers = nullptr;
            throw ClingoSolveException(e.what(), std::move(logMessages), currentKey);
        }
    }
} // namespace node_clingo
