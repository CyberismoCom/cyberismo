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
     * Predicate signatures the program derives: rule heads only (plain, disjunctive,
     * pooled, or aggregate) and 0-arity constants defined as facts. A #show does *not*
     * define anything by itself, matching the Python oracle (qtools/lpast.py `classify`
     * returns an empty `heads` set for both "show" and "showsig"; qtools/analysis.py
     * `defs` only ever collects rule/fact/constraint heads) -- see rename_predicates,
     * which renames a #show's own term/signature by a different rule.
     */
    std::set<Signature> head_signatures(const std::vector<Clingo::AST::Node>& nodes);

    /**
     * Deep-copies `nodes` and renames every use of a signature in `sigs` -- in atom heads,
     * bodies, aggregates, conditional literals, and pools -- to `prefix + name`. A Function
     * nested inside another term's arguments is plain data, never a predicate use, and is
     * left untouched.
     *
     * A #show is handled differently, matching qtools/lpast.py's `Renamer` with
     * `show_prefix` always equal to `prefix` (as qtools/renaming.py `build_instance`
     * calls it): a `#show term.`'s own Function is prefixed *unconditionally*, whether or
     * not its signature is independently defined -- a #show exposes output naming, not a
     * claim that the program derives it -- while a `#show p/n.` signature is still renamed
     * only when `(p, n)` is in `sigs`.
     *
     * Deep-copying is genuinely recursive over Node/NodeVector children; the one exception
     * is an Optional<Node> (an aggregate's or theory atom's guard), which clingo's
     * deep-copy shares with the original rather than duplicating. That is safe here only
     * because a guard holds a term, never a SymbolicAtom, so renameNode's Optional<Node>
     * branch can never reach a shared node through that path -- true of every real query
     * today (none use aggregate guards), but latent rather than structurally guaranteed.
     *
     * The caller must hold `Program::ast_mutex` (program_store.h) for the duration of this
     * call when `nodes` are shared, stored nodes (as opposed to a freshly-parsed, otherwise
     * unreferenced tree): every `Node::get<Node>`/`NodeVector::operator[]` the traversal
     * performs increments a child's refcount, and that refcount is a plain non-atomic
     * `unsigned` inside clingo's AST representation, not the mutation this function does --
     * the read traversal itself races if another thread touches the same tree concurrently.
     *
     * `prefix` must be non-empty and a legal clingo identifier prefix (lowercase-letter
     * start, `[A-Za-z0-9_]*` after) for the renamed program to parse; the caller (Task 4)
     * is responsible for that, not this function -- an empty prefix silently renames
     * nothing, and an illegal one (e.g. containing `-` or a space) produces unparseable
     * output rather than an error here.
     */
    std::vector<Clingo::AST::Node> rename_predicates(
        const std::vector<Clingo::AST::Node>& nodes,
        const std::set<Signature>& sigs,
        const std::string& prefix);
} // namespace node_clingo

#endif // NODE_CLINGO_AST_RENAME_H
