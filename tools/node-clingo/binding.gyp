{
  "variables": {
      "enable_cpp_logs%": "0"
  },
  "targets": [
    {
      "target_name": "node-clingo",
      "cflags_cc": [ "-std=c++20" ],
      "sources": [
        "src/binding.cc",
        "src/helpers.cc",
        "src/function_handlers.cc",
        "external/xxhash/xxhash.c",
        "src/clingo_solver.cc",
        "src/program_store.cc",
        "src/solve_result_cache.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "external/xxhash",
        "external/BS_thread_pool/include",
        "external/clingo/libclingo"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except_all"
      ],
      "conditions": [
        ['enable_cpp_logs==1', {
          'defines': [ 'ENABLE_CPP_LOGS' ]
        }],
        ["OS=='win'", {
          "defines": [ "CLINGO_NO_VISIBILITY" ],
          "libraries": [
            "<(module_root_dir)/external/clingo/build/lib/Release/clingo.lib",
            "<(module_root_dir)/external/clingo/build/lib/Release/gringo.lib",
            "<(module_root_dir)/external/clingo/build/lib/Release/reify.lib",
            "<(module_root_dir)/external/clingo/build/lib/Release/clasp.lib",
            "<(module_root_dir)/external/clingo/build/lib/Release/potassco.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": [ "/std:c++20" ],
              "RuntimeLibrary": "0"
            }
          }
        }],
        ["OS!='win'", {
          "libraries": [
            "<(module_root_dir)/external/clingo/build/lib/libclingo.a",
            "<(module_root_dir)/external/clingo/build/lib/libgringo.a",
            "<(module_root_dir)/external/clingo/build/lib/libreify.a",
            "<(module_root_dir)/external/clingo/build/lib/libclasp.a",
            "<(module_root_dir)/external/clingo/build/lib/libpotassco.a"
          ]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
            "MACOSX_DEPLOYMENT_TARGET": "11.0"
          }
        }]
      ]
    }
  ]
}
