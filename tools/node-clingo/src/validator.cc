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
#include "validator.h"

#include <mutex>

#include <clingo.hh>

#include "clingo_solver.h" // ast_mutex, MAX_CLINGO_LOG_MESSAGES

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
            std::lock_guard<std::mutex> lock(ast_mutex());
            Clingo::Control control{{}, logger, static_cast<unsigned>(MAX_CLINGO_LOG_MESSAGES)};
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
