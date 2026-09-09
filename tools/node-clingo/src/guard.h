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
#ifndef NODE_CLINGO_GUARD_H
#define NODE_CLINGO_GUARD_H

#include <vector>

#include <clingo.hh>

namespace node_clingo
{
    /**
     * Deep-copies `nodes` and nothing else. Moved here from the now-deleted ast_rename.h,
     * which needed exactly the same split for the same reason: it lets a caller release
     * Program::ast_mutex as soon as the copies exist, before spending time on whatever it
     * does to them next (see guard_rules_in_place's doc comment below, and buildModels in
     * models.h, which is the only remaining caller that needs the split).
     */
    std::vector<Clingo::AST::Node> deep_copy_all(const std::vector<Clingo::AST::Node>& nodes);

    /**
     * Appends a `q(index)` literal to every Rule's body in `nodes`, in place -- the
     * multiplexing guard that confines a rule's derivations to the answer set where
     * instance `index` was "chosen" by the choice rule solveModels() grounds alongside every
     * instance (see clingo_solver.h). Every other statement type (ShowSignature, ShowTerm,
     * Defined, Program, Comment, ...) is left exactly as it is: none of them have a body to
     * gate, and one appearing once per instance is harmless -- see solveModels' doc comment
     * for why a duplicated #show is idempotent. A rule whose head is a disjunction, a
     * choice, or an aggregate is still just one Rule node with one Body to extend, so this
     * needs no per-head-shape handling at all.
     *
     * This replaces rename_predicates (formerly in ast_rename.h) as the transformation that
     * isolates one multiplexed instance from another. It is a fraction of that function's
     * size because gating happens once, on the rule itself, rather than per occurrence of
     * some predicate name: there is no signature collection, and none of renaming's
     * positional subtleties -- pools, #show terms, conditional literals, aggregate elements,
     * function terms nested in arguments, classical negation -- apply here. Every instance
     * keeps every predicate's real name; isolation comes from the guard literal and the
     * choice rule's cardinality, not from the names being different.
     *
     * `nodes` must already be exclusively owned by the caller (e.g. fresh from
     * deep_copy_all, or a fresh parse) -- calling this directly on a stored program's
     * shared, stored nodes without holding `Program::ast_mutex` (program_store.h) races the
     * same way rename_predicates_in_place's doc comment (formerly in ast_rename.h) warned
     * about: every `Node::get<Node>`/`NodeVector::operator[]` this traversal performs
     * increments a child's refcount, and that refcount is a plain non-atomic `unsigned`
     * inside clingo's AST representation.
     */
    void guard_rules_in_place(std::vector<Clingo::AST::Node>& nodes, int index);

    /**
     * Deep-copies `nodes` and appends a `q(index)` literal to every Rule's body -- the
     * copy-and-guard combo, for a caller (e.g. a freshly-parsed query, reachable only from
     * one thread) that has no shared, stored tree to lock. See guard_rules_in_place above
     * for what "appends a guard literal" means and why nothing else needs to change; the
     * caller must hold `Program::ast_mutex` for the duration of this call when `nodes` are
     * shared, stored nodes, for the same reason as guard_rules_in_place.
     */
    std::vector<Clingo::AST::Node> guard_rules(const std::vector<Clingo::AST::Node>& nodes, int index);
} // namespace node_clingo

#endif // NODE_CLINGO_GUARD_H
