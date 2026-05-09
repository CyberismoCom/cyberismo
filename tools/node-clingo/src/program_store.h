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
#ifndef NODE_CLINGO_PROGRAM_STORE_H
#define NODE_CLINGO_PROGRAM_STORE_H

#include <algorithm>
#include <atomic>
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <clingo.hh>

#include "helpers.h"
#include "xxhash.h"

namespace node_clingo
{
    using KeyHash = int;

    // Program with categories
    struct Program
    {
        std::string key;
        std::string content;
        std::vector<Clingo::AST::Node> ast_nodes; // Pre-parsed AST; empty = text fallback
        std::vector<KeyHash> categories;
        Hash hash;
        Program(
            std::string key_,
            std::string content_,
            std::vector<Clingo::AST::Node> ast_nodes_,
            std::vector<KeyHash> categories_,
            Hash hash_)
            : key(std::move(key_)), content(std::move(content_)), ast_nodes(std::move(ast_nodes_)),
              categories(std::move(categories_)), hash(hash_)
        {
        }
    };

    struct Query
    {
        std::vector<std::shared_ptr<const Program>> programs;
        Hash hash;
    };

    // Program store
    class ProgramStore {

      private:
        std::unordered_map<KeyHash, std::shared_ptr<const Program>> programs;
        std::unordered_map<KeyHash, std::vector<std::shared_ptr<const Program>>> programs_by_category;
        std::unordered_map<std::string, KeyHash> key_to_hash;
        std::atomic<int> next_key = 0;
        std::vector<std::shared_ptr<const Program>> programByReferences(const std::vector<std::string>& references);

        KeyHash getOrCreateHash(const std::string& key);
        bool removeProgram(KeyHash keyHash);

      public:
        bool preParsing = true; // When false, skip AST pre-parsing
        ProgramStore() = default;
        ~ProgramStore() = default;
        /**
         * Adds a program to the program store
         * @param key The key of the program
         * @param content The content of the program
         * @param categories The categories of the program
         */
        void addProgram(const std::string& key, const std::string& content, const std::vector<std::string>& categories);
        /**
         * Removes a program from the program store
         * @param key The key of the program
         * @returns true if the program was found and removed, false if it didn't exist
         */
        bool removeProgramByKey(const std::string& key);
        /**
         * Removes all programs from the program store
         */
        void removeAllPrograms();
        /**
         * Prepares a query for the program store
         * @param query The query
         * @param categories The categories
         * @param computeHash When true (default), computes the cache key hash over
         *        the assembled programs. When false, skips the XXHash work entirely
         *        and leaves Query::hash zero — useful when the caller has opted out
         *        of the result cache for this call.
         * @returns The query
         */
        Query prepareQuery(
            const std::string& query,
            const std::vector<std::string>& categories,
            bool computeHash = true);
    };

} // namespace node_clingo

#endif // NODE_CLINGO_PROGRAM_STORE_H