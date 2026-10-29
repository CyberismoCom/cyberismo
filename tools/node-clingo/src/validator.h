// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
