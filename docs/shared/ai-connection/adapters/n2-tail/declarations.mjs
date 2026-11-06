import {canonicalize} from '../../canonical.mjs';
/** Predeclarations for the fixed native owner. These metadata are not payload
 * acquisition, byte authentication, numerical acceptance or generation proof. */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const N2_TAIL_PROFILE_ID=freeze("bernini-block0-n2-self-attention-residual-f32-v1");
export const N2_TAIL_POLICY_ID=freeze("n2-self-attention-tail");
export const N2_TAIL_SHAPE_RECORD_ID=freeze("SHAPE-BERNINI-BLOCK0-N2-SELF-ATTENTION-RESIDUAL-F32");
export const N2_TAIL_EXEC_RECORD_ID=freeze("EXEC-BERNINI-BLOCK0-N2-SELF-ATTENTION-RESIDUAL-F32");
export const N2_TAIL_CATALOG_REF=freeze({
  "path": "docs/shared/ai-connection/reference/candidates/n2-tail/catalog.v1.json",
  "sha256": "aa492b66fc3775b561bd6535290ebb5eabf7328039c47238e009996bd417943b",
  "byteLength": 9589
});
export const N2_TAIL_PINS=freeze({
  "repository": "Kushyameln01/kushyameln-works",
  "managementBaseCommit": "03e18b6116c3d778197e4d34ba0364a7dbe918f6",
  "distributionCommit": "beffdcb800b629d0b13ff43bbc90e9f74c659152",
  "executionSourceCommit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
  "originalAcceptedNumericalSourceCommit": "e48021d8da29ef3b3b9e9d6161331c282798b6b3",
  "sourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
    "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs"
  },
  "buildId": "diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74",
  "stage": {
    "sha256": "ca35f70de8ced5a5c11223b63b98a1f346b1f21118d674195c6abd8c56ee33f3",
    "byteLength": 11994
  },
  "mathWasm": {
    "sha256": "54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925",
    "byteLength": 4018
  },
  "bridgeWasm": {
    "sha256": "ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd",
    "byteLength": 6899
  },
  "gateRef": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
      "path": "development/ai-connection/self-attention-tail/core/candidate-plan.json"
    },
    "sha256": "58a7a187d9580cd5af1d12e4d9552f8880a47c8a89e50b7bf1d27fec4ff11549",
    "byteLength": 5559,
    "gateId": "bernini-n2-tail-local-composed-eight-v1",
    "gates": {
      "localO": {
        "abs": 0.0001,
        "rel": 1e-05
      },
      "localGateProjection": {
        "abs": 0.001,
        "rel": 0.0001
      },
      "localGate": {
        "abs": 0.001,
        "rel": 0.0001
      },
      "localGated": {
        "abs": 0.001,
        "rel": 0.0001
      },
      "localResidual": {
        "abs": 0.001,
        "rel": 0.0001
      },
      "composedO": {
        "abs": 0.01,
        "rel": 0.001
      },
      "composedGated": {
        "abs": 0.01,
        "rel": 0.001
      },
      "composedResidual": {
        "abs": 0.01,
        "rel": 0.001
      }
    }
  },
  "buildSourceCount": 100,
  "runtimeImportClosureCount": 33,
  "parentCatalogSourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "6dae9a6fac3e9ad29ea941f22211edbe4aa894ad",
    "path": "docs/shared/ai-connection/reference/catalog.v1.json"
  },
  "parentCatalogSha256": "14978376e8fc3ca0ab018a9d360640b56f5152fefa0139200fbf72d16755a74c"
});
export const N2_TAIL_GATES=freeze({
  "localO": {
    "abs": 0.0001,
    "rel": 1e-05
  },
  "localGateProjection": {
    "abs": 0.001,
    "rel": 0.0001
  },
  "localGate": {
    "abs": 0.001,
    "rel": 0.0001
  },
  "localGated": {
    "abs": 0.001,
    "rel": 0.0001
  },
  "localResidual": {
    "abs": 0.001,
    "rel": 0.0001
  },
  "composedO": {
    "abs": 0.01,
    "rel": 0.001
  },
  "composedGated": {
    "abs": 0.01,
    "rel": 0.001
  },
  "composedResidual": {
    "abs": 0.01,
    "rel": 0.001
  }
});
export const N2_TAIL_FALSE_FLAGS=freeze([
  "productionHiddenVerified",
  "originalWorkflowInputsVerified",
  "originalProductionPrecisionVerified",
  "fullBlockVerified",
  "modelInference",
  "lowIsHighHandoff"
]);
export const N2_TAIL_TRUSTED_INPUTS=freeze({
  "HIGH": {
    "schemaVersion": "bernini-self-attention-tail-trusted-inputs/0.1",
    "side": "HIGH",
    "blockIndex": 0,
    "scheduleIndex": 1,
    "tokens": 2,
    "fullPrefix": {
      "receiptSHA256": "c12885eb71b0b46f91f79b94bba0315f1c9eae635daa3493686bb5882c7703f0",
      "artifactSHA256": "4493d93b56f434b6292da1c9898dd30b474444073796a10e25788d5c71a65a52",
      "patchHiddenSHA256": "29002478d22504cb4df1b193c4a75059b7e88568c38460f9ff7a61287dfa8f96",
      "timeAct1SHA256": "1b69ffc7e86fbc52ea9ae5bd32950d8e62439417089577f9c5f66243e0b734f7"
    },
    "attention": {
      "receiptSHA256": "75bdf4a9e6e09769d5edcbab400db103eead7822c92f12e355fc7028938b158b",
      "artifactSHA256": "26c4128fa09e2f755413787241fd32d28fe3f5bee23b85df2f64d9cd4c738ddf",
      "contextSHA256": "69838610e717a8d7c65adda4133233f581a5173cf10820a130471b96d75985ee",
      "fullPrefixReceiptSHA256": "c12885eb71b0b46f91f79b94bba0315f1c9eae635daa3493686bb5882c7703f0",
      "fullPrefixArtifactSHA256": "4493d93b56f434b6292da1c9898dd30b474444073796a10e25788d5c71a65a52"
    },
    "productionHiddenVerified": false,
    "originalWorkflowInputsVerified": false,
    "originalProductionPrecisionVerified": false,
    "fullBlockVerified": false,
    "modelInference": false,
    "lowIsHighHandoff": false,
    "load": "NOT_READY",
    "predict": "NOT_READY",
    "sample": "NOT_READY"
  },
  "LOW": {
    "schemaVersion": "bernini-self-attention-tail-trusted-inputs/0.1",
    "side": "LOW",
    "blockIndex": 0,
    "scheduleIndex": 3,
    "tokens": 2,
    "fullPrefix": {
      "receiptSHA256": "ec161f89a53f8dbd6b8c4a02c59a236ac544224cfe700592e8982900eeb4ade5",
      "artifactSHA256": "1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797",
      "patchHiddenSHA256": "1dc2ad17c0f7f7e7c41272efa538d573fc99e355c99dfd7b238cb9aa16e77b8b",
      "timeAct1SHA256": "cf07ca0bf0160886acafb9bf42d22f57f56482cd82a8cad5aa3791901e9938c5"
    },
    "attention": {
      "receiptSHA256": "618c46b6ad4233a519516d923dc8df317b54c8f673299ef2428fba9b99c23e77",
      "artifactSHA256": "2833c85cb79ce250fcc81ca2dac0e42e1a918126604661df13999b7c31304886",
      "contextSHA256": "b688a5ad16637c42fe22f1a069c1e786881f028aa23da421c27170e84f7778fd",
      "fullPrefixReceiptSHA256": "ec161f89a53f8dbd6b8c4a02c59a236ac544224cfe700592e8982900eeb4ade5",
      "fullPrefixArtifactSHA256": "1b2808f5ee1185db85cba4e2c59c030fd45d6e3c83c9fde457e70c7d1545d797"
    },
    "productionHiddenVerified": false,
    "originalWorkflowInputsVerified": false,
    "originalProductionPrecisionVerified": false,
    "fullBlockVerified": false,
    "modelInference": false,
    "lowIsHighHandoff": false,
    "load": "NOT_READY",
    "predict": "NOT_READY",
    "sample": "NOT_READY"
  }
});
export const N2_TAIL_OUTPUTS=freeze({
  "o": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "nativeMeaning": "self-attention-o-projection-token-hidden"
  },
  "gateProjection": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "nativeMeaning": "time-modulation-chunk2-gate-projection"
  },
  "gate": {
    "dtype": "float32",
    "shape": [
      5120
    ],
    "axes": [
      "C"
    ],
    "nativeMeaning": "time-modulation-chunk2-gate"
  },
  "gated": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "nativeMeaning": "self-attention-gated-token-hidden"
  },
  "residual": {
    "dtype": "float32",
    "shape": [
      2,
      5120
    ],
    "axes": [
      "L",
      "C"
    ],
    "nativeMeaning": "block0-self-attention-residual-token-hidden"
  }
});
export const N2_TAIL_REFERENCE_REFS=freeze({
  "HIGH": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
      "path": "development/ai-connection/self-attention-tail/core/reference-freeze.json"
    },
    "sha256": "e48ada4f8a44d9aced90886e3d67744d3571a4b7cde8bdb5ecdad2d107ffde42",
    "byteLength": 3712,
    "referenceId": "bernini-n2-tail:HIGH:local-composed-v1",
    "side": "HIGH",
    "blockIndex": 0,
    "scheduleIndex": 1,
    "local": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
        "path": "development/ai-connection/self-attention-tail/core/final-reference/high-local-reference-receipt.json"
      },
      "sha256": "467bba24bce9066abf00156b534c8df9df999dd2bf314844bf72882b9f33814b",
      "byteLength": 7665,
      "payloadSha256": "eabbe3255c99b815615ac06736c52e2f8547403ddb095f0f84be481fab64c9f1",
      "payloadByteLength": 836832
    },
    "composed": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
        "path": "development/ai-connection/self-attention-tail/core/final-reference/high-composed-reference-receipt.json"
      },
      "sha256": "4f9a25ea913d59fb0ba4d9f7ea7977c805bf14da54e6058095dc41c901648ae5",
      "byteLength": 7673,
      "payloadSha256": "9ca18c2e852dbd981b4bec745eab1ac24e1dde76658478ddc673b7fa2f7b9d8e",
      "payloadByteLength": 836814
    }
  },
  "LOW": {
    "sourceRef": {
      "repository": "Kushyameln01/kushyameln-works",
      "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
      "path": "development/ai-connection/self-attention-tail/core/reference-freeze.json"
    },
    "sha256": "e48ada4f8a44d9aced90886e3d67744d3571a4b7cde8bdb5ecdad2d107ffde42",
    "byteLength": 3712,
    "referenceId": "bernini-n2-tail:LOW:local-composed-v1",
    "side": "LOW",
    "blockIndex": 0,
    "scheduleIndex": 3,
    "local": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
        "path": "development/ai-connection/self-attention-tail/core/final-reference/low-local-reference-receipt.json"
      },
      "sha256": "5fe1601c3ef0f4391cb55ccb6bd6340fbc543b8fd77ca83410c15cb91a319774",
      "byteLength": 7662,
      "payloadSha256": "ac7596ea3bb2a071d3f3827ce06d14d9df426351fad01ebfd76e3e03df43234e",
      "payloadByteLength": 845041
    },
    "composed": {
      "sourceRef": {
        "repository": "Kushyameln01/kushyameln-works",
        "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
        "path": "development/ai-connection/self-attention-tail/core/final-reference/low-composed-reference-receipt.json"
      },
      "sha256": "5a4499396cd8fbedfd2b7a45bcd70d5c79557854f7240471b2190dd232bc1582",
      "byteLength": 7671,
      "payloadSha256": "2a30505c909fcca78fe1475a97c0cad01f0d2520b052abcefe628123681dd159",
      "payloadByteLength": 844845
    }
  }
});
export const N2_TAIL_FIXED_DECLARATIONS=freeze({
  "schemaVersion": "bernini-self-attention-tail/0.1",
  "precisionProfile": "scaled-e4m3fn-scalar-f32-v1 plus F16-to-F32; ORT F32 Gemm and Hike separate F32 multiply/add",
  "blockIndex": 0,
  "tokens": 2,
  "originalCoreShape": [
    1,
    2,
    5120
  ],
  "operatorShape": [
    2,
    5120
  ],
  "layout": "LC",
  "timeProjectionChunks": [
    2
  ],
  "residualBasis": "original-fullprefix-arrays.patchHidden",
  "kernelDigest": "54c1690e4581a1de0b231d0b538ff280696542c2eb44ebedb4c2c661a6dd3925",
  "bridgeWasmSHA256": "ea78e54c34d80dd5872f4d6e5d72fbd6092ed0c8698277c169b22d04d2ea36bd",
  "buildId": "diffusion-models/0.1+bba4dc740028dcecf849a36e395970b24358a6185378336d61d3a063ad72bc74",
  "sourceRef": {
    "repository": "Kushyameln01/kushyameln-works",
    "commit": "a49aac492cc68e2dd6037e0deb4a6954731a847a",
    "path": "docs/shared/diffusion-models/ort-bridge/self-attention-tail/stage.mjs"
  },
  "outputs": {
    "o": {
      "dtype": "float32",
      "shape": [
        2,
        5120
      ],
      "axes": [
        "L",
        "C"
      ],
      "nativeMeaning": "self-attention-o-projection-token-hidden"
    },
    "gateProjection": {
      "dtype": "float32",
      "shape": [
        5120
      ],
      "axes": [
        "C"
      ],
      "nativeMeaning": "time-modulation-chunk2-gate-projection"
    },
    "gate": {
      "dtype": "float32",
      "shape": [
        5120
      ],
      "axes": [
        "C"
      ],
      "nativeMeaning": "time-modulation-chunk2-gate"
    },
    "gated": {
      "dtype": "float32",
      "shape": [
        2,
        5120
      ],
      "axes": [
        "L",
        "C"
      ],
      "nativeMeaning": "self-attention-gated-token-hidden"
    },
    "residual": {
      "dtype": "float32",
      "shape": [
        2,
        5120
      ],
      "axes": [
        "L",
        "C"
      ],
      "nativeMeaning": "block0-self-attention-residual-token-hidden"
    }
  },
  "productionHiddenVerified": false,
  "originalWorkflowInputsVerified": false,
  "originalProductionPrecisionVerified": false,
  "fullBlockVerified": false,
  "modelInference": false,
  "lowIsHighHandoff": false,
  "load": "NOT_READY",
  "predict": "NOT_READY",
  "sample": "NOT_READY"
});

/** Snapshot explicit side/source/trust observations. Missing source receipts stay
 * null. Numeric requirements are predeclared identities only; evidence is never
 * created here. The native owner remains responsible for actual input hashes. */
export function describeN2TailDeclarations({side,sourceBinding={},trustedInputs,numericRequirement,artifactId}={}){
 if(!['HIGH','LOW'].includes(side))throw Object.assign(new TypeError('Fixed HIGH or LOW side required'),{code:'N2_TAIL_DECLARATION_INVALID'});
 try{for(const metadata of [sourceBinding,trustedInputs,numericRequirement])if(metadata!==undefined)canonicalize(metadata);}catch(error){throw Object.assign(new TypeError('Ordinary finite JSON declaration metadata required'),{code:'N2_TAIL_DECLARATION_INVALID',cause:error});}
 const observed=key=>sourceBinding?.[key]===undefined?null:structuredClone(sourceBinding[key]);
 const native={...structuredClone(N2_TAIL_FIXED_DECLARATIONS),nativeProfileId:N2_TAIL_PROFILE_ID,side,scheduleIndex:side==='HIGH'?1:3,trustedInputs:trustedInputs===undefined?null:structuredClone(trustedInputs)};
 for(const key of ['sourceRef','kernelDigest','bridgeWasmSHA256','buildId'])native[key]=observed(key);
 const requirements=numericRequirement===undefined?[]:[structuredClone(numericRequirement)];
 return freeze({nativeDeclarations:{producer:native},profileBindings:[{recordId:N2_TAIL_SHAPE_RECORD_ID,side:'producer',representation:'self-attention-post-token-hidden'},{recordId:N2_TAIL_EXEC_RECORD_ID,side:'producer',representation:'self-attention-post-token-hidden'}],numericRequirements:requirements,evidenceTarget:{artifactRef:artifactId??null,profileRef:N2_TAIL_PROFILE_ID,coverage:'FIXED_N2',scope:'ACTUAL_N2_BLOCK0_O_CHUNK2_GATE_AND_ORIGINAL_PATCH_HIDDEN_RESIDUAL_F32_DIAGNOSTIC',baseKind:'original-model-fixed-natural-n2',referenceId:numericRequirement?.referenceRef?.referenceId??null}});
}
