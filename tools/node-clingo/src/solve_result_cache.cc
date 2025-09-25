/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
#include "solve_result_cache.h"

namespace node_clingo
{
    SolveResultCache::SolveResultCache() {}

    SolveResultCache::~SolveResultCache() {}

    void SolveResultCache::addResult(const node_clingo::Hash& hash, SolveResult&& result)
    {
        results[hash] = std::move(result);
    }

    bool SolveResultCache::result(const Hash& hash, SolveResult& result)
    {
        auto it = results.find(hash);
        if (it != results.end())
        {
            result = it->second;
            return true;
        }
        return false;
    }
} // namespace node_clingo
