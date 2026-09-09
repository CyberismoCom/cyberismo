/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#include "models.h"

#include <mutex>
#include <sstream>

#include "solve_result_cache.h"

namespace node_clingo
{
    namespace
    {
        // `1 { q(0); q(1); ...; q(n-1) } 1.` -- built as text and parsed, rather than
        // hand-assembled as an Aggregate/Guard/ConditionalLiteral node tree, because the
        // text never depends on anything the caller supplies (just `n`), so there is no
        // real risk a parse failure here is masking a caller bug the way it would for
        // buildBatch's renamed queries; using the ordinary parser sidesteps the exact
        // positional subtleties guard_rules (guard.h) was designed to avoid.
        std::vector<Clingo::AST::Node> buildChoiceRule(size_t n)
        {
            std::ostringstream text;
            text << "1 { ";
            for (size_t i = 0; i < n; ++i)
            {
                if (i > 0)
                {
                    text << "; ";
                }
                text << "q(" << i << ")";
            }
            text << " } 1.";

            std::vector<Clingo::AST::Node> nodes;
            Clingo::AST::parse_string(text.str().c_str(), [&nodes](Clingo::AST::Node node) { nodes.push_back(node); });
            return nodes;
        }
    } // namespace

    ModelsQuery buildModels(
        std::shared_ptr<const Snapshot> snapshot,
        const std::vector<std::shared_ptr<const Program>>& queryLayer,
        const std::vector<std::string>& queries,
        const std::vector<Hash>& hashes)
    {
        const size_t n = queries.size();

        ModelsQuery models;
        models.snapshot = std::move(snapshot);
        models.hashes = hashes;
        models.instances.assign(n, {});
        models.choice = buildChoiceRule(n);

        // A query-layer program that failed to pre-parse would otherwise silently
        // contribute nothing to any instance, unlike a plain solve() -- which falls back to
        // parsing its raw text at ground time and surfaces the real error -- so that case is
        // rejected here, before any instance is ground or cached. One Program::ast_mutex
        // held at a time -- never two at once -- matching groundPrograms()'s replay
        // discipline in clingo_solver.cc.
        for (const auto& program : queryLayer)
        {
            std::lock_guard<std::mutex> lock(program->ast_mutex);
            if (program->ast_nodes.empty() && !program->content.empty())
            {
                throw ClingoSolveException(
                    "solveModels(): query-layer program \"" + program->key + "\" did not parse", {}, program->key);
            }
        }

        // Each query is parsed fresh right here: tryParseToAst() mints brand-new nodes
        // reachable only from this call, so guarding it below needs no lock at all. An
        // empty result for non-empty source text means the query itself failed to parse --
        // rejected up front, same reasoning as the query-layer check above.
        std::vector<std::vector<Clingo::AST::Node>> queryNodes(n);
        for (size_t i = 0; i < n; ++i)
        {
            queryNodes[i] = tryParseToAst(queries[i]);
            if (queryNodes[i].empty() && !queries[i].empty())
            {
                throw ClingoSolveException(
                    "solveModels(): query instance " + std::to_string(i) + " did not parse",
                    {},
                    "q" + std::to_string(i));
            }
        }

        // Copy the query layer once per instance, then guard. Each program's lock is held
        // only for its N copies -- the half that actually touches the shared, stored tree
        // -- and released before guarding any of them: a freshly deep-copied node is
        // exclusively owned by this thread, so guard_rules_in_place needs no lock, and
        // never two Program::ast_mutex are held at once regardless.
        for (const auto& program : queryLayer)
        {
            std::vector<std::vector<Clingo::AST::Node>> copies(n);
            {
                std::lock_guard<std::mutex> lock(program->ast_mutex);
                for (size_t i = 0; i < n; ++i)
                {
                    copies[i] = deep_copy_all(program->ast_nodes);
                }
            }
            for (size_t i = 0; i < n; ++i)
            {
                guard_rules_in_place(copies[i], static_cast<int>(i));
                models.instances[i].insert(
                    models.instances[i].end(),
                    std::make_move_iterator(copies[i].begin()),
                    std::make_move_iterator(copies[i].end()));
            }
        }

        // The query's own guarded nodes come last, matching prepareQuery()'s convention of
        // appending the main program after its referenced categories.
        for (size_t i = 0; i < n; ++i)
        {
            auto guarded = guard_rules(queryNodes[i], static_cast<int>(i));
            models.instances[i].insert(
                models.instances[i].end(),
                std::make_move_iterator(guarded.begin()),
                std::make_move_iterator(guarded.end()));
        }

        return models;
    }
} // namespace node_clingo
