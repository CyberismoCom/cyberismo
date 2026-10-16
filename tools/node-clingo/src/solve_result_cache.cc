// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

#include "solve_result_cache.h"

namespace node_clingo
{
    SolveResultCache::SolveResultCache() {}

    SolveResultCache::~SolveResultCache() {}

    std::size_t SolveResultCache::estimateSizeBytes(const SolveResult& result)
    {
        // rough estimate
        std::size_t size = sizeof(SolveResult);
        size += sizeof(std::string) * result.answers.capacity();
        for (const auto& answer : result.answers)
            size += answer.capacity();
        size += sizeof(ClingoLogMessage) * result.logs.capacity();
        for (const auto& logMessage : result.logs)
            size += logMessage.message.capacity();
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
            LOG("Result too large for cache, not caching: " << bytes << " bytes");
            return;
        }
        // make space for the new result
        while (currentBytes + bytes > CACHE_CAPACITY_BYTES && !lru.empty())
        {
            Hash evictHash = lru.back();
            lru.pop_back();
            auto evictionEntry = entries.find(evictHash);
            if (evictionEntry != entries.end())
            {
                LOG("Evicting cached result: " << evictHash << " of size " << evictionEntry->second.sizeBytes
                                               << " bytes");
                currentBytes -= evictionEntry->second.sizeBytes;
                entries.erase(evictionEntry);
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
        LOG("Caching result: " << hash << " of size " << bytes << " bytes");
        LOG("Current cache size: " << currentBytes << " bytes");
    }

    bool SolveResultCache::result(const Hash& hash, SolveResult& result)
    {
        auto it = entries.find(hash);
        if (it != entries.end())
        {
            LOG("Cache hit for hash: " << hash);
            // Expire stale entries based on valid_until
            if (it->second.result.valid_until > 0 && current_epoch_ms() > it->second.result.valid_until)
            {
                LOG("Removing expired cached result: " << hash);
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
    void SolveResultCache::clear()
    {
        entries.clear();
        lru.clear();
        currentBytes = 0;
        LOG("Cache cleared");
    }
} // namespace node_clingo
