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
#include "program_store.h"

namespace node_clingo
{
    void ProgramStore::addProgram(
        const std::string& key,
        const std::string& content,
        const std::vector<std::string>& categories)
    {

        // Compute hash from content
        Hash content_hash = XXH3_64bits(content.c_str(), content.size());

        KeyHash hash = getOrCreateHash(key);

        auto it = programs.find(hash);
        if (it != programs.end())
        {
            programs.erase(it);
        }

        std::vector<KeyHash> categories_hashed;
        categories_hashed.reserve(categories.size());
        std::transform(categories.begin(), categories.end(), categories_hashed.begin(), [this](auto const& category) {
            return getOrCreateHash(category);
        });

        auto shared_program = std::make_shared<const Program>(key, content, categories_hashed, content_hash);
        programs[hash] = shared_program;

        // Update key mapping
        key_to_hash[key] = hash;

        // Update category mapping
        for (const auto& category : categories)
        {
            programs_by_category[getOrCreateHash(category)].push_back(shared_program);
        }
    }
    bool ProgramStore::removeProgramByKey(const std::string& key)
    {
        auto it = programs.find(key_to_hash[key]);
        if (it != programs.end())
        {

            // Remove from category mapping
            for (const auto& category : it->second->categories)
            {
                auto program_vector = programs_by_category[category];
                program_vector.erase(
                    std::remove_if(
                        program_vector.begin(),
                        program_vector.end(),
                        [&it](const std::weak_ptr<const Program>& w) {
                            // same object
                            return !w.owner_before(it->second) && !it->second.owner_before(w);
                        }),
                    program_vector.end());
            }
            programs.erase(it);

            return true;
        }
        return false;
    }
    void ProgramStore::removeAllPrograms()
    {
        programs.clear();
        programs_by_category.clear();
    }

    std::vector<std::shared_ptr<const Program>> ProgramStore::programByReferences(
        const std::vector<std::string>& references)
    {
        std::vector<std::shared_ptr<const Program>> result;
        std::unordered_set<const Program*> seen;

        for (const auto& reference : references)
        {
            auto hash = getOrCreateHash(reference);

            // direct match
            auto it = programs.find(hash);
            if (it != programs.end())
            {
                if (seen.insert(it->second.get()).second)
                {
                    result.push_back(it->second);
                }
                // its a program so no need to check for category match
                continue;
            }

            // category match
            auto it_category = programs_by_category.find(hash);
            if (it_category != programs_by_category.end())
            {
                for (auto program_ptr : it_category->second)
                {
                    if (auto shared_program = program_ptr.lock())
                    {
                        if (seen.insert(shared_program.get()).second)
                        {
                            result.push_back(shared_program);
                        }
                    }
                }
            }
        }

        // Ensure deterministic order: sort by program hash
        std::sort(result.begin(), result.end(), [](std::shared_ptr<const Program> a, std::shared_ptr<const Program> b) {
            return a->hash < b->hash;
        });
        return result;
    }
    KeyHash ProgramStore::getOrCreateHash(const std::string& key)
    {
        auto it = key_to_hash.find(key);
        if (it != key_to_hash.end())
        {
            return it->second;
        }
        KeyHash hash = next_key.fetch_add(1);
        key_to_hash[key] = hash;
        return hash;
    }
    Query ProgramStore::prepareQuery(const std::string& query, const std::vector<std::string>& categories)
    {
        XXH3_state_t* state = XXH3_createState();
        XXH3_64bits_reset(state);
        XXH3_64bits_update(state, query.c_str(), query.size());
        auto programs = programByReferences(categories);

        // add the main program
        programs.push_back(std::make_shared<const Program>("__program__", query, std::vector<KeyHash>(), 0));

        for (const auto& program : programs)
        {
            // hash is 8 bytes, remember to update if it is changed
            if (program->hash != 0)
            {
                XXH3_64bits_update(state, &program->hash, 8);
            }
        }
        Hash hash = XXH3_64bits_digest(state);
        XXH3_freeState(state);

        Query result;
        result.programs = std::move(programs);
        result.hash = hash;

        return result;
    }

} // namespace node_clingo
