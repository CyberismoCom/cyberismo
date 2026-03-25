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
    struct ModelCollector : Clingo::SolveEventHandler
    {
        std::vector<std::string>& answers;
        explicit ModelCollector(std::vector<std::string>& initialAnswers) : answers(initialAnswers) {}
        bool on_model(Clingo::Model& model) override
        {
            auto symbols = model.symbols();
            if (symbols.empty())
            {
                answers.push_back("");
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

            answers.push_back(answerStream.str());

            return true;
        }
    };

    SolveResult ClingoSolver::solve(const Query& query)
    {
        std::vector<ClingoLogMessage> logMessages;
        std::vector<std::string> localAnswers;
        bool todayCalled = false;
        std::string currentKey;
        auto timeStart = std::chrono::high_resolution_clock::now();

        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        try
        {
            Clingo::Control control{{}, logger, static_cast<unsigned>(MAX_CLINGO_LOG_MESSAGES)};

            std::vector<Clingo::Part> parts;

            {
                Clingo::AST::with_builder(control, [&](Clingo::AST::ProgramBuilder& builder) {
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
                            Clingo::AST::parse_string(
                                program->content.c_str(),
                                [&builder](Clingo::AST::Node node) { builder.add(node); },
                                logger);
                        }
                    }
                });
            }
            parts.emplace_back("base", Clingo::SymbolSpan{});

            auto timeAfterAdd = std::chrono::high_resolution_clock::now();

            const auto& handlers = node_clingo::get_function_handlers();

            Clingo::GroundCallback ground_cb = [&todayCalled, &handlers](
                                                   Clingo::Location,
                                                   char const* name,
                                                   Clingo::SymbolSpan args,
                                                   Clingo::SymbolSpanCallback symbolCallback) {
                auto it = handlers.find(name);
                if (it != handlers.end())
                {
                    if (std::string(name) == "today")
                    {
                        todayCalled = true;
                    }
                    it->second(args, symbolCallback);
                }
            };

            currentKey.clear();
            control.ground(parts, ground_cb);

            auto timeAfterGround = std::chrono::high_resolution_clock::now();

            ModelCollector collector{localAnswers};

            auto handle = control.solve(Clingo::SymbolicLiteralSpan{}, &collector);
            handle.get();

            auto timeAfterSolve = std::chrono::high_resolution_clock::now();

            return {
                .answers = std::move(localAnswers),
                .logs = std::move(logMessages),
                .stats =
                    {
                        .glue = std::chrono::microseconds(0), // set by the caller
                        .add = std::chrono::duration_cast<std::chrono::microseconds>(timeAfterAdd - timeStart),
                        .ground = std::chrono::duration_cast<std::chrono::microseconds>(timeAfterGround - timeAfterAdd),
                        .solve =
                            std::chrono::duration_cast<std::chrono::microseconds>(timeAfterSolve - timeAfterGround),
                    },
                .valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0,
            };
        }
        catch (const std::exception& e)
        {
            throw ClingoSolveException(e.what(), std::move(logMessages), currentKey);
        }
    }
} // namespace node_clingo
