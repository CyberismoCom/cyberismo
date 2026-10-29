// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

#include "validator.h"

#include <clingo.hh>

namespace node_clingo
{
    ValidationResult validate_program(const std::string& content)
    {
        std::vector<ClingoLogMessage> logMessages;
        Clingo::Logger logger = [&logMessages](Clingo::WarningCode code, char const* message) {
            logMessages.push_back({code, code == Clingo::WarningCode::RuntimeError, message});
        };

        bool valid = true;
        try
        {
            // Control::add parses text with this control's own parser and
            // never reaches a stored AST, so concurrent solves are unaffected.
            Clingo::Control control{{}, logger, MAX_CLINGO_LOG_MESSAGES};
            control.add("base", {}, content.c_str());
            // Empty parts: runs rewrite + safety check, skips grounding.
            control.ground({});
        }
        catch (const std::exception& e)
        {
            valid = false;
            bool hasError = false;
            for (const auto& msg : logMessages)
            {
                if (msg.isError)
                {
                    hasError = true;
                    break;
                }
            }
            if (!hasError)
            {
                logMessages.push_back({Clingo::WarningCode::RuntimeError, true, e.what()});
            }
        }
        return {valid, std::move(logMessages)};
    }
} // namespace node_clingo
