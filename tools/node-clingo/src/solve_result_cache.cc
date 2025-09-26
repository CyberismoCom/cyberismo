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

    std::size_t SolveResultCache::estimateSizeBytes(const SolveResult& r)
    {
        // rough estimate
        std::size_t size = sizeof(SolveResult);
        size += r.key.capacity();
        size += sizeof(std::string) * r.answers.capacity();
        for (const auto& s : r.answers)
            size += s.capacity();
        size += sizeof(ClingoLogMessage) * r.logs.capacity();
        for (const auto& m : r.logs)
            size += m.message.capacity();
        size += VECTOR_OVERHEAD_BYTES * 2;
        return size;
    }

    void SolveResultCache::addResult(const node_clingo::Hash& hash, SolveResult&& result)
    {
        // If exists, remove first to reinsert and update size/LRU
        auto it = entries.find(hash);
        if (it != entries.end())
        {
            currentBytes -= it->second.sizeBytes;
            lru.erase(it->second.lruIt);
            entries.erase(it);
        }

        std::size_t bytes = estimateSizeBytes(result);

        if (bytes > CACHE_CAPACITY_BYTES)
        {
            return;
        }
        // make space for the new result
        while (currentBytes + bytes > CACHE_CAPACITY_BYTES && !lru.empty())
        {
            Hash evictHash = lru.back();
            lru.pop_back();
            auto ev = entries.find(evictHash);
            if (ev != entries.end())
            {
                currentBytes -= ev->second.sizeBytes;
                entries.erase(ev);
            }
        }

        // add the new result
        lru.push_front(hash);
        Entry entry{
            .result = std::move(result),
            .sizeBytes = bytes,
            .lruIt = lru.begin(),
        };
        currentBytes += bytes;
        entries.emplace(hash, std::move(entry));
    }

    bool SolveResultCache::result(const Hash& hash, SolveResult& result)
    {
        auto it = entries.find(hash);
        if (it != entries.end())
        {
            // Expire stale entries based on valid_until
            if (it->second.result.valid_until > 0 && current_epoch_ms() > it->second.result.valid_until)
            {
                // Remove expired entry
                lru.erase(it->second.lruIt);
                currentBytes -= it->second.sizeBytes;
                entries.erase(it);
                return false;
            }
            lru.erase(it->second.lruIt);
            lru.push_front(hash);
            it->second.lruIt = lru.begin();

            result = it->second.result;
            return true;
        }
        return false;
    }
} // namespace node_clingo
