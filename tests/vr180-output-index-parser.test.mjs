import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as original from '../docs/shared/media-basic/vendor/mediabunny.mjs';
import {inspectMp4 as publicInspect} from '../docs/shared/vr180/mp4.mjs';
import {inspectMp4} from '../development/vr180/output-index-prototype/mp4-output-inspect.mjs';
import {seed, generate} from '../tools/vr180/compare-output-index.mjs';
let bytes, cslg, ancestors;
test.before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'vr180-cslg-'));
  try {
    const file = join(root, 'original.mp4'); await generate({module: original, file, count: 4, pattern: 'alternating-ctts', seed: await seed()}); bytes = new Uint8Array(await readFile(file));
    const d = new DataView(bytes.buffer);
    function scan(start, end, parents = []) {
      for (let at = start; at < end;) { const size = d.getUint32(at), type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        assert(size >= 8 && at + size <= end);
        if (type === 'cslg') { cslg = at; ancestors = parents; return true; }
        if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type) && scan(at + 8, at + size, [...parents, at])) return true;
        at += size;
      }
    }
    scan(0, bytes.length); assert(Number.isInteger(cslg)); assert.equal(d.getUint32(cslg), 32);
  } finally { await rm(root, {recursive: true, force: true}); }
});
test('fixed original cslg is rejected publicly and fully validated only in private output parser', async () => {
  await assert.rejects(publicInspect(new Blob([bytes])), /unsupported cslg/);
  const info = await inspectMp4(new Blob([bytes])); assert.equal(info.sampleCounts.video, 4);
});
test('private cslg refuses changed version, flags and every summary field', async () => {
  for (const offset of [8, 11, 12, 16, 20, 24, 28]) {
    const bad = bytes.slice(); bad[cslg + offset] ^= 1;
    await assert.rejects(inspectMp4(new Blob([bad])), /cslg/);
  }
});
test('private cslg rejects duplicate boxes and keeps the unknown-box refusal', async () => {
  const duplicate = new Uint8Array(bytes.length + 32); duplicate.set(bytes.subarray(0, cslg + 32));
  duplicate.set(bytes.subarray(cslg, cslg + 32), cslg + 32); duplicate.set(bytes.subarray(cslg + 32), cslg + 64);
  const d = new DataView(duplicate.buffer); for (const at of ancestors) d.setUint32(at, d.getUint32(at) + 32);
  await assert.rejects(inspectMp4(new Blob([duplicate])), /duplicate\/multiple cslg/);
  const unknown = bytes.slice(); unknown.set(new TextEncoder().encode('nope'), cslg + 4);
  await assert.rejects(inspectMp4(new Blob([unknown])), /unsupported nope/);
});
