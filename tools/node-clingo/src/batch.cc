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
        // groundPrograms()'s replay discipline in clingo_solver.cc.
        std::set<Signature> sigsQL;
        for (const auto& program : queryLayer)
        {
            std::lock_guard<std::mutex> lock(program->ast_mutex);
            auto sigs = head_signatures(program->ast_nodes);
            sigsQL.insert(sigs.begin(), sigs.end());
        }

        // Each query is parsed fresh right here: tryParseToAst() mints brand-new nodes
        // reachable only from this call, so computing its own signatures and renaming it
        // below need no lock at all.
        std::vector<std::vector<Clingo::AST::Node>> queryNodes(n);
        std::vector<std::set<Signature>> sigs(n);
        for (size_t i = 0; i < n; ++i)
        {
            queryNodes[i] = tryParseToAst(queries[i]);
            sigs[i] = sigsQL;
            auto ownSigs = head_signatures(queryNodes[i]);
            sigs[i].insert(ownSigs.begin(), ownSigs.end());
        }

        // Pass 2: rename the query layer once per instance. Each program's lock is held
        // for all N renames of that one program, then released before the next program --
        // still never two Program::ast_mutex held at once.
        for (const auto& program : queryLayer)
        {
            std::lock_guard<std::mutex> lock(program->ast_mutex);
            for (size_t i = 0; i < n; ++i)
            {
                auto renamed = rename_predicates(program->ast_nodes, sigs[i], batch.prefixes[i]);
                batch.instances[i].insert(
                    batch.instances[i].end(),
                    std::make_move_iterator(renamed.begin()),
                    std::make_move_iterator(renamed.end()));
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

        return batch;
    }
} // namespace node_clingo
