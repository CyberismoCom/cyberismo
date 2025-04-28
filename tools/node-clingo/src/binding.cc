/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2025

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
#include <napi.h>
#include <clingo.h>
#include <string>
#include <vector>
#include <sstream>
#include <chrono>
#include <iostream>
#include <cstring>
#include <ctime>
#include <iomanip>
#include <fstream>
#include <unordered_map>
#include "helpers.h"
#include "function_handlers.h"

// Store base programs in a map, keyed by name
std::unordered_map<std::string, std::string> g_basePrograms;

// Silent logger function that discards all messages
void silent_logger(clingo_warning_t code, char const *message, void *data) {
    // Do nothing - this silences all Clingo output
}

// Helper function to handle Clingo errors
void HandleClingoError(const Napi::Env& env) {
    // If clingo returns an error, we throw an error to the javascript side
    if (clingo_error_code() != 0) {
        throw Napi::Error::New(env, clingo_error_message());
    }
}

// Callback for Clingo's ground function
bool ground_callback(clingo_location_t const *location, char const *name, 
                    clingo_symbol_t const *arguments, size_t arguments_size, 
                    void *data, clingo_symbol_callback_t symbol_callback, 
                    void *symbol_callback_data) {
    
    // Find the handler for the function and call it
    const auto& handlers = node_clingo::get_function_handlers();
    
    auto it = handlers.find(name);
    if (it != handlers.end()) {
        return it->second(arguments, arguments_size, symbol_callback, symbol_callback_data);
    }
    
    // If function name not matched, we simply do not handle it
    return true;
}

// Callback for Clingo's solve function
bool on_model(clingo_model_t const *model, void *data, bool *goon) {
    if (!model || !data || !goon) {
        return false;
    }
    
    std::vector<std::string>* answers = static_cast<std::vector<std::string>*>(data);
    
    clingo_symbol_t *atoms = nullptr;
    size_t atoms_size;
    
    // Get the size of the model
    if (!clingo_model_symbols_size(model, clingo_show_type_shown, &atoms_size)) {
        return false;
    }
    
    
    if (atoms_size == 0) {
        answers->push_back("");
        *goon = true;
        return true;
    }
    
    // Allocate space for the atoms
    try {
        atoms = new clingo_symbol_t[atoms_size];
    } catch (const std::bad_alloc&) {
        return false;
    }
    
    // Get the model symbols
    if (!clingo_model_symbols(model, clingo_show_type_shown, atoms, atoms_size)) {
        delete[] atoms;
        return false;
    }
    
    std::stringstream ss;
    bool success = true;
    
    // Convert each symbol to string
    for (size_t i = 0; i < atoms_size && success; ++i) {
        // Get the string representation
        std::string str = node_clingo::get_symbol_string(atoms[i]);

        // If the string is empty, we skip it
        if (str.empty()) {
            continue;
        }
        
        if (i > 0) ss << std::endl;
        ss << str;
    }
    
    try {
        answers->push_back(ss.str());
    } catch (const std::bad_alloc&) {
        success = false;
    }
    
    delete[] atoms;
    *goon = success;
    return success;
}

// Wrapper for the solve event callback
bool solve_event_callback(uint32_t type, void* event, void* data, bool* goon) {
    if (!event || !data || !goon) {
        return false;
    }
    
    if (type == clingo_solve_event_type_model) {
        return on_model(static_cast<const clingo_model_t*>(event), data, goon);
    }
    return true;
}


Napi::Value SetBaseProgram(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        // Check arguments
        if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
            throw Napi::TypeError::New(env, "Expected arguments: program (string), key (string)");
        }

        std::string program = info[0].As<Napi::String>().Utf8Value();
        std::string key = info[1].As<Napi::String>().Utf8Value();

        // Update the named base program
        g_basePrograms[key] = program;
        
        return Napi::Boolean::New(env, true);
        
    } catch (const Napi::Error& e) {
        // Let Napi errors propagate as they are
        throw;
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    } catch (...) {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

// Clear a specific base program
Napi::Value ClearBaseProgram(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        // Check arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw Napi::TypeError::New(env, "Expected argument: key (string)");
        }

        std::string key = info[0].As<Napi::String>().Utf8Value();
        g_basePrograms.erase(key);
        
        return Napi::Boolean::New(env, true);
        
    } catch (const Napi::Error& e) {
        throw;
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    } catch (...) {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

// Clear all base programs
Napi::Value ClearAllBasePrograms(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        g_basePrograms.clear();
        return Napi::Boolean::New(env, true);
        
    } catch (const Napi::Error& e) {
        throw;
    } catch (const std::exception& e) {
        throw Napi::Error::New(env, e.what());
    } catch (...) {
        throw Napi::Error::New(env, "Unknown error occurred");
    }
}

Napi::Value Solve(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    try {
        
        // Check arguments
        if (info.Length() < 1 || !info[0].IsString()) {
            throw Napi::TypeError::New(env, "String argument expected for program");
        }

        auto start = std::chrono::high_resolution_clock::now();
        
        // Create the program string once
        std::string program = info[0].As<Napi::String>().Utf8Value();
        
        // Apply base programs if specified
        if (info.Length() >= 2) {
            if (info[1].IsString()) {
                // If a single base program name is provided
                std::string key = info[1].As<Napi::String>().Utf8Value();
                auto it = g_basePrograms.find(key);
                if (it != g_basePrograms.end()) {
                    program = it->second + "\n" + program;
                }
            }
            else if (info[1].IsArray()) {
                // If an array of base program names is provided
                Napi::Array basePrograms = info[1].As<Napi::Array>();
                std::string combinedBase = "";
                for (uint32_t i = 0; i < basePrograms.Length(); ++i) {
                    Napi::Value val = basePrograms[i];
                    if (val.IsString()) {
                        std::string key = val.As<Napi::String>().Utf8Value();
                        auto it = g_basePrograms.find(key);
                        if (it != g_basePrograms.end()) {
                            if (!combinedBase.empty()) combinedBase += "\n";
                            combinedBase += it->second;
                        }
                    }
                }
                if (!combinedBase.empty()) {
                    program = combinedBase + "\n" + program;
                }
            }
        }
        
        // Create control object with silent logger
        clingo_control_t *ctl = nullptr;
        if (!clingo_control_new(nullptr, 0, silent_logger, nullptr, 20, &ctl)) {
            HandleClingoError(env);
        }
        
        std::unique_ptr<clingo_control_t, void(*)(clingo_control_t*)> ctl_guard(ctl, clingo_control_free);
        
        // Add the program
        if (!clingo_control_add(ctl, "base", nullptr, 0, program.c_str())) {
            HandleClingoError(env);
        }

        
        // Ground the program
        clingo_part_t parts[] = {{ "base", nullptr, 0 }};

        if (!clingo_control_ground(ctl, parts, 1, ground_callback, nullptr)) {
            HandleClingoError(env);
        }
        
        // Solve the program
        std::vector<std::string> answers;
        clingo_solve_handle_t *handle = nullptr;
        
        // Use clingo_solve_mode_yield to get all answer sets
        if (!clingo_control_solve(ctl, clingo_solve_mode_yield, nullptr, 0, solve_event_callback, &answers, &handle)){
            HandleClingoError(env);
        }
    
        std::unique_ptr<clingo_solve_handle_t, void(*)(clingo_solve_handle_t*)> handle_guard(
            handle, 
            [](clingo_solve_handle_t* h) { 
                if (h) {
                    clingo_solve_handle_close(h); 
                }
            }
        );
        
        // Wait for solving to finish
        clingo_solve_result_bitset_t result;
        if (!clingo_solve_handle_get(handle, &result)) {
            HandleClingoError(env);
        }
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        
        // Create result object with answers and execution time
        Napi::Object resultObj = Napi::Object::New(env);
        
        Napi::Array answersArray = Napi::Array::New(env, answers.size());
        for (size_t i = 0; i < answers.size(); ++i) {
            answersArray[i] = Napi::String::New(env, answers[i]);
        }
        resultObj.Set("answers", answersArray);
        resultObj.Set("executionTime", Napi::Number::New(env, duration.count()));
        
        return resultObj;
        
    } catch (const Napi::Error& e) {
        // Let Napi errors propagate as they are
        e.ThrowAsJavaScriptException();
        return Napi::Value();
    } catch (const std::exception& e) {
        Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        return Napi::Value();
    } catch (...) {
        Napi::Error::New(env, "Unknown error occurred").ThrowAsJavaScriptException();
        return Napi::Value();
    }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(
        Napi::String::New(env, "solve"),
        Napi::Function::New(env, Solve)
    );
    
    exports.Set(
        Napi::String::New(env, "setBaseProgram"),
        Napi::Function::New(env, SetBaseProgram)
    );
    
    exports.Set(
        Napi::String::New(env, "clearBaseProgram"),
        Napi::Function::New(env, ClearBaseProgram)
    );
    
    exports.Set(
        Napi::String::New(env, "clearAllBasePrograms"),
        Napi::Function::New(env, ClearAllBasePrograms)
    );
    
    return exports;
}

NODE_API_MODULE(node_clingo, Init) 