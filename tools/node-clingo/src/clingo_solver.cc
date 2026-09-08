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

    // Splits one shared model back out per instance by the predicate prefix
    // buildBatch() (batch.h) gave it. No "q<i>_" prefix can ever be a genuine string-prefix
    // of another "q<j>_" -- the two only ever agree up through the digits they share, and
    // the shorter one's very next character is its terminating '_', which the longer one
    // instead continues with a digit -- so matching prefixes in any fixed order is
    // unambiguous; this checks them in `prefixes`' own order.
    struct BatchCollector : Clingo::SolveEventHandler
    {
        const std::vector<std::string>& prefixes;
        std::vector<std::string>& answers; // one entry appended per instance, in order
        size_t& unprefixedAtoms;

        BatchCollector(
            const std::vector<std::string>& prefixes_,
            std::vector<std::string>& answers_,
            size_t& unprefixedAtoms_)
            : prefixes(prefixes_), answers(answers_), unprefixedAtoms(unprefixedAtoms_)
        {
        }

        // `started` is `char`, not `bool`: std::vector<bool> is a bitset whose
        // `operator[]` returns a proxy, not a real `bool&`, so it cannot bind to this
        // out-param.
        static void appendLine(std::ostringstream& out, char& started, const std::string& text)
        {
            if (started)
            {
                out << '\n';
            }
            out << text;
            started = 1;
        }

        bool on_model(Clingo::Model& model) override
        {
            std::vector<std::ostringstream> perInstance(prefixes.size());
            std::vector<char> started(prefixes.size(), 0);

            for (auto sym : model.symbols())
            {
                if (sym.type() != Clingo::SymbolType::Function)
                {
                    // The query layer's own #show set is Function-only (see batch.h's
                    // doc comment on buildBatch); a shown non-Function term does not occur
                    // in real content.
                    continue;
                }

                std::string_view name = sym.name();
                bool matched = false;
                for (size_t i = 0; i < prefixes.size(); ++i)
                {
                    const std::string& prefix = prefixes[i];
                    if (name.size() > prefix.size() && name.compare(0, prefix.size(), prefix) == 0)
                    {
                        // Re-created under its original name so to_string() prints exactly
                        // what an unrenamed, single solve would print.
                        Clingo::Symbol original = Clingo::Function(
                            std::string(name.substr(prefix.size())).c_str(), sym.arguments(), sym.is_positive());
                        appendLine(perInstance[i], started[i], original.to_string());
                        matched = true;
                        break;
                    }
                }

                if (!matched)
                {
                    // Never renamed by any instance -- a shared, knowledge/snapshot-derived
                    // atom. Broadcast unchanged to every instance rather than dropped,
                    // matching qtools/renaming.py's demangle().
                    ++unprefixedAtoms;
                    std::string printed = sym.to_string();
                    for (size_t i = 0; i < perInstance.size(); ++i)
                    {
                        appendLine(perInstance[i], started[i], printed);
                    }
                }
            }

            for (auto& out : perInstance)
            {
                answers.push_back(out.str());
            }
            return false; // One model expected -- see ClingoSolver::solveBatch below.
        }
    };

    std::vector<SolveResult> ClingoSolver::solveBatch(const BatchQuery& batch)
    {
        std::vector<ClingoLogMessage> logMessages;
        std::vector<std::string> answers;
        size_t unprefixedAtoms = 0;
        bool todayCalled = false;
        std::string currentKey;
        auto timeStart = std::chrono::high_resolution_clock::now();
        const size_t n = batch.instances.size();

        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        try
        {
            Clingo::Control control{{}, logger, MAX_CLINGO_LOG_MESSAGES};

            // Each instance's already-renamed nodes are wrapped as an ephemeral,
            // exclusively-owned Program so groundPrograms() can replay them exactly like
            // any other stored program. Its per-program mutex is uncontended here --
            // nothing else can reach these nodes -- so this adds no real locking cost, and
            // lets solveBatch() share groundPrograms() rather than duplicate its replay and
            // grounding logic.
            std::vector<std::shared_ptr<const Program>> assembled = batch.shared;
            assembled.reserve(assembled.size() + n);
            for (size_t i = 0; i < n; ++i)
            {
                assembled.push_back(
                    std::make_shared<const Program>(
                        batch.prefixes[i], std::string(), batch.instances[i], std::vector<KeyHash>(), 0));
            }

            GroundTimings timings =
                groundPrograms(control, assembled, logger, todayCalled, currentKey, batch.snapshot.get());

            BatchCollector collector{batch.prefixes, answers, unprefixedAtoms};
            Clingo::SolveResult outcome = control.solve(Clingo::SymbolicLiteralSpan{}, &collector).get();

            auto timeAfterSolve = std::chrono::high_resolution_clock::now();

            int64_t valid_until = todayCalled ? next_local_midnight_epoch_ms() : 0;
            if (batch.snapshot && batch.snapshot->valid_until > 0 &&
                (valid_until == 0 || batch.snapshot->valid_until < valid_until))
            {
                valid_until = batch.snapshot->valid_until;
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

            // An UNSAT batch (or one where on_model was somehow never reached) has nothing
            // to split per instance; every instance gets the same empty answer a plain
            // solve() reports for an unsatisfiable query, rather than an out-of-bounds read.
            bool satisfiable = outcome.is_satisfiable() && answers.size() == n;

            std::vector<SolveResult> results;
            results.reserve(n);
            for (size_t i = 0; i < n; ++i)
            {
                results.push_back({
                    .answers = satisfiable ? std::vector<std::string>{answers[i]} : std::vector<std::string>{},
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
                            .unprefixedAtoms = unprefixedAtoms,
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
