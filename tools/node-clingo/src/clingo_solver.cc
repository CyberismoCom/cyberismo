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

#include <mutex>

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

    // The timestamps solve() and solveKnowledge() derive add/ground (and, when a snapshot
    // was replayed, inject) stats from. File-local: groundPrograms() touches no
    // ClingoSolver state, so it need not be a member.
    struct GroundTimings
    {
        std::chrono::high_resolution_clock::time_point afterAdd;
        std::chrono::high_resolution_clock::time_point afterGround;
        std::chrono::high_resolution_clock::time_point afterInject;
        bool injected = false;
    };

    // Assembles `programs` into control's base part (AST replay, or parse-string fallback
    // for content that did not pre-parse) and grounds it through the registered function
    // handlers. Shared by solve() and solveKnowledge(): both ground a set of stored
    // programs the same way and only differ in how they collect the resulting model.
    static GroundTimings groundPrograms(
        Clingo::Control& control,
        const std::vector<std::shared_ptr<const Program>>& programs,
        const Clingo::Logger& logger,
        bool& todayCalled,
        std::string& currentKey,
        const Snapshot* snapshot)
    {
        std::vector<Clingo::Part> parts;
        GroundTimings timings;

        Clingo::AST::with_builder(control, [&](Clingo::AST::ProgramBuilder& builder) {
            if (snapshot)
            {
                // No lock: build_fact_nodes() (snapshot.h) only ever emits
                // Rule/Literal(NoSign)/SymbolicAtom/SymbolicTerm nodes, and that shape never
                // reaches clingo's one SAST-copying code path (parseRightGuards, comparison
                // guards only) -- see the comment on build_fact_nodes for the full argument.
                // So replaying the same snapshot from multiple threads at once cannot race.
                for (const auto& node : snapshot->fact_nodes)
                {
                    builder.add(node);
                }
                timings.afterInject = std::chrono::high_resolution_clock::now();
                timings.injected = true;
            }
            for (const auto& program : programs)
            {
                currentKey = program->key;
                if (!program->ast_nodes.empty())
                {
                    // One program at a time, so the fixed visit order
                    // cannot deadlock. See Program::ast_mutex.
                    std::lock_guard<std::mutex> lock(program->ast_mutex);
                    for (const auto& node : program->ast_nodes)
                    {
                        builder.add(node);
                    }
                }
                else
                {
                    // Content that did not pre-parse; its nodes are
                    // local to this call.
                    Clingo::AST::parse_string(
                        program->content.c_str(), [&builder](Clingo::AST::Node node) { builder.add(node); }, logger);
                }
            }
        });
        parts.emplace_back("base", Clingo::SymbolSpan{});

        timings.afterAdd = std::chrono::high_resolution_clock::now();

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

        timings.afterGround = std::chrono::high_resolution_clock::now();
        return timings;
    }

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
            Clingo::Control control{{}, logger, MAX_CLINGO_LOG_MESSAGES};

            GroundTimings timings =
                groundPrograms(control, query.programs, logger, todayCalled, currentKey, query.snapshot.get());

            ModelCollector collector{localAnswers};

            auto handle = control.solve(Clingo::SymbolicLiteralSpan{}, &collector);
            handle.get();

            auto timeAfterSolve = std::chrono::high_resolution_clock::now();

            // The snapshot may itself carry a @today-derived expiry from commit() time;
            // whichever of the two (this solve's own, the snapshot's) expires first wins.
            int64_t valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0;
            if (query.snapshot && query.snapshot->valid_until > 0 &&
                (valid_until == 0 || query.snapshot->valid_until < valid_until))
            {
                valid_until = query.snapshot->valid_until;
            }

            // Attributable sub-portion of `add`: how long replaying the snapshot's
            // fact_nodes took, isolated from the query layer's own add time. Zero off the
            // snapshot path.
            std::chrono::microseconds inject =
                timings.injected
                    ? std::chrono::duration_cast<std::chrono::microseconds>(timings.afterInject - timeStart)
                    : std::chrono::microseconds::zero();

            return {
                .answers = std::move(localAnswers),
                .logs = std::move(logMessages),
                .stats =
                    {
                        .glue = std::chrono::microseconds(0), // set by the caller
                        .add = std::chrono::duration_cast<std::chrono::microseconds>(timings.afterAdd - timeStart),
                        .ground = std::chrono::duration_cast<std::chrono::microseconds>(
                            timings.afterGround - timings.afterAdd),
                        .solve =
                            std::chrono::duration_cast<std::chrono::microseconds>(timeAfterSolve - timings.afterGround),
                        .inject = inject,
                    },
                .valid_until = valid_until,
            };
        }
        catch (const std::exception& e)
        {
            throw ClingoSolveException(e.what(), std::move(logMessages), currentKey);
        }
    }

    // One model is enough: the knowledge layer is stratified (facts + calculations, no
    // disjunction or choice), so grounding it always yields exactly one answer set.
    struct SymbolCollector : Clingo::SolveEventHandler
    {
        std::vector<Clingo::Symbol> symbols;
        bool on_model(Clingo::Model& model) override
        {
            // All, not Atoms: ignores any #show in the knowledge layer, so every derived
            // atom is captured regardless of visibility. Assumes the knowledge category has
            // no `#show <term> : ...` directive -- such a term would land in `symbols` (and
            // then in `fact_nodes`) as if it were itself a fact.
            auto syms = model.symbols(Clingo::ShowType::All);
            symbols.assign(syms.begin(), syms.end());
            return false;
        }
    };

    std::shared_ptr<Snapshot> ClingoSolver::solveKnowledge(const Query& query, uint64_t revision, Hash knowledgeHash)
    {
        std::vector<ClingoLogMessage> logMessages;
        bool todayCalled = false;
        std::string currentKey;
        auto timeStart = std::chrono::high_resolution_clock::now();

        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };
        try
        {
            Clingo::Control control{{}, logger, MAX_CLINGO_LOG_MESSAGES};

            GroundTimings timings = groundPrograms(control, query.programs, logger, todayCalled, currentKey, nullptr);

            SymbolCollector collector;
            Clingo::SolveResult result = control.solve(Clingo::SymbolicLiteralSpan{}, &collector).get();

            // An UNSAT knowledge layer (e.g. a violated integrity constraint) never calls
            // on_model, so `collector.symbols` would silently stay empty. Reject instead of
            // handing solve() an empty-but-"successful" snapshot to replay.
            if (!result.is_satisfiable())
            {
                throw ClingoSolveException(
                    "commit(): the knowledge layer is unsatisfiable", std::move(logMessages), currentKey);
            }

            auto timeAfterSolve = std::chrono::high_resolution_clock::now();

            auto snap = std::make_shared<Snapshot>();
            snap->revision = revision;
            snap->knowledgeHash = knowledgeHash;
            snap->symbols = std::move(collector.symbols);
            snap->fact_nodes = build_fact_nodes(snap->symbols);
            snap->valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0;
            snap->stats = {
                .glue = std::chrono::microseconds(0),
                .add = std::chrono::duration_cast<std::chrono::microseconds>(timings.afterAdd - timeStart),
                .ground = std::chrono::duration_cast<std::chrono::microseconds>(timings.afterGround - timings.afterAdd),
                .solve = std::chrono::duration_cast<std::chrono::microseconds>(timeAfterSolve - timings.afterGround),
            };
            return snap;
        }
        catch (const ClingoSolveException&)
        {
            // Already fully formed (the UNSAT check above). Let it propagate as-is: the
            // generic handler below would re-wrap it from e.what() and lose the log
            // messages, which were already moved out of `logMessages` by the first throw.
            throw;
        }
        catch (const std::exception& e)
        {
            throw ClingoSolveException(e.what(), std::move(logMessages), currentKey);
        }
    }

    // Reads one shared, multiplexed model back into whichever instance's `q(i)` it
    // contains. Every instance keeps its predicates' real names (see guard.h), so unlike
    // the deleted BatchCollector there is no demangling to do: this only has to find the
    // one `q(i)` a model contains -- guaranteed unique by the choice rule's cardinality --
    // and print its shown symbols verbatim, exactly as a solo solve() would for that
    // instance alone.
    //
    // At most one answer is kept per instance (the `seen` guard), matching a plain solve()'s
    // own truncation to its Control's first model: this Control enumerates with
    // `--models=0` so every instance's branch is reached, but a legitimately
    // non-stratified instance program could otherwise report more models than a solo
    // solve() of the same text ever would (see solveModels' doc comment in
    // clingo_solver.h). Real query content is stratified below the guard, so this only
    // matters as a defensive bound.
    struct ModelsCollector : Clingo::SolveEventHandler
    {
        size_t n;
        std::vector<bool> seen;
        size_t seenCount = 0;
        std::vector<std::vector<std::string>>& answers; // one vector per instance

        ModelsCollector(size_t n_, std::vector<std::vector<std::string>>& answers_)
            : n(n_), seen(n_, false), answers(answers_)
        {
        }

        bool on_model(Clingo::Model& model) override
        {
            for (size_t i = 0; i < n; ++i)
            {
                if (seen[i] || !model.contains(Clingo::Function("q", {Clingo::Number(static_cast<int>(i))})))
                {
                    continue;
                }
                seen[i] = true;
                ++seenCount;

                std::ostringstream answerStream;
                for (auto sym : model.symbols())
                {
                    std::string symbolString = sym.to_string();
                    if (symbolString.empty())
                    {
                        continue;
                    }
                    if (answerStream.tellp() > 0)
                    {
                        answerStream << std::endl;
                    }
                    answerStream << symbolString;
                }
                answers[i].push_back(answerStream.str());
                break; // the choice rule guarantees exactly one q(i) per model
            }
            // Stop as soon as every instance has an answer -- nothing left to learn from
            // further enumeration. If some instance's `q(i)` can never be chosen (that
            // instance is individually unsatisfiable), this keeps returning true until the
            // search is exhausted; see solveModels' doc comment for why that instance's own
            // empty answer is still correct in that case.
            return seenCount < n;
        }
    };

    std::vector<SolveResult> ClingoSolver::solveModels(const ModelsQuery& models)
    {
        std::vector<ClingoLogMessage> logMessages;
        bool todayCalled = false;
        std::string currentKey;
        auto timeStart = std::chrono::high_resolution_clock::now();
        const size_t n = models.instances.size();
        std::vector<std::vector<std::string>> perInstanceAnswers(n);

        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        try
        {
            // "--models=0": enumerate every answer set instead of stopping at the first,
            // since each instance's own answer lives in a different one. Set as a Control
            // constructor argument -- the same clasp/gringo command-line flag the
            // standalone `clingo` binary takes -- rather than through
            // control.configuration(): this is the only setting this Control needs beyond
            // its defaults, so reaching into the configuration tree would only add code for
            // no benefit. This is a property of *this* Control alone: solve()'s and
            // solveKnowledge()'s own Controls are still built with no args, so clasp's
            // default of exactly one model, meaning a non-stratified plain query still
            // returns just its first model, unaffected by this change.
            Clingo::Control control{{"--models=0"}, logger, MAX_CLINGO_LOG_MESSAGES};

            // The choice rule and every instance's already-guarded nodes are each wrapped
            // as an ephemeral, exclusively-owned Program so groundPrograms() can replay
            // them exactly like any other stored program. Their per-program mutexes are
            // uncontended here -- nothing else can reach these nodes -- so this adds no
            // real locking cost, and lets solveModels() share groundPrograms() rather than
            // duplicate its replay and grounding logic.
            std::vector<std::shared_ptr<const Program>> assembled;
            assembled.reserve(n + 1);
            assembled.push_back(
                std::make_shared<const Program>("__choice__", std::string(), models.choice, std::vector<KeyHash>(), 0));
            for (size_t i = 0; i < n; ++i)
            {
                assembled.push_back(
                    std::make_shared<const Program>(
                        "q" + std::to_string(i), std::string(), models.instances[i], std::vector<KeyHash>(), 0));
            }

            GroundTimings timings =
                groundPrograms(control, assembled, logger, todayCalled, currentKey, models.snapshot.get());

            ModelsCollector collector{n, perInstanceAnswers};
            // yield=false: with the default yield=true, SolveHandle::get() returns as soon
            // as the *first* model is yielded (clingo.h's own doc comment on
            // clingo_solve_handle_get: "when yielding[,] ... the result will be satisfiable
            // but neither the search exhausted nor the optimality proven"), which is
            // invisible everywhere else in this file because solve() and solveKnowledge()
            // only ever want one model, and clasp's default `--models=1` makes that first
            // yield the final one anyway. This Control enumerates with `--models=0`, so
            // yield=false is required to make get() actually block until every model
            // has been handed to the collector's on_model and the search is exhausted.
            control.solve(Clingo::SymbolicLiteralSpan{}, &collector, /*asynchronous=*/false, /*yield=*/false).get();

            auto timeAfterSolve = std::chrono::high_resolution_clock::now();

            int64_t valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0;
            if (models.snapshot && models.snapshot->valid_until > 0 &&
                (valid_until == 0 || models.snapshot->valid_until < valid_until))
            {
                valid_until = models.snapshot->valid_until;
            }

            std::chrono::microseconds inject =
                timings.injected
                    ? std::chrono::duration_cast<std::chrono::microseconds>(timings.afterInject - timeStart)
                    : std::chrono::microseconds::zero();
            std::chrono::microseconds add =
                std::chrono::duration_cast<std::chrono::microseconds>(timings.afterAdd - timeStart);
            std::chrono::microseconds ground =
                std::chrono::duration_cast<std::chrono::microseconds>(timings.afterGround - timings.afterAdd);
            std::chrono::microseconds solveTime =
                std::chrono::duration_cast<std::chrono::microseconds>(timeAfterSolve - timings.afterGround);

            // Every instance's answer is genuinely its own: an instance with no model (its
            // `q(i)` was never satisfiable) correctly gets `[]`, exactly like a solo
            // solve() of that instance alone would -- there is no batch-wide failure mode
            // here the way an all-instances-share-one-model batch had, so every result
            // below is safe to cache under its own hash regardless of what happened to any
            // other instance (see solveModels' doc comment in clingo_solver.h).
            std::vector<SolveResult> results;
            results.reserve(n);
            for (size_t i = 0; i < n; ++i)
            {
                results.push_back({
                    .answers = std::move(perInstanceAnswers[i]),
                    .logs = logMessages,
                    .stats =
                        {
                            .glue = std::chrono::microseconds(0), // set by the caller
                            .add = add,
                            .ground = ground,
                            .solve = solveTime,
                            .inject = inject,
                            .cacheHit = false,
                            .batchSize = static_cast<int>(n),
                        },
                    .valid_until = valid_until,
                });
            }
            return results;
        }
        catch (const std::exception& e)
        {
            throw ClingoSolveException(e.what(), std::move(logMessages), currentKey);
        }
    }
} // namespace node_clingo
