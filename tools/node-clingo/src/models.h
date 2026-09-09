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
#ifndef NODE_CLINGO_MODELS_H
#define NODE_CLINGO_MODELS_H

#include <memory>
#include <string>
#include <vector>

#include <clingo.hh>

#include "guard.h"
#include "helpers.h"
#include "program_store.h"
#include "snapshot.h"

namespace node_clingo
{
    /**
     * One physical grounding of N query instances, ready for ClingoSolver::solveModels().
     * Unlike the renamed-and-bridged BatchQuery this replaces, every instance keeps its
     * predicates' real names: isolation between instances comes entirely from `choice` (a
     * `1 { q(0); ...; q(N-1) } 1.` cardinality-one choice) and the `q(index)` literal
     * guard_rules() appends to every one of instance `index`'s own rule bodies (see
     * guard.h), so two instances defining the same predicate never collide -- they simply
     * never both hold in the same answer set. Grounding is done exactly once, over the
     * shared knowledge/snapshot facts and one guarded copy of the query layer per instance;
     * solving then enumerates every answer set, and each is read back for the one instance
     * whose `q(i)` it contains (ClingoSolver::solveModels).
     */
    struct ModelsQuery
    {
        // Committed knowledge snapshot, injected as facts and shared by every instance.
        // buildModels() always sets this; a snapshot-less multiplex is not implemented
        // today, though ClingoSolver::solveModels() accepts one for a future version that
        // does (mirrors BatchQuery::snapshot's own doc comment).
        std::shared_ptr<const Snapshot> snapshot;
        // `1 { q(0); q(1); ...; q(N-1) } 1.` -- exactly one instance "chosen" per model.
        // Built by parsing that literal text (see buildModels): hand-assembling an
        // Aggregate/Guard/ConditionalLiteral node tree for a choice construct carries
        // exactly the positional subtleties guard_rules was designed to avoid, and this
        // string never depends on anything the caller supplies, so there is nothing for a
        // parse failure here to actually catch in practice.
        std::vector<Clingo::AST::Node> choice;
        // Instance i's guarded query-layer + query nodes, in solve order.
        std::vector<std::vector<Clingo::AST::Node>> instances;
        // Instance i's result-cache hash, exactly as ProgramStore::prepareQuery() would
        // compute it for that instance's query text -- carried through unchanged so the
        // caller can insert ClingoSolver::solveModels()'s results into the shared cache
        // under the right key without recomputing anything.
        std::vector<Hash> hashes;
    };

    /**
     * Builds a ModelsQuery replaying `snapshot`, one instance per entry in `queries`.
     *
     * `queryLayer` is every program the query layer's categories resolve to, in the
     * caller's (deterministic) order. Each query is freshly parsed with tryParseToAst()
     * (program_store.h): a fresh parse is reachable only from this call, so guarding it
     * needs no lock. Unlike buildBatch (the renaming equivalent this replaces), no
     * signature is ever collected and no bridge rule is ever built: every instance reads
     * every knowledge/snapshot predicate under its real name regardless of whether the
     * instance's own rules also define it, because the instance's own definition of that
     * predicate is only ever true in the answer sets where its own `q(i)` holds.
     *
     * A query (or a stored query-layer program) that fails to parse throws rather than
     * silently contributing nothing to every instance -- same discipline as buildBatch:
     * `queryNodes[i]` (or a query-layer program's `ast_nodes`) empty when its source text
     * is not itself empty means parsing failed, not that it was legitimately blank.
     *
     * `queryLayer`'s programs are the ProgramStore's shared, stored Program objects --
     * concurrently readable by another worker's plain solve() -- so each is visited with
     * its own Program::ast_mutex held, one program at a time (never two at once), matching
     * groundPrograms()'s replay discipline in clingo_solver.cc: first a pass validating
     * every program parsed, then a second pass copying that one program N times under its
     * lock before guarding those N copies (which by then are exclusively owned, needing no
     * lock) and moving to the next program. `hashes` must already be in the same order as
     * `queries` -- the caller computes them via prepareQuery(), which this function does
     * not call itself.
     */
    ModelsQuery buildModels(
        std::shared_ptr<const Snapshot> snapshot,
        const std::vector<std::shared_ptr<const Program>>& queryLayer,
        const std::vector<std::string>& queries,
        const std::vector<Hash>& hashes);
} // namespace node_clingo

#endif // NODE_CLINGO_MODELS_H
