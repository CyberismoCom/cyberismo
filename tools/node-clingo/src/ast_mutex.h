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
#ifndef NODE_CLINGO_AST_MUTEX_H
#define NODE_CLINGO_AST_MUTEX_H

#include <mutex>

namespace node_clingo
{
    /**
     * Serializes clingo's AST parse/load phases across threads.
     *
     * Clingo AST nodes use non-atomic intrusive refcounts (astv2.hh), and the
     * solve-time AST walk is not read-only: parseRightGuards in clingo's
     * astv2_parse.cc copies SAST handles of comparison-guard terms by value,
     * so concurrent builder.add() walks over the same pre-parsed nodes corrupt
     * refcounts (eventual SIGSEGV). The symbol table itself is internally
     * mutex-protected in the pinned clingo.
     *
     * Hold this mutex around every AST parse/load phase (solver AST loading,
     * pre-parsing in the program store, program validation); the expensive
     * ground() and solve() steps still run concurrently.
     */
    std::mutex& ast_mutex();
} // namespace node_clingo

#endif // NODE_CLINGO_AST_MUTEX_H
