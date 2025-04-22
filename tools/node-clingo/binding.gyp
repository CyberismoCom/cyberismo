{
  "variables": {
      "openssl_fips": "",
      "conda_prefix": "<!(echo %CONDA_PREFIX%)"
  },
  "targets": [
    {
      "target_name": "node-clingo",
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "sources": [ 
        "src/binding.cc",
        "src/helpers.cc",
        "src/function_handlers.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(conda_prefix)/Library/include"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "libraries": [
            "<(conda_prefix)/Library/lib/import_clingo.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
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
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
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