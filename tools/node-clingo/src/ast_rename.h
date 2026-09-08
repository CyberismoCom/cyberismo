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
#ifndef NODE_CLINGO_AST_RENAME_H
#define NODE_CLINGO_AST_RENAME_H

#include <set>
#include <string>
#include <utility>
#include <vector>

#include <clingo.hh>

namespace node_clingo
{
    // Predicate signature: name and arity, e.g. {"result", 1} for result(K).
    using Signature = std::pair<std::string, int>;

    /**
     * Predicate signatures the program defines: rule heads (plain, disjunctive, pooled,
     * or aggregate), 0-arity constants defined as facts, and #show terms/signatures. A
     * #show exposes a predicate whether or not a rule also derives it, so it is treated as
     * "defined" the same way for renaming purposes.
     */
    std::set<Signature> head_signatures(const std::vector<Clingo::AST::Node>& nodes);

    /**
     * Deep-copies `nodes` and renames every use of a signature in `sigs` -- in atom heads,
     * bodies, aggregates, conditional literals, pools, and #show terms/signatures -- to
     * `prefix + name`. A Function nested inside another term's arguments is plain data,
     * never a predicate use, and is left untouched.
     */
    std::vector<Clingo::AST::Node> rename_predicates(
        const std::vector<Clingo::AST::Node>& nodes,
        const std::set<Signature>& sigs,
        const std::string& prefix);
} // namespace node_clingo

#endif // NODE_CLINGO_AST_RENAME_H
