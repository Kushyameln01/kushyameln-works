// Preserve the existing public URL and API. The fixed native owner retains its
// relative Worker/ORT/Hike tree and its own codec; other modules are unchanged.
export {createDiffusionModels,attachDiffusionPort,createDiffusionWeightClient,
 createBerniniP4Execution,describeExecutionCapabilities,checkExecutionSupport,
 PROTOCOL_VERSION,WEIGHT_PORT_PROTOCOL,BUILD_ID,MAX_TENSOR_ELEMENTS}
 from '../../ai-connection/adapters/diffusion-public/native.mjs';
