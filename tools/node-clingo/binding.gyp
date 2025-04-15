{
  "variables": {
      "openssl_fips": ""
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
        "<!@(echo $CONDA_PREFIX/include)"
      ],
      "library_dirs": [
        "<!@(echo $CONDA_PREFIX/lib)"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "libraries": [
        "-lclingo"
      ]
    }
  ]
} 