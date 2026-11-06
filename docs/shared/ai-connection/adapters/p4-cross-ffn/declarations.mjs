import {canonicalize} from "../../canonical.mjs";
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const P4_PROFILE_ID=freeze("bernini-block0-n2-cross-ffn-f32-candidate-v1");
export const P4_POLICY_ID=freeze("p4-cross-ffn");
export const P4_SHAPE_RECORD_ID=freeze("SHAPE-BERNINI-BLOCK0-N2-CROSS-FFN-F32");
export const P4_EXEC_RECORD_ID=freeze("EXEC-BERNINI-BLOCK0-N2-CROSS-FFN-F32-CANDIDATE-V1");
export const P4_CATALOG_REF=freeze({
  "path": "docs/shared/ai-connection/reference/candidates/p4-cross-ffn/catalog.v1.json",
  "sha256": "e64e2e338b3a33ab2ea5521df652cb041a9d4033cec5da7e0f18d9c2373e023e",
  "byteLength": 9601
});
export const P4_PINS=freeze({
  "repository": "Kushyameln01/kushyameln-works",
  "managementBaseCommit": "5aa5a806f84a875c542b2922fe80ef6faafc7915",
  "distributionCommit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
  "executionSourceCommit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
  "latestMetadataDistributionCommit": "27776abb234fc12733c600b1dabd2fdab70e27ae",
  "sourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
    "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs"
  },
  "buildId": "bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b",
  "sourceInventorySHA256": "31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b",
  "buildSourceCount": 50,
  "extraOwnerJudgeSourceCount": 1,
  "stage": {
    "sha256": "ff184acbabc589472a95b0bbf0eb2d3949b4478ecc0b19266817e8c313e7826d",
    "byteLength": 21978
  },
  "mathWasm": {
    "sha256": "4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e",
    "byteLength": 10094
  },
  "bridgeWasm": {
    "sha256": "ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd",
    "byteLength": 6899
  },
  "attentionWasm": {
    "sha256": "b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c",
    "byteLength": 5940
  },
  "gateRef": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
      "path": "development/ai-connection/p4-cross-ffn/core/candidate-plan.json"
    },
    "sha256": "051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600",
    "byteLength": 9348,
    "gateId": "git:Kushyameln01/kushyameln-works@7ee36228030ba3bb544a90b1d4b528702a7bae32:development/ai-connection/p4-cross-ffn/core/candidate-plan.json#/gates",
    "gates": {
      "localCut": {
        "abs": 0.001,
        "rel": 0.0001
      },
      "composed": {
        "abs": 0.01,
        "rel": 0.001
      },
      "rule": "abs(actual-reference) <= abs + rel*abs(reference); all values, no percentile pass"
    },
    "identityAuthority": "management-sidecar-for-exact-owner-source-bytes"
  },
  "catalogRef": {
    "path": "docs/shared/ai-connection/reference/candidates/p4-cross-ffn/catalog.v1.json",
    "sha256": "e64e2e338b3a33ab2ea5521df652cb041a9d4033cec5da7e0f18d9c2373e023e",
    "byteLength": 9601
  },
  "sourceFiles": [
    {
      "path": "development/ai-connection/p4-cross-ffn/core/candidate-plan.json",
      "runtimePath": "development/ai-connection/p4-cross-ffn/core/candidate-plan.json",
      "byteLength": 9348,
      "sha256": "051b6833be54aed9e1e0c3657bd28aa926b46c238a1c3a06fb298f6cc6427600",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "development/ai-connection/p4-cross-ffn/core/candidate-plan.json"
      }
    },
    {
      "path": "development/ai-connection/p4-cross-ffn/core/fixture-contract.json",
      "runtimePath": "development/ai-connection/p4-cross-ffn/core/fixture-contract.json",
      "byteLength": 1054,
      "sha256": "17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "development/ai-connection/p4-cross-ffn/core/fixture-contract.json"
      }
    },
    {
      "path": "development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py",
      "runtimePath": "development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py",
      "byteLength": 83811,
      "sha256": "17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py"
      }
    },
    {
      "path": "docs/shared/diffusion-models/api/safetensors.mjs",
      "runtimePath": "docs/shared/diffusion-models/api/safetensors.mjs",
      "byteLength": 3948,
      "sha256": "ecb7e750a151489c9b37ffec75e0b784d808b0503ff2181c7b73907398422d7f",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/api/safetensors.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/feed.mjs",
      "runtimePath": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/feed.mjs",
      "byteLength": 17009,
      "sha256": "a50b3b54c9d5da6188c1d57290560252365579257e9c1a6817b3de077a17d08a",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/feed.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs",
      "runtimePath": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs",
      "byteLength": 21215,
      "sha256": "ddf216d4be56e7f1a424285718c91d825241f4de4e3a98d46794bf61b164d0b3",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/diagnostics/p4-cross-ffn/run.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs",
      "runtimePath": "docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs",
      "byteLength": 7915,
      "sha256": "efd172d318fefff1581367a260ae688b0ba02c5dbdab0302ad9a7a5055c4f13b",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/diagnostics/resource-observer/observer.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/lora/diagnostic-identity.mjs",
      "runtimePath": "docs/shared/diffusion-models/lora/diagnostic-identity.mjs",
      "byteLength": 1365,
      "sha256": "35ed52cde91236e764acd61ce912a96aea6627c249eeccd3c8039036069de9c9",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/lora/diagnostic-identity.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/lora/strict-json.mjs",
      "runtimePath": "docs/shared/diffusion-models/lora/strict-json.mjs",
      "byteLength": 1544,
      "sha256": "c68a353f9be2567361b075a6e5480e953a7d8df862f5b154e9cd368ec2571a98",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/lora/strict-json.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/lora/targets.mjs",
      "runtimePath": "docs/shared/diffusion-models/lora/targets.mjs",
      "byteLength": 47893,
      "sha256": "772ca63c3b82bafa7b2345cdda3361679112fcf4a97c79b67564da0fa196217d",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/lora/targets.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/lora/weights.mjs",
      "runtimePath": "docs/shared/diffusion-models/lora/weights.mjs",
      "byteLength": 11233,
      "sha256": "b6d60af5924c2cc5cef9398867424288cab36d9788149c954fa8526b3b51fcc5",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/lora/weights.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/attention-heads/graph.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/attention-heads/graph.mjs",
      "byteLength": 2558,
      "sha256": "dce76cdb3ca5f19aa0837b861b6ec73d3c7ee3ba6b2b15efa74cb46f903561ca",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/attention-heads/graph.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/block-hidden/graph.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/block-hidden/graph.mjs",
      "byteLength": 1531,
      "sha256": "7826723d34a934a78e27335dce5973d41af4e2578136db5604c19b13d0954db0",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/block-hidden/graph.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/block-hidden/linear.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/block-hidden/linear.mjs",
      "byteLength": 4984,
      "sha256": "4e9dfc16d661e70c9d9176ac4eb3abacccf83f4dbd00b891cfb45d0f72f50987",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/block-hidden/linear.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/hike.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/hike.mjs",
      "byteLength": 4111,
      "sha256": "a56e4f52c8639fc9be40ebd3d3092a0c590f8e73f21d2f54156f7b217cd6499a",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/hike.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm",
      "byteLength": 6899,
      "sha256": "ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/kernel/bridge.wasm"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs",
      "byteLength": 160,
      "sha256": "c4ea25478d44b70146ba2574d98c761d1bb345b4d6f10ccaedfb660f30489cdd",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/kernel/registry.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build-record.json",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build-record.json",
      "byteLength": 2013,
      "sha256": "4d0839dce6657788a7a93fad15ddafebcf3f249a7e3a641383f25b5cba5ac1f9",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build-record.json"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build.py",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build.py",
      "byteLength": 3111,
      "sha256": "775e82f1f9572c6e3ea5a73e651d80e655eda1183b4521e75d2178504d66b25b",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/build.py"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs",
      "byteLength": 18862,
      "sha256": "b4518ea35ca35e63e6ba8cdbe67e5d9fea0fa2125dac7dac0f5d4ac6c83ac7c2",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm",
      "byteLength": 10094,
      "sha256": "4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wasm"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wat",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wat",
      "byteLength": 379417,
      "sha256": "a4624677c8903e4b4c900af9775236a646226b76a9758b2cd5f38fffa249e14e",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/kernel.wat"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs",
      "byteLength": 7075,
      "sha256": "3821cca4b031aae4adf3944f15f8d171ed602f97878307ce495b7dcd8b05118a",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/linear.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.hike",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.hike",
      "byteLength": 2985,
      "sha256": "4df36305e6d0faad458d326e4926cb0fd3a8f98c7bca6b75d2ace6e988122574",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.hike"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.mjs",
      "byteLength": 6699,
      "sha256": "c26d169c90bced0524c73081bd92b13bbb635f57718086b6224826b2464bf9a0",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/math.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/registry.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/registry.mjs",
      "byteLength": 158,
      "sha256": "76c16302cc62d94f278322a895e8fd343f10ec49626fb1ab04ec546842c64a7c",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/registry.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/runtime.js",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/runtime.js",
      "byteLength": 13706,
      "sha256": "b776bfdbc3aa9bfcddb9e8b61a8f69063c8dacd01eaf582ab2738d6b3f40a06b",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/runtime.js"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs",
      "byteLength": 10907,
      "sha256": "5bf263b8b6465b395dd6ea3634ef9619626479f95b8a22cc207dd923541c9d63",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/source.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs",
      "byteLength": 21978,
      "sha256": "ff184acbabc589472a95b0bbf0eb2d3949b4478ecc0b19266817e8c313e7826d",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs",
      "byteLength": 22015,
      "sha256": "b80cdcb74584ef3f224c8eb6fcbef9cfb065f8387427a04a708d53d273856c9c",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/qkv/ownership.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/qkv/ownership.mjs",
      "byteLength": 942,
      "sha256": "64759f90185e7250437bf2ad691cddb1486e299eaa963b556b38301fc0daec4d",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/qkv/ownership.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm",
      "byteLength": 4018,
      "sha256": "54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/kernel.wasm"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/math.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/math.mjs",
      "byteLength": 4695,
      "sha256": "4b5311829d007f576ae16c7a3296514100767e1fd7c557c63f2c72e72ea41dff",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/math.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/registry.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/registry.mjs",
      "byteLength": 158,
      "sha256": "706b52a1ab926e1c01484512ace3bb06cbf9061f1070b2784407b6feefed16ed",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/registry.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/source.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/source.mjs",
      "byteLength": 8261,
      "sha256": "e52d1384d0981fb176899bdc86f3ce9347496eb1b868831df29aa47a932f6469",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/source.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs",
      "byteLength": 11994,
      "sha256": "ca35f70de8ced5a5c11223b63b98a1f346b1f21118d674195c6abd8c56ee33f3",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/trusted.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/trusted.mjs",
      "byteLength": 4318,
      "sha256": "af551e9c4aa13377ce7563b54e786674a69e614b785841fd39eade9f6cbba616",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/trusted.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/hike.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/stream-attention/hike.mjs",
      "byteLength": 3128,
      "sha256": "67d5ada9d4c6c4217c3845c9ddbed5fb246cedeb35d5283840e1057087d4c3cd",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/hike.mjs"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm",
      "byteLength": 5940,
      "sha256": "b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/kernel.wasm"
      }
    },
    {
      "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/registry.mjs",
      "runtimePath": "docs/shared/diffusion-models/ort-bridge/stream-attention/registry.mjs",
      "byteLength": 142,
      "sha256": "99c1c3c56fe22608c4652d830cd7f03978b036332a0505b9f07ed548bc8b6ecb",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/diffusion-models/ort-bridge/stream-attention/registry.mjs"
      }
    },
    {
      "path": "docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs",
      "runtimePath": "docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs",
      "byteLength": 24274,
      "sha256": "5687566b1bc1c8cf628d76c2ddb16b2a3b81a7997273d4666564880495088e57",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs"
      }
    },
    {
      "path": "docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm",
      "runtimePath": "docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm",
      "byteLength": 12361745,
      "sha256": "be0e129949062ad50290ef94683fac8be5bb6156f709e030b7a5f1661a2f6c17",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm"
      }
    },
    {
      "path": "docs/shared/inference/vendor/ort.wasm.min.mjs",
      "runtimePath": "docs/shared/inference/vendor/ort.wasm.min.mjs",
      "byteLength": 49997,
      "sha256": "d5a6d7bc8ee587648fb3742dde8c0094d17cbd3822a68bbec8ddfcd4f2adb88e",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/inference/vendor/ort.wasm.min.mjs"
      }
    },
    {
      "path": "docs/shared/vr180/sha256.mjs",
      "runtimePath": "docs/shared/vr180/sha256.mjs",
      "byteLength": 6970,
      "sha256": "cbf39a47d19ef1a0a150ad5219dd8a49e2ee5fc67d2550640ce33c73d08da36c",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "docs/shared/vr180/sha256.mjs"
      }
    },
    {
      "path": "tools/diffusion-models/p4-cross-ffn-browser.py",
      "runtimePath": "tools/diffusion-models/p4-cross-ffn-browser.py",
      "byteLength": 29759,
      "sha256": "141ab992ec58f3b985e739ec00f79ec98b03d0bbfc4d1581bc4131a3c986707b",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/p4-cross-ffn-browser.py"
      }
    },
    {
      "path": "tools/diffusion-models/p4-cross-ffn-build.py",
      "runtimePath": "tools/diffusion-models/p4-cross-ffn-build.py",
      "byteLength": 5462,
      "sha256": "8871c70b880db0eebe332317bb0fba0c0e496d8c31436c5852e84eba92482346",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/p4-cross-ffn-build.py"
      }
    },
    {
      "path": "tools/diffusion-models/p4-cross-ffn-feed-browser.py",
      "runtimePath": "tools/diffusion-models/p4-cross-ffn-feed-browser.py",
      "byteLength": 25956,
      "sha256": "8a393fd23193e75033952959198f3c77d42e73ac6eb7bf854f88f09a1aafe9de",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/p4-cross-ffn-feed-browser.py"
      }
    },
    {
      "path": "tools/diffusion-models/p4-cross-ffn-reference.py",
      "runtimePath": "tools/diffusion-models/p4-cross-ffn-reference.py",
      "byteLength": 40251,
      "sha256": "66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/p4-cross-ffn-reference.py"
      }
    },
    {
      "path": "tools/diffusion-models/resource-browser.py",
      "runtimePath": "tools/diffusion-models/resource-browser.py",
      "byteLength": 14042,
      "sha256": "f9c118520a40ed98e39b5e6f8a1d44bf65dc46bf547164c730fb365871234a0b",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/resource-browser.py"
      }
    },
    {
      "path": "tools/diffusion-models/tail-browser.py",
      "runtimePath": "tools/diffusion-models/tail-browser.py",
      "byteLength": 24777,
      "sha256": "4242b23aa662cd31063fa76bd0dec93bfa8dd72112624d2681927856342dc536",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
        "path": "tools/diffusion-models/tail-browser.py"
      }
    },
    {
      "path": "docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs",
      "runtimePath": "docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs",
      "byteLength": 2695,
      "sha256": "b2c0abad30840c7c31c9e4e4f13218cdaa5b64576ff139abe9bf589bfdf3834f",
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
        "path": "docs/shared/diffusion-models/diagnostics/self-attention-tail/common.mjs"
      }
    }
  ],
  "parentCatalogSourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "6dae9a6fac3e9ad29ea941f22211edbe4aa894ad",
    "path": "docs/shared/ai-connection/reference/catalog.v1.json"
  },
  "parentCatalogSha256": "14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c"
});
export const P4_GATES=freeze({
  "localCut": {
    "abs": 0.001,
    "rel": 0.0001
  },
  "composed": {
    "abs": 0.01,
    "rel": 0.001
  },
  "rule": "abs(actual-reference) <= abs + rel*abs(reference); all values, no percentile pass"
});
export const P4_TRUSTED_INPUTS=freeze({
  "HIGH": {
    "side": "HIGH",
    "blockIndex": 0,
    "scheduleIndex": 1,
    "tokens": 2,
    "exportReceiptPath": "development/ai-connection/self-attention-tail/output-export/high-export-receipt.json",
    "exportReceiptSHA256": "21fd376bf498c411fbcaf4cc68c1ee3a3320d77923a3da107c2550f0698a72c4",
    "savedArtifactSHA256": "5040656cf0bf6bd9f06bbf007b16d22ae026a25a5080d666758e0b52a10e86bd",
    "savedArtifactBytes": 1375283,
    "residualSHA256": "72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9",
    "timeAct1SHA256": "1b69ffc7e86fbc52ea9ae5bd32950d8e62439417089577f9c5f66243e0b734f7",
    "acceptedTailReceiptSHA256": "759380dcbe016b1f1d9a51579c21a1e1d47545d250e1badc9e93842a4537d62e"
  },
  "LOW": {
    "side": "LOW",
    "blockIndex": 0,
    "scheduleIndex": 3,
    "tokens": 2,
    "exportReceiptPath": "development/ai-connection/self-attention-tail/output-export/low-export-receipt.json",
    "exportReceiptSHA256": "98edf8cbc42cfe80989f87a6459cb378ef08c73c7f7bb49688cf903aaa81b9d0",
    "savedArtifactSHA256": "714d96b41cb9e5ba8349b4a9202722f2f94e3fdeeaa984dbc1850b449190d37d",
    "savedArtifactBytes": 1384348,
    "residualSHA256": "0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6",
    "timeAct1SHA256": "cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5",
    "acceptedTailReceiptSHA256": "93f7c2a03e36ec9a2bc1eaefbd794dc14e16a615bfaf0863ecc83236e206ad96"
  }
});
export const P4_CONDITIONING_CASES=freeze({
  "fixture": {
    "inputClass": "explicit-fixture",
    "dtype": "float32",
    "layout": "BLC",
    "meaning": "p4-fixture-text-hidden-states:v1",
    "shape": [
      1,
      4,
      4096
    ],
    "rows": 4,
    "fixtureId": "bernini-p4-explicit-text-l4-dyadic-v1",
    "dataSHA256": "0cd4fa87e24e6d875207aca52cc214a1b46157a886d4c090fb7c5cfc9a5925ae",
    "attentionMaskSHA256": "252c0b6b080fa045acfcd1437f693f3be2be2ac8223ea525d492fa19ab028942",
    "fixtureContractSHA256": "17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338"
  },
  "nativeText": {
    "dtype": "float32",
    "layout": "BLC",
    "meaning": "text_hidden_states",
    "shape": [
      1,
      512,
      4096
    ],
    "rows": 512,
    "modelSha256": "c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68",
    "tokenizerSha256": "e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458",
    "inputClass": "native-text-encoder",
    "dataSHA256": "107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7",
    "attentionMaskSHA256": "19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62",
    "packetSHA256": "90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9",
    "packetByteLength": 8390054,
    "packetSourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48",
      "path": "development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor"
    },
    "producerExecution": "5537b8932343aa2476b95191817e8913f99dab02"
  }
});
export const P4_FIXTURE_REFERENCE_REFS=freeze({
  "HIGH": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
      "path": "development/ai-connection/p4-cross-ffn/core/reference-freeze.json"
    },
    "sha256": "a4226920410738056590a6c0cfcad3b2499d1b49134ced2cad65d71f1c41639c",
    "byteLength": 2012,
    "referenceId": "git:Kushyameln01/kushyameln-works@7ee36228030ba3bb544a90b1d4b528702a7bae32:development/ai-connection/p4-cross-ffn/core/reference-freeze.json#fixture-HIGH-local-composed",
    "side": "HIGH",
    "blockIndex": 0,
    "scheduleIndex": 1,
    "inputClass": "explicit-fixture",
    "textRows": 4,
    "conditioningBinding": {
      "inputClass": "explicit-fixture",
      "dtype": "float32",
      "layout": "BLC",
      "meaning": "p4-fixture-text-hidden-states:v1",
      "shape": [
        1,
        4,
        4096
      ],
      "rows": 4,
      "fixtureId": "bernini-p4-explicit-text-l4-dyadic-v1",
      "dataSHA256": "0cd4fa87e24e6d875207aca52cc214a1b46157a886d4c090fb7c5cfc9a5925ae",
      "attentionMaskSHA256": "252c0b6b080fa045acfcd1437f693f3be2be2ac8223ea525d492fa19ab028942",
      "fixtureContractSHA256": "17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338"
    },
    "savedInputBindings": {
      "side": "HIGH",
      "blockIndex": 0,
      "scheduleIndex": 1,
      "tokens": 2,
      "exportReceiptPath": "development/ai-connection/self-attention-tail/output-export/high-export-receipt.json",
      "exportReceiptSHA256": "21fd376bf498c411fbcaf4cc68c1ee3a3320d77923a3da107c2550f0698a72c4",
      "savedArtifactSHA256": "5040656cf0bf6bd9f06bbf007b16d22ae026a25a5080d666758e0b52a10e86bd",
      "savedArtifactBytes": 1375283,
      "residualSHA256": "72a7de56a7364122197f4126a996f7131ff4fbda94f7f8201bdacbaad04d85b9",
      "timeAct1SHA256": "1b69ffc7e86fbc52ea9ae5bd32950d8e62439417089577f9c5f66243e0b734f7",
      "acceptedTailReceiptSHA256": "759380dcbe016b1f1d9a51579c21a1e1d47545d250e1badc9e93842a4537d62e"
    },
    "local": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
        "path": "development/ai-connection/p4-cross-ffn/reference-baseline/high-local-reference-receipt.json"
      },
      "sha256": "bd56e7e2674db6f20ce94956bf038a1d4c2e841c8144de62ba54a7bb05be22f2",
      "byteLength": 49512,
      "payloadSha256": "6ca4f9d06bf02101ff3a90e3e05e44d48ec54e564273749683000d6ab1ef8f93",
      "payloadByteLength": 6588381
    },
    "composed": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
        "path": "development/ai-connection/p4-cross-ffn/reference-baseline/high-composed-reference-receipt.json"
      },
      "sha256": "8b2a1d87ff5447ba903b2f2340f99ef9e3bae40d918222a8aa15cbee3dc6996c",
      "byteLength": 49615,
      "payloadSha256": "995da631caf7b9d91c6232689b36ddacb33ddf18dd505e21b5274e7c821fba98",
      "payloadByteLength": 6587916
    },
    "identityAuthority": "management-sidecar-for-exact-owner-source-bytes"
  },
  "LOW": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
      "path": "development/ai-connection/p4-cross-ffn/core/reference-freeze.json"
    },
    "sha256": "a4226920410738056590a6c0cfcad3b2499d1b49134ced2cad65d71f1c41639c",
    "byteLength": 2012,
    "referenceId": "git:Kushyameln01/kushyameln-works@7ee36228030ba3bb544a90b1d4b528702a7bae32:development/ai-connection/p4-cross-ffn/core/reference-freeze.json#fixture-LOW-local-composed",
    "side": "LOW",
    "blockIndex": 0,
    "scheduleIndex": 3,
    "inputClass": "explicit-fixture",
    "textRows": 4,
    "conditioningBinding": {
      "inputClass": "explicit-fixture",
      "dtype": "float32",
      "layout": "BLC",
      "meaning": "p4-fixture-text-hidden-states:v1",
      "shape": [
        1,
        4,
        4096
      ],
      "rows": 4,
      "fixtureId": "bernini-p4-explicit-text-l4-dyadic-v1",
      "dataSHA256": "0cd4fa87e24e6d875207aca52cc214a1b46157a886d4c090fb7c5cfc9a5925ae",
      "attentionMaskSHA256": "252c0b6b080fa045acfcd1437f693f3be2be2ac8223ea525d492fa19ab028942",
      "fixtureContractSHA256": "17102144ab54236bc0dc28d3e2d083b5a5c850c48f0ada86aa4b06c89bab6338"
    },
    "savedInputBindings": {
      "side": "LOW",
      "blockIndex": 0,
      "scheduleIndex": 3,
      "tokens": 2,
      "exportReceiptPath": "development/ai-connection/self-attention-tail/output-export/low-export-receipt.json",
      "exportReceiptSHA256": "98edf8cbc42cfe80989f87a6459cb378ef08c73c7f7bb49688cf903aaa81b9d0",
      "savedArtifactSHA256": "714d96b41cb9e5ba8349b4a9202722f2f94e3fdeeaa984dbc1850b449190d37d",
      "savedArtifactBytes": 1384348,
      "residualSHA256": "0024d0b19db9988d218e2a2ded4cc3713aca32d9517966455d17b34cfee801b6",
      "timeAct1SHA256": "cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5",
      "acceptedTailReceiptSHA256": "93f7c2a03e36ec9a2bc1eaefbd794dc14e16a615bfaf0863ecc83236e206ad96"
    },
    "local": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
        "path": "development/ai-connection/p4-cross-ffn/reference-baseline/low-local-reference-receipt.json"
      },
      "sha256": "f37801fa489065c2c5c763187b6449e676e0e8c9d9e00d16980c776d6e0f142d",
      "byteLength": 49515,
      "payloadSha256": "9f5c2a4963114d6e743b51040eaaf2f08bf4663c2e862b605b6bcd642d54ceda",
      "payloadByteLength": 6634872
    },
    "composed": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "7ee36228030ba3bb544a90b1d4b528702a7bae32",
        "path": "development/ai-connection/p4-cross-ffn/reference-baseline/low-composed-reference-receipt.json"
      },
      "sha256": "2042e3f9f33f571ed332d52fda9d2869fa6c02bd954094e1baeae9d01585eaea",
      "byteLength": 49622,
      "payloadSha256": "1d6e3c70959df05471cc69a19e11b25dc5a5626798c2c7587626f28f86ae1919",
      "payloadByteLength": 6634670
    },
    "identityAuthority": "management-sidecar-for-exact-owner-source-bytes"
  }
});
export const P4_FIXED_DECLARATIONS=freeze({
  "schemaVersion": "bernini-post-self-attention/0.1",
  "tokens": 2,
  "hiddenWidth": 5120,
  "textWidth": 4096,
  "textRows": [
    1,
    512
  ],
  "ffnWidth": 13824,
  "headCount": 40,
  "headDim": 128,
  "epsilon": 1e-06,
  "mask": "none; captured mask retained as provenance",
  "rope": "none",
  "timeProjectionChunks": [
    3,
    4,
    5
  ],
  "sourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "5744f700e17b23d5c18d32315fb6dfbd7c49089a",
    "path": "docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs"
  },
  "buildId": "bernini-p4-cross-ffn/0.1+31cd57300e61ef429de85eefa83f2d5796588b2e94e32a162810b62cdedf408b",
  "kernelDigest": "4d8518e94bd2de3ab9bf50f09b2fd17b69a5c57e7fd45dc65cd062d7fdbdbc4e",
  "bridgeWasmSHA256": "ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd",
  "attentionWasmSHA256": "b809f614c69be820346d738b46b743b50c624d902141610c28de07ae0cfd159c",
  "generationReady": false,
  "load": "NOT_READY",
  "predict": "NOT_READY",
  "sample": "NOT_READY"
});
export const P4_OUTPUTS=freeze({
  "textLinear0": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:textLinear0:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "textGelu": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:textGelu:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "textEmbedded": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:textEmbedded:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "crossNorm": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:crossNorm:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "qkvQ": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:qkvQ:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "qkvK": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:qkvK:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "qkvV": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:qkvV:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "normQ": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:normQ:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "normK": {
    "dtype": "float32",
    "shape": [
      "L",
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:normK:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "crossContext": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:crossContext:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "crossO": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:crossO:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "crossResidual": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:crossResidual:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnLayerNorm": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnLayerNorm:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "shift": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:shift:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "scale": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:scale:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "gate": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:gate:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnModulated": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnModulated:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnUp": {
    "dtype": "float32",
    "shape": [
      2,
      13824
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnUp:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnGelu": {
    "dtype": "float32",
    "shape": [
      2,
      13824
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnGelu:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnDown": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnDown:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "ffnGated": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:ffnGated:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "blockOutput": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "semanticId": "works:p4-output:blockOutput:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "timeProjection3": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:timeProjection3:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "timeProjection4": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:timeProjection4:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  },
  "timeProjection5": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "semanticId": "works:p4-output:timeProjection5:f32",
    "meaningAuthority": "management-sidecar/owner-named-output",
    "ownerNativeMeaning": null
  }
});

/** Shapes are management wrappers for owner-named bare arrays, not owner nativeMeaning exports. */
export function p4OutputSpecs(textRows){
 if(!Number.isInteger(textRows)||textRows<1||textRows>512)throw Object.assign(new RangeError('P4 Text rows must be 1..512'),{code:'P4_DECLARATION_INVALID'});
 return freeze(Object.fromEntries(Object.entries(P4_OUTPUTS).map(([name,spec])=>[name,{...structuredClone(spec),shape:spec.shape.map(n=>n==='L'?textRows:n)}])));
}

/** Explicit manager observations only. Missing source observations remain null;
 * prior owner evidence never becomes this operation's numerical evidence.
 * conditioningMetadata is a JSON identity sidecar, not the native capture. */
export function prepareP4NormInputs({referenceSet,managerSourceRef,binding,target,conditioningMetadata,savedInputBindings,validationSpec,numericRequirement,resourceState,extensions}={}){
 try{for(const value of [managerSourceRef,binding,target,conditioningMetadata,savedInputBindings,validationSpec,numericRequirement,resourceState,extensions])if(value!==undefined)canonicalize(value);}catch(cause){throw Object.assign(new TypeError('P4 declarations require ordinary finite JSON metadata'),{code:'P4_DECLARATION_INVALID',cause});}
 const copy=value=>value===undefined?null:structuredClone(value),b=binding??{},t=target??{},conditioning=copy(conditioningMetadata),rows=conditioning?.rows;
 const outputs=Number.isInteger(rows)&&rows>=1&&rows<=512?structuredClone(p4OutputSpecs(rows)):null;
 const native={...structuredClone(P4_FIXED_DECLARATIONS),nativeProfileId:P4_PROFILE_ID,side:savedInputBindings?.side??null,scheduleIndex:savedInputBindings?.scheduleIndex??null,savedInputBindings:copy(savedInputBindings),conditioning,outputs};
 for(const field of ['sourceRef','buildId','kernelDigest','bridgeWasmSHA256','attentionWasmSHA256'])native[field]=copy(b[field]);
 const producerRef=b.bindingId??'p4-native',consumerRef=t.managerSessionId??'p4-manager',artifactId=`${t.requestId??'unselected-p4'}#blockOutput`;
 const semantics={schemaId:'works:p4-output',schemaVersion:'0.1',spaceId:'block0-hidden',unit:'unitless',normalization:'owner-defined'};
 const port=(side,sourceRef,build)=>({portId:side,bindingRef:side==='producer'?producerRef:consumerRef,owner:side==='producer'?b.ownerId??null:'manager',sourceRef:copy(sourceRef),nativeAPI:{version:side==='producer'?'diffusion-models/0.1':'works-p4-manager/0.1',build:build??null,transport:'direct',entrypoint:sourceRef?.path??null},artifactKind:'tensor',semantics:copy(semantics),profileRef:P4_PROFILE_ID,tensor:{dtypes:['float32'],shape:[2,5120],axes:['L','C']},requiredMetadata:['/meaning'],requiredIdentities:[],ownershipModes:['copy'],transports:['direct'],allowedAdapterRefs:[],requiredExtensionSchemas:[]});
 const producerPort=port('producer',b.sourceRef,b.buildId),consumerPort=port('consumer',managerSourceRef,managerSourceRef?.commit);
 const candidateSet={schemaVersion:'works-candidate-set/0.1-draft.1',status:'candidate',candidateSetId:'candidate:bernini-block0-n2-cross-ffn:5744f70',sourceRef:copy(P4_PINS.sourceRef),modules:[{module:'diffusion',sourceRef:copy(P4_PINS.sourceRef),kernel:copy(P4_PINS.mathWasm)},{module:'manager',sourceRef:copy(managerSourceRef)}]};
 const revisions=t.localRevisionBindings??{},activeBindings=Object.fromEntries(['producer','consumer'].map(side=>[side,{bindingRef:side==='producer'?producerRef:consumerRef,valid:true,ownerId:side==='producer'?b.ownerId??null:'manager',currentRevision:revisions[side]??null,expectedRevision:revisions[side]??null}]));
 const spec=copy(validationSpec),referenceRef=numericRequirement?.referenceRef;
 return {producerPort,consumerPort,artifact:{contractVersion:'works-module-contract/1.0-draft.1',artifactId,kind:'tensor',native:{schemaId:'works:p4-named-output',schemaVersion:'0.1',payloadRef:artifactId,metadata:{meaning:'works:p4-output:blockOutput:f32',meaningAuthority:'management-sidecar/owner-named-output',ownerNativeMeaning:null}},semantics:copy(semantics),profileRef:P4_PROFILE_ID,tensor:{dtype:'float32',shape:[2,5120],axes:['L','C'],nativeMeaning:'works:p4-output:blockOutput:f32',dataRef:artifactId},provenance:{producerRefs:[],consumerBindings:[],transformTraceRefs:[]},lineage:{inputs:[],sourceFrames:[]},snapshotId:null,ownership:{ownerId:b.ownerId??null,mode:'copy'},extensions:extensions===undefined?{}:copy(extensions)},adapters:[],registry:{schemas:[{schemaId:'works:p4-output',schemaVersion:'0.1',nativeMeanings:['works:p4-output:blockOutput:f32']},{schemaId:'works:p4-named-output',schemaVersion:'0.1'}],roles:['tensor-transform']},implementationState:{producer:{bindingRef:producerRef,state:'implemented',roles:['tensor-transform'],operationId:'p4-cross-ffn'},consumer:{bindingRef:consumerRef,state:'implemented',roles:['tensor-transform'],operationId:'p4-managed-output'}},requiredScopes:[],evidence:[],resourceState:copy(resourceState),activeBindings,referenceContext:{referenceSet,normIds:['N-IDENTITY','N-P4-SHAPE','N-P4-NUMERIC','N-EVIDENCE','N-TRANSACTION','N-ARTIFACT'],candidateSet,identityBindings:[{side:'producer',module:'diffusion',loadedSourceRef:copy(b.sourceRef),kernelDigest:b.kernelDigest??null,byteLength:b.byteLength??null},{side:'consumer',module:'manager',loadedSourceRef:copy(managerSourceRef)}],nativeDeclarations:{producer:native},profileBindings:[{recordId:P4_SHAPE_RECORD_ID,side:'producer',representation:'block0-hidden'},{recordId:P4_EXEC_RECORD_ID,side:'producer',representation:'block0-hidden'}],numericRequirements:numericRequirement===undefined?[]:[copy(numericRequirement)],validationSpec:spec,evidenceTarget:{artifactRef:artifactId,profileRef:P4_PROFILE_ID,coverage:spec?.coverage??'FIXED_N2',scope:spec?.scope??'P4_N2_CROSS_FFN_DIAGNOSTIC',baseKind:spec?.baseKind??'original-model-fixed-natural-n2',referenceId:referenceRef?.referenceId??null},managerState:{target:copy(target)},delegations:{'N-EVIDENCE':{checker:'owner-validation'},'N-TRANSACTION':{checker:'queue.mjs'},'N-ARTIFACT':{checker:'package.mjs'}},environment:'same-realm-native-owner'}};
}
