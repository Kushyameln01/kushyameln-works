import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectMp4, tagMp4} from '../docs/shared/vr180/mp4.mjs';
import {collectContainerMetadata, transferMetadataToTaggedBlob, transferMetadataToTree,
  CONTAINER_METADATA_LIMIT} from '../docs/shared/vr180/container-metadata.mjs';

const box = (type, ...parts) => {
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, 8 + parts.reduce((n, part) => n + part.size, 0));
  for (let i = 0; i < 4; i++) header[4 + i] = type.charCodeAt(i);
  return new Blob([header, ...parts]);
};
async function children(blob) {
  const result = [];
  for (let at = 0; at < blob.size;) {
    const bytes = new Uint8Array(await blob.slice(at, at + 16).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const size = view.getUint32(0) === 1 ? Number(view.getBigUint64(8)) : view.getUint32(0);
    const header = view.getUint32(0) === 1 ? 16 : 8;
    assert(size >= header && at + size <= blob.size);
    result.push({type: String.fromCharCode(...bytes.subarray(4, 8)), start: at,
      raw: blob.slice(at, at + size), body: blob.slice(at + header, at + size)});
    at += size;
  }
  return result;
}
async function baseFile() {
  const bytes = await readFile(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url));
  // Move the active moov to EOF without shifting any media/sample offsets.
  return tagMp4(new Blob([bytes]), {layout: 'sbs'});
}
function descriptive(scope) {
  return [box('cprt', new Blob([new Uint8Array(6), `Copyright ${scope}\0`])),
    box('name', new Blob([`Title ${scope}\0`]))];
}
async function addMetadata(file, scopes = ['movie', 'vide', 'soun']) {
  const movie = (await children(file)).find(node => node.type === 'moov');
  assert.equal(movie.start + movie.raw.size, file.size);
  const parts = [];
  let track = 0;
  for (const node of await children(movie.body)) {
    const scope = node.type === 'trak' ? ['vide', 'soun'][track++] : null;
    parts.push(scope && scopes.includes(scope)
      ? box('trak', node.body, box('udta', box('udta', ...descriptive(scope)))) : node.raw);
  }
  if (scopes.includes('movie')) parts.push(box('udta', ...descriptive('movie')));
  return new Blob([file.slice(0, movie.start), box('moov', ...parts)]);
}
async function atoms(blobs) {
  const result = [];
  for (const blob of blobs) for (const node of await children(blob)) {
    if (node.type === 'udta') result.push(...await atoms([node.body]));
    else if (['cprt', 'name'].includes(node.type)) result.push(Buffer.from(await node.raw.arrayBuffer()));
  }
  return result;
}

test('admitted udta/cprt and udta/name survive pixel metadata transfer in movie and nested track scopes', async () => {
  const base = await baseFile(), input = await addMetadata(base);
  assert.equal((await inspectMp4(input)).transcodeSafe, true);
  const baseline = await collectContainerMetadata(base), metadata = await collectContainerMetadata(input);
  assert.equal(metadata.report.retainedContainers, baseline.report.retainedContainers + 6);
  assert.equal(metadata.report.omittedContainers, baseline.report.omittedContainers);
  for (const scope of ['movie', 'vide', 'soun']) {
    assert.deepEqual(await atoms(metadata.scopes[scope]),
      await Promise.all(descriptive(scope).map(async blob => Buffer.from(await blob.arrayBuffer()))));
  }
  // A fresh pixel muxer supplies its own sample tables; all descriptive scopes
  // must survive both the ordinary Blob merger and indexed tree merger.
  const transferred = await transferMetadataToTaggedBlob(base, metadata);
  assert.equal((await inspectMp4(transferred)).transcodeSafe, true);
  const recovered = await collectContainerMetadata(transferred);
  for (const scope of ['movie', 'vide', 'soun'])
    assert.deepEqual(await atoms(recovered.scopes[scope]), await atoms(metadata.scopes[scope]));
  const tree = {type: 'moov', children: [{type: 'trak', children: []}, {type: 'trak', children: []}]};
  transferMetadataToTree(tree, ['vide', 'soun'], metadata);
  for (const [i, scope] of ['vide', 'soun'].entries())
    assert.deepEqual(await atoms(tree.children[i].children.map(node => node.vr180Raw)), await atoms(metadata.scopes[scope]));
  assert.deepEqual(await atoms(tree.children.filter(node => node.type === 'metadata-raw').map(node => node.vr180Raw)), await atoms(metadata.scopes.movie));
  // The existing metadata-only route continues to preserve these exact bytes.
  const copied = await collectContainerMetadata(await tagMp4(input, {layout: 'sbs'}));
  for (const scope of ['movie', 'vide', 'soun'])
    assert.deepEqual(await atoms(copied.scopes[scope]), await atoms(metadata.scopes[scope]));
});

test('raw descriptive metadata shares the transfer budget and discloses overflow without reading payloads', async () => {
  const first = box('cprt', new Blob([new Uint8Array(CONTAINER_METADATA_LIMIT - 8)]));
  const last = box('name', new Blob(['last']));
  const blob = box('moov', box('udta', first, last));
  let maximumRead = 0;
  const source = {size: blob.size, slice(start, end) {
    const range = blob.slice(start, end), read = range.arrayBuffer.bind(range);
    range.arrayBuffer = () => { maximumRead = Math.max(maximumRead, range.size); return read(); };
    return range;
  }};
  const metadata = await collectContainerMetadata(source);
  assert.equal(metadata.report.retainedContainers, 1);
  assert.equal(metadata.report.retainedBytes, CONTAINER_METADATA_LIMIT);
  assert.equal(metadata.report.omittedContainers, 1);
  assert.deepEqual(metadata.report.omissionReasons, ['metadata transfer budget']);
  assert.equal(metadata.report.peakMetadataParseBytes, 0);
  assert(maximumRead <= 8, 'descriptive payloads remain Blob ranges');
});
