// New regression implementation after workspace loss; no historical source-hash claim.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FRAME_PROFILE, fillCalibrationFrame} from './frame.mjs';
const bytes = new Uint8ClampedArray(FRAME_PROFILE.rgbaBytes), records = [];
const hash = () => createHash('sha256').update(bytes).digest('hex');
for (const frameId of [0, 1, 28, 29, 30, 31, 32, 299]) {
  const info = fillCalibrationFrame(bytes, frameId), sha256 = hash();
  assert.equal(info.redEvent, [29, 30, 31].includes(frameId));
  fillCalibrationFrame(bytes, frameId); assert.equal(hash(), sha256);
  for (const eye of [0, 1]) {
    const p = 4 * (220 * FRAME_PROFILE.width + eye * 512 + 250);
    assert.equal(bytes[p + 3], 255);
    if (info.redEvent) assert.deepEqual([...bytes.subarray(p, p + 3)], [255, 0, 0]);
    else assert.equal(bytes[p], bytes[p + 1]);
  }
  records.push({...info, sha256});
}
assert.equal(new Set(records.map(x => x.sha256)).size, records.length);
assert.throws(() => fillCalibrationFrame(bytes, 1800), /PROFILE_INVALID/);
assert.throws(() => fillCalibrationFrame(bytes, 0, {fps: 24}), /PROFILE_INVALID/);
assert.throws(() => fillCalibrationFrame(new Uint8ClampedArray(4), 0), /PROFILE_INVALID/);
console.log(JSON.stringify({status: 'PIXEL_GENERATOR_ONLY_PASS', reconstruction: true,
  explicitRgbaBufferBytes: bytes.length, framesChecked: records.length, repeatedFrameHashes: 0,
  decoded: false, encoded: false, browserExecuted: false, capacityProfileChanged: false, records}, null, 2));
