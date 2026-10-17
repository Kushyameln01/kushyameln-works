import test from 'node:test';
import assert from 'node:assert/strict';
import {fillLongFrame,LONG_FRAME_PROFILE} from '../development/vr180/p5-long-prototype/frame.mjs';
import {fillCalibrationFrame} from '../development/vr180/p5-calibration-prototype/frame.mjs';
import {LONG_CONTRACT as C,longProfile,generationNeedsFrame,assertGenerated} from '../development/vr180/p5-long-prototype/profile.mjs';

test('long frame preserves the calibrated pixel formula at representative boundaries',()=>{
 const actual=new Uint8ClampedArray(LONG_FRAME_PROFILE.rgbaBytes),expected=new Uint8ClampedArray(actual.length);
 for(const frame of [0,28,29,30,31,32,299,329,1799]){
  assert.deepEqual(fillLongFrame(actual,frame),fillCalibrationFrame(expected,frame));assert.deepEqual(actual,expected);
 }
});
test('long frame bounds and recurring events extend through frame 99999 without a retained history',()=>{
 const data=new Uint8ClampedArray(LONG_FRAME_PROFILE.rgbaBytes);
 for(const [frame,event] of [[1800,false],[1829,true],[65535,false],[65536,false],[99929,true],[99999,false]]){
  const row=fillLongFrame(data,frame);assert.equal(row.redEvent,event);assert.equal(row.timestamp,frame/30);
 }
 assert.throws(()=>fillLongFrame(data,100000),/INVALID/);assert.throws(()=>fillLongFrame(data,1,{fps:60}),/INVALID/);
});
test('only explicit private profiles are admitted; actual packet bytes stop generation',()=>{
 assert.equal(longProfile('p5-5gb').targetPayloadBytes,5_000_000_000);
 assert.equal(longProfile('p5-10gb').outputFileBytes,10_200_000_000);
 for(const name of ['default','toString',null,{}])assert.throws(()=>longProfile(name),/UNSUPPORTED/);
 const p=longProfile('p5-5gb');assert.equal(generationNeedsFrame({frames:99,payloadBytes:p.targetPayloadBytes-1},p),true);
 assert.equal(generationNeedsFrame({frames:99,payloadBytes:p.targetPayloadBytes},p),false);
 assert.equal(generationNeedsFrame({frames:C.maxFrames,payloadBytes:1},p),false);
 assert.throws(()=>generationNeedsFrame({frames:100001,payloadBytes:1},p),/COUNTER/);
});
test('frame ceiling alone never proves payload success, and all final extents are checked',()=>{
 const p=longProfile('p5-10gb'),good={frames:60000,packets:60000,payloadBytes:10_000_000_001,bytes:10_001_000_001,
  maxPacketBytes:200000,packetTimestampsStrictlyIncreasing:true};assertGenerated(good,p);
 for(const changed of [{payloadBytes:9_999_999_999},{bytes:10_100_000_001},{packets:59999},{frames:100001},
  {maxPacketBytes:NaN},{maxPacketBytes:4*1024**2+1},{packetTimestampsStrictlyIncreasing:false}])
  assert.throws(()=>assertGenerated({...good,...changed},p),/TARGET_OR_PROFILE/);
});
