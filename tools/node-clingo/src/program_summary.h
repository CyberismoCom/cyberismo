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
#ifndef NODE_CLINGO_PROGRAM_SUMMARY_H
#define NODE_CLINGO_PROGRAM_SUMMARY_H

#include <set>
#include <string>

namespace node_clingo
{
    /**
     * Predicate signatures a program derives (heads) and reads (bodies),
     * as "name/arity", classically negated ones as "-name/arity".
     */
    struct ProgramSummary
    {
        std::set<std::string> heads;
        std::set<std::string> bodies;
    };

    /**
     * Parses a logic program and summarizes it without grounding.
     * Throws ClingoSolveException carrying the parser logs on a syntax error.
     */
    ProgramSummary parse_summary(const std::string& content);
} // namespace node_clingo

#endif // NODE_CLINGO_PROGRAM_SUMMARY_H
