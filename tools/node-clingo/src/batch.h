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
#ifndef NODE_CLINGO_BATCH_H
#define NODE_CLINGO_BATCH_H

#include <memory>
#include <string>
#include <vector>

#include <clingo.hh>

#include "ast_rename.h"
#include "helpers.h"
#include "program_store.h"
#include "snapshot.h"

namespace node_clingo
{
    /**
     * One physical grounding of N query instances, ready for ClingoSolver::solveBatch().
     * Instance i's predicates are all prefixed with `prefixes[i]`, so grounding every
     * instance together in one Control cannot let one instance's atoms collide with
     * another's.
     */
    struct BatchQuery
    {
        // Committed knowledge snapshot, injected as facts and shared by every instance.
        // buildBatch() always sets this; a snapshot-less batch is not implemented today,
        // though ClingoSolver::solveBatch() accepts one for a future version that does.
        std::shared_ptr<const Snapshot> snapshot;
        // Instance i's renamed query-layer + query nodes, plus that instance's bridge
        // rules (see buildBatch), in solve order.
        std::vector<std::vector<Clingo::AST::Node>> instances;
        // Instance i's predicate prefix ("q0_", "q1_", ...), parallel to `instances`.
        std::vector<std::string> prefixes;
        // Instance i's result-cache hash, exactly as ProgramStore::prepareQuery() would
        // compute it for that instance's query text -- carried through unchanged so the
        // caller can insert ClingoSolver::solveBatch()'s results into the shared cache
        // under the right key without recomputing anything.
        std::vector<Hash> hashes;
    };

    /**
     * Builds a BatchQuery replaying `snapshot`, one instance per entry in `queries`.
     *
     * `queryLayer` is every program the query layer's categories resolve to, in the
     * caller's (deterministic) order. Its combined head signatures -- the predicates it
     * itself defines -- are computed once as `sigsQL`. Each query is freshly parsed with
     * tryParseToAst() (program_store.h): a fresh parse is reachable only from this call, so
     * renaming it needs no lock. Instance i's own signatures are `sigsQL` plus whatever
     * query i itself additionally defines, and instance i's copy of the query layer and its
     * query are both renamed under those signatures with prefix `"q" + i + "_"`.
     *
     * A predicate neither the query layer nor any query defines -- i.e. one only the
     * knowledge/snapshot layer produces -- is left alone and read under its real name by
     * every instance, exactly as solve()'s snapshot replay already does for a single query.
     * A predicate *both* layers define is a different case: every instance's own copy of it
     * is renamed like anything else it defines, which would otherwise make the snapshot's
     * extension of that predicate invisible to the instance (every body reference to it now
     * reads the renamed name, and the snapshot's facts were never renamed). For each such
     * signature this also emits a bridge rule -- `q<i>_p(X0,..,Xn-1) :- p(X0,..,Xn-1).`, or
     * `q<i>_p :- p.` at arity 0 -- appended to that instance's own nodes, giving it back the
     * knowledge-derived atoms under its renamed name. Bridged against `snapshot->signatures`
     * (the knowledge layer's actual *extension*, computed once at commit()), not against
     * which signatures its source merely declares: a knowledge predicate with no atoms this
     * revision needs no bridge, since there is nothing for one to carry.
     *
     * A query (or a stored query-layer program) that fails to parse throws rather than
     * silently contributing nothing to every instance -- `queryNodes[i]` (or a query-layer
     * program's `ast_nodes`) empty when its source text is not itself empty means parsing
     * failed, not that it was legitimately blank.
     *
     * `queryLayer`'s programs are the ProgramStore's shared, stored Program objects --
     * concurrently readable by another worker's plain solve() -- so each is visited with
     * its own Program::ast_mutex held, one program at a time (never two at once), matching
     * groundPrograms()'s replay discipline in clingo_solver.cc: first a pass computing
     * `sigsQL`, then a second pass copying that one program N times under its lock before
     * renaming those N copies (which by then are exclusively owned, needing no lock) and
     * moving to the next program. `hashes` must already be in the same order as `queries`
     * -- the caller computes them via prepareQuery(), which this function does not call
     * itself.
     */
    BatchQuery buildBatch(
        std::shared_ptr<const Snapshot> snapshot,
        const std::vector<std::shared_ptr<const Program>>& queryLayer,
        const std::vector<std::string>& queries,
        const std::vector<Hash>& hashes);
} // namespace node_clingo

#endif // NODE_CLINGO_BATCH_H
