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
          }
        }],
        ["OS!='win'", {
          "libraries": [
            "-lclingo"
          ]
        }]
      ]
    }
  ]
} 