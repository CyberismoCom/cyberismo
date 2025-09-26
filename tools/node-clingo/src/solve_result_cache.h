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
#ifndef NODE_CLINGO_QUERY_CACHE_H
#define NODE_CLINGO_QUERY_CACHE_H

#include <algorithm>
#include <atomic>
#include <chrono>
#include <list>
#include <string>
#include <unordered_map>
#include <vector>

#include <clingo.h>

#include "helpers.h"
#include "xxhash.h"

namespace node_clingo
{
    struct ClingoLogMessage
    {
        clingo_warning_t code;
        bool isError;
        std::string message;
    };

    struct Stats
    {
        std::chrono::microseconds glue;
        std::chrono::microseconds add;
        std::chrono::microseconds ground;
        std::chrono::microseconds solve;
    };

    struct SolveResult
    {
        bool isError = false;
        std::vector<std::string> answers;
        std::vector<ClingoLogMessage> logs;
        Stats stats;
        std::string key;
    };

    class SolveResultCache {
      private:
        static constexpr std::size_t CACHE_CAPACITY_MB = 16;
        static constexpr std::size_t CACHE_CAPACITY_BYTES = CACHE_CAPACITY_MB * 1024ull * 1024ull;
        static constexpr std::size_t VECTOR_OVERHEAD_BYTES = sizeof(std::vector<std::string>);

        struct Entry
        {
            SolveResult result;
            std::size_t sizeBytes;
            std::list<Hash>::iterator lruIt;
        };

        std::unordered_map<Hash, Entry> entries;
        // front = most recently used, back = least recently used
        std::list<Hash> lru;
        std::size_t currentBytes = 0;

        static std::size_t estimateSizeBytes(const SolveResult& result);

      public:
        SolveResultCache();
        ~SolveResultCache();
        /**
         * Adds a result to the cache
         * @param hash The hash of the result
         * @param result The result
         */
        void addResult(const node_clingo::Hash& hash, SolveResult&& result);
        /**
         * Gets a result from the cache
         * @param hash The hash of the result
         * @param result The result
         * @returns true if the result was found, false otherwise
         */
        bool result(const Hash& hash, SolveResult& result);
    };
} // namespace node_clingo

#endif // NODE_CLINGO_QUERY_CACHE_H