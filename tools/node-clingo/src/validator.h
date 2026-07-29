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
#ifndef NODE_CLINGO_VALIDATOR_H
#define NODE_CLINGO_VALIDATOR_H

#include <string>
#include <vector>

#include "solve_result_cache.h" // ClingoLogMessage

namespace node_clingo
{
    struct ValidationResult
    {
        bool valid;
        std::vector<ClingoLogMessage> logs;
    };

    /**
     * Validates a logic program without grounding or solving.
     * Catches syntax errors (Control::add parses immediately) and safety
     * errors such as unsafe variables (ground with empty parts runs
     * rewrite + check but skips grounding).
     * Never throws on invalid input; diagnostics are returned in logs.
     */
    ValidationResult validate_program(const std::string& content);
} // namespace node_clingo

#endif // NODE_CLINGO_VALIDATOR_H
