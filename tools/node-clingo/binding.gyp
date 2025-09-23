{
  "variables": {
      "openssl_fips": "",
      "conda_prefix": "<!(echo %CONDA_PREFIX%)"
  },
  "targets": [
    {
      "target_name": "node-clingo",
      "cflags_cc": [ "-std=c++20" ],
      "sources": [ 
        "src/binding.cc",
        "src/helpers.cc",
        "src/function_handlers.cc",
        "external/xxhash/xxhash.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(conda_prefix)/Library/include",
        "external/xxhash"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').targets\"):node_addon_api_except_all"
      ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "<(conda_prefix)/Library/lib/import_clingo.lib"
          ],
          "copies": [
            {
              "destination": "<(PRODUCT_DIR)",
              "files": [
                "<(conda_prefix)/Library/bin/clingo.dll"
              ]
            }
          ]
        }],
        ["OS=='mac'", {
          "conditions": [
            ["target_arch=='arm64'", {
              "libraries": [
                "-L/opt/homebrew/lib",
                "-lclingo"
              ],
              "include_dirs": [
                "/opt/homebrew/include"
              ],
              "copies": [
                {
                  "destination": "<(PRODUCT_DIR)",
                  "files": [
                    "/opt/homebrew/lib/libclingo.dylib"
                  ]
                }
              ]
            }],
            ["target_arch!='arm64'", {
              "libraries": [
                "-L/usr/local/lib",
                "-lclingo"
              ],
              "include_dirs": [
                "/usr/local/include"
              ],
              "copies": [
                {
                  "destination": "<(PRODUCT_DIR)",
                  "files": [
                    "/usr/local/lib/libclingo.dylib"
                  ]
                }
              ]
            }]
          ],
          "xcode_settings": {
            "CLANG_CXX_LANGUAGE_STANDARD": "c++20",
            "MACOSX_DEPLOYMENT_TARGET": "10.13",
            "OTHER_LDFLAGS": [
              "-Wl,-rpath,@loader_path"
            ]
          }
        }],
        ["OS!='win' and OS!='mac'", {
          "libraries": [
            "-lclingo"
          ]
        }]
      ]
    }
  ]
} 