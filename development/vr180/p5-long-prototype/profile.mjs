// Fixed private trial profiles. These are limits, not measured capacities.
export const LONG_PROFILES = Object.freeze({
  'p5-5gb': Object.freeze({id:'p5-5gb',targetPayloadBytes:5_000_000_000,inputFileBytes:5_100_000_000,
    outputFileBytes:5_200_000_000,runnerFreeBytes:33_416_582_400,generationSeconds:900,conversionSeconds:900,
    transferSeconds:600,verificationSeconds:900}),
  'p5-10gb': Object.freeze({id:'p5-10gb',targetPayloadBytes:10_000_000_000,inputFileBytes:10_100_000_000,
    outputFileBytes:10_200_000_000,runnerFreeBytes:63_416_582_400,generationSeconds:1500,conversionSeconds:1500,
    transferSeconds:900,verificationSeconds:1500}),
});
export const LONG_CONTRACT=Object.freeze({width:1024,height:512,eyeSize:512,fps:30,silent:true,
  bitrate:32_000_000,maxFrames:100_000,maxMetadataBytes:16*1024**2,indexBytes:8*1024**2,
  sortBytes:4*1024**2,maxChunkBackingBytes:4*1024**2,transferChunkBytes:1024**2,
  eventPeriodFrames:300,eventFrameOffsets:Object.freeze([29,30,31]),seed:0x1802026});
export function longProfile(id){
  if(typeof id!=='string'||!Object.hasOwn(LONG_PROFILES,id))throw Error('LONG_PROFILE_UNSUPPORTED');
  return LONG_PROFILES[id];
}
export function generationNeedsFrame({frames,payloadBytes},profile){
  if(!Number.isSafeInteger(frames)||frames<0||frames>LONG_CONTRACT.maxFrames
    ||!Number.isSafeInteger(payloadBytes)||payloadBytes<0)throw Error('LONG_GENERATION_COUNTER_INVALID');
  return frames<LONG_CONTRACT.maxFrames&&payloadBytes<profile.targetPayloadBytes;
}
export function assertGenerated(stats,profile){
  if(!Number.isSafeInteger(stats.frames)||stats.frames<1||stats.frames>LONG_CONTRACT.maxFrames
    ||stats.packets!==stats.frames||!Number.isSafeInteger(stats.payloadBytes)||stats.payloadBytes<profile.targetPayloadBytes
    ||!Number.isSafeInteger(stats.bytes)||stats.bytes<stats.payloadBytes||stats.bytes>profile.inputFileBytes
    ||!Number.isSafeInteger(stats.maxPacketBytes)||stats.maxPacketBytes<=0
    ||stats.maxPacketBytes>LONG_CONTRACT.maxChunkBackingBytes||!stats.packetTimestampsStrictlyIncreasing)
    throw Error('LONG_GENERATED_MEDIA_TARGET_OR_PROFILE_FAILED');
}
