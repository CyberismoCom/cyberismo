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
#ifndef NODE_CLINGO_SNAPSHOT_H
#define NODE_CLINGO_SNAPSHOT_H

#include <cstdint>
#include <memory>
#include <mutex>
#include <vector>

#include <clingo.hh>

#include "helpers.h"
#include "solve_result_cache.h"

namespace node_clingo
{
    // Conclusions of the knowledge layer at one revision. `symbols` are interned handles
    // (~8 bytes each); the dominant cost is `fact_nodes` -- each is ~4 AST nodes (Rule,
    // Literal, SymbolicAtom, SymbolicTerm), several hundred bytes and ~8 allocations per
    // atom, so tens of MB at the ~21.6k atoms expected on the real project. Built once so
    // every solve replays them like a pre-parsed program.
    struct Snapshot
    {
        uint64_t revision = 0;
        Hash knowledgeHash = 0; // XXH over the knowledge programs' hashes at commit time
        std::vector<Clingo::Symbol> symbols;
        std::vector<Clingo::AST::Node> fact_nodes;
        // Deliberate insurance, not load-bearing for these node shapes: build_fact_nodes
        // never emits a comparison guard, which is the case in Program::ast_mutex that
        // actually copies a SAST handle during replay (in parseRightGuards). Kept in case
        // fact_nodes' shape or clingo's replay internals change later.
        mutable std::mutex ast_mutex;
        int64_t valid_until = 0; // epoch ms; 0 = no @today involved
        Stats stats{};
    };

    // Ground fact rule: Rule(loc, Literal(loc, NoSign, SymbolicAtom(SymbolicTerm(loc, sym))), []).
    inline std::vector<Clingo::AST::Node> build_fact_nodes(const std::vector<Clingo::Symbol>& symbols)
    {
        using namespace Clingo::AST;
        // clingo interns location filenames (copies the content, not the pointer), so a
        // plain string literal here is just a stable, readable label -- not a lifetime
        // requirement on our end.
        Clingo::Location loc{"<snapshot>", "<snapshot>", 0, 0, 0, 0};
        std::vector<Node> empty_body;
        std::vector<Node> nodes;
        nodes.reserve(symbols.size());
        for (const auto& sym : symbols)
        {
            Node term(Type::SymbolicTerm, loc, sym);
            Node atom(Type::SymbolicAtom, term);
            Node lit(Type::Literal, loc, static_cast<int>(Sign::NoSign), atom);
            nodes.emplace_back(Type::Rule, loc, lit, empty_body);
        }
        return nodes;
    }
} // namespace node_clingo

#endif // NODE_CLINGO_SNAPSHOT_H
