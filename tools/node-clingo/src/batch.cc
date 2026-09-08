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
#include "batch.h"

#include <mutex>
#include <set>
#include <utility>

namespace node_clingo
{
    namespace
    {
        using namespace Clingo::AST;

    } // namespace

    BatchQuery buildBatch(
        std::shared_ptr<const Snapshot> snapshot,
        const std::vector<std::shared_ptr<const Program>>& queryLayer,
        const std::vector<std::string>& queries,
        const std::vector<Hash>& hashes)
    {
        const size_t n = queries.size();

        BatchQuery batch;
        batch.snapshot = std::move(snapshot);
        batch.hashes = hashes;
        batch.instances.assign(n, {});
        batch.prefixes.reserve(n);
        for (size_t i = 0; i < n; ++i)
        {
            batch.prefixes.push_back("q" + std::to_string(i) + "_");
        }

        // Pass 1: the query layer's own signatures, shared by every instance. One
        // Program::ast_mutex held at a time -- never two at once -- matching
        // groundPrograms()'s replay discipline in clingo_solver.cc. A query-layer program
        // that failed to parse (empty ast_nodes despite non-empty source) would otherwise
        // silently contribute nothing to any instance, unlike a plain solve() -- which
        // falls back to parsing its raw text at ground time and surfaces the real error --
        // so that case is rejected here instead.
        std::set<Signature> sigsQL;
        for (const auto& program : queryLayer)
        {
            std::lock_guard<std::mutex> lock(program->ast_mutex);
            if (program->ast_nodes.empty() && !program->content.empty())
            {
                throw ClingoSolveException(
                    "solveBatch(): query-layer program \"" + program->key + "\" did not parse", {}, program->key);
            }
            auto sigs = head_signatures(program->ast_nodes);
            sigsQL.insert(sigs.begin(), sigs.end());
        }

        // Each query is parsed fresh right here: tryParseToAst() mints brand-new nodes
        // reachable only from this call, so computing its own signatures and renaming it
        // below need no lock at all. An empty result for non-empty source text means the
        // query itself failed to parse -- rejected up front, same reasoning as the
        // query-layer check above, and before any instance is ground or cached.
        std::vector<std::vector<Clingo::AST::Node>> queryNodes(n);
        std::vector<std::set<Signature>> sigs(n);
        for (size_t i = 0; i < n; ++i)
        {
            queryNodes[i] = tryParseToAst(queries[i]);
            if (queryNodes[i].empty() && !queries[i].empty())
            {
                throw ClingoSolveException(
                    "solveBatch(): query instance " + std::to_string(i) + " did not parse", {}, batch.prefixes[i]);
            }
            sigs[i] = sigsQL;
            auto ownSigs = head_signatures(queryNodes[i]);
            sigs[i].insert(ownSigs.begin(), ownSigs.end());
        }

        // Pass 2: copy the query layer once per instance, then rename. Each program's
        // lock is held only for its N copies -- the half that actually touches the
        // shared, stored tree -- and released before renaming any of them: a freshly
        // deep-copied node is exclusively owned by this thread, so the rename traversal
        // needs no lock, and never two Program::ast_mutex are held at once regardless.
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
                rename_predicates_in_place(copies[i], sigs[i], batch.prefixes[i]);
                batch.instances[i].insert(
                    batch.instances[i].end(),
                    std::make_move_iterator(copies[i].begin()),
                    std::make_move_iterator(copies[i].end()));
            }
        }

        // The query's own renamed nodes come last, matching prepareQuery()'s convention of
        // appending the main program after its referenced categories.
        for (size_t i = 0; i < n; ++i)
        {
            auto renamedQuery = rename_predicates(queryNodes[i], sigs[i], batch.prefixes[i]);
            batch.instances[i].insert(
                batch.instances[i].end(),
                std::make_move_iterator(renamedQuery.begin()),
                std::make_move_iterator(renamedQuery.end()));
        }

        // Layer separation is what makes batching sound: renaming isolates an instance's
        // own predicates, so a predicate the instance defines *and* the committed
        // knowledge layer derives would silently stop unifying with the snapshot's
        // (never renamed) facts. This used to be patched over with a per-instance bridge
        // rule copying the whole knowledge extension under the renamed name, at
        // N x |extension| ground rules. Report it instead: the fix belongs in the
        // program, where the predicate should be written by one layer only.
        if (batch.snapshot)
        {
            for (size_t i = 0; i < n; ++i)
            {
                std::string offenders;
                for (const auto& sig : sigs[i])
                {
                    if (batch.snapshot->signatures.count(sig))
                    {
                        if (!offenders.empty())
                        {
                            offenders += ", ";
                        }
                        offenders += sig.first + "/" + std::to_string(sig.second);
                    }
                }
                if (!offenders.empty())
                {
                    throw ClingoSolveException(
                        "solveBatch(): instance " + std::to_string(i) +
                            " defines predicates the knowledge layer also derives: " + offenders +
                            ". A predicate must be written by one layer only.",
                        {},
                        "");
                }
            }
        }

        return batch;
    }
} // namespace node_clingo
