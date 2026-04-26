{
  "targets": [
    {
      "target_name": "optimizer_native",

      "sources": [
        "addon.cpp",
        "http3.cpp",
        "udp.cpp"
      ],

      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],

      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],

      "cflags_cc": [
        "-std=c++17",
        "-O2"
      ],

      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "QUICHE_ENABLED"
      ],

      "conditions": [
        ["OS=='linux'", {
          "libraries": [
            "-lpthread"
          ]
        }],
        ["OS=='win'", {
          "libraries": [
            "-lWs2_32"
          ]
        }]
      ]
    }
  ]
}