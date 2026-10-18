import {AUDIO_DEPENDENCY_MAX_BOX_BYTES, transferAudioDependenciesToTree, verifyAudioDependencyOutput} from '../audio-dependency.mjs';
/*!
 * Derived in part from Mediabunny 1.61.5 (Vanilagy and contributors).
 * Source Code Form is subject to Mozilla Public License, v. 2.0.
 * https://mozilla.org/MPL/2.0/
 * Modifications: VR180 bounded disk index / incremental metadata, 2026-10-17.
 */
// Fixed upstream adapter for the dedicated VR180 combined fork.
import {createIndexBudget, createIndexStore, INDEX_PAGE_BYTES as PAGE} from './index-store.mjs';
import {createOwnedIndexJob} from './job-owner.mjs';
import {inspectMp4} from './mp4-output-inspect.mjs';
import {INDEXED_PROFILE} from '../route-profile.mjs';
import {CONTAINER_METADATA_MAX_CONTAINER_BYTES, transferMetadataToTree} from '../container-metadata.mjs';

// Total records are disk-backed. Only one bounded reorder group is sorted in RAM.
export const PROFILE = Object.freeze({maxSamples: INDEXED_PROFILE.maxSamples, maxTimestampSamples: 100000, maxTracks: 2, maxChunkSamples: 4096,
  maxChunkBytes: 4 * 1024 ** 2, sortReservedBytes: 2 * 100000 * 8, maxLeafBytes: PAGE});
const fail = message => { throw Error(message); };
const safe = n => Number.isSafeInteger(n) && n >= 0;
const checked = n => safe(n) ? n : fail('UNSAFE_INDEX_POSITION');
const u32 = n => safe(n) && n <= 0xffffffff ? n : fail('INDEX_U32_OVERFLOW');
const i32 = n => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 ? n : fail('INDEX_I32_OVERFLOW');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const buffer = n => new Uint8Array(n);
const full = (type, contents) => ({type, contents});
const be = (...numbers) => { const b = buffer(numbers.length * 4), d = view(b); numbers.forEach((n, i) => d.setUint32(i * 4, u32(n))); return b; };
function readSample(bytes) { const d = view(bytes); return {timestamp: d.getFloat64(0, true), decodeTimestamp: d.getFloat64(8, true),
  duration: d.getFloat64(16, true), size: d.getUint32(24, true), key: !!d.getUint32(28, true),
  delta: d.getFloat64(32, true), composition: d.getInt32(40, true), offset: d.getFloat64(48, true)}; }
function writeSample(bytes, sample) { bytes.fill(0); const d = view(bytes);
  for (const [at, value] of [[0, sample.timestamp], [8, sample.decodeTimestamp], [16, sample.duration], [32, sample.delta], [48, sample.offset ?? 0]]) {
    if (!Number.isFinite(value)) fail('NONFINITE_SAMPLE_FIELD'); d.setFloat64(at, value, true);
  }
  d.setUint32(24, u32(sample.size), true); d.setUint32(28, +sample.key, true); d.setInt32(40, i32(sample.composition ?? 0), true); return bytes;
}
/** Creates a job-owned private controller. Bind it to only one fork Output. */
export async function createOutputIndex({root, jobId = crypto.randomUUID(), signal, lockManager = globalThis.navigator?.locks,
  budget = createIndexBudget(), layout = null, containerMetadata = null, audioDependencies = null, yieldTask = tick, ownerToken} = {}) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) fail('INVALID_OUTPUT_INDEX_JOB');
  if (!root?.getDirectoryHandle || !root?.removeEntry) fail('OUTPUT_INDEX_ROOT_UNAVAILABLE');
  if (layout !== null && !['sbs', 'tb'].includes(layout)) fail('INVALID_OUTPUT_INDEX_LAYOUT');
  const canceler = new AbortController();
  const externalAbort = () => canceler.abort(signal?.reason);
  signal?.addEventListener('abort', externalAbort, {once: true});
  if (signal?.aborted) externalAbort();
  const workSignal = canceler.signal;
  let pendingCleanup, owner, directory, removed = false, disposing, active, stopped = false, bound;
  let sort, page, releaseBuffers = () => {}, spool, spoolClosed = false, spoolFile, ftyp;
  let spoolBytes = 0, sampleCount = 0, moovPosition = null, verification = null, metadataSource = null;
  const tracks = [], stores = [];
  const stats = {peakChunkSamples: 0, peakChunkBytes: 0, peakChunkBackingBytes: 0, peakTimestampSamples: 0, peakSortBytes: 0,
    metadataWriteBytes: 0, metadataWriteCalls: 0, metadataReadBytes: 0, metadataReads: 0, metadataFlushes: 0,
    metadataClosed: false, peakWriterSections: 0, peakWriterChunks: 0, peakExplicitReservedBytes: 0};
  const check = () => { if (stopped || workSignal.aborted) throw new DOMException('Output index canceled.', 'AbortError'); };
  const peak = () => { stats.peakExplicitReservedBytes = Math.max(stats.peakExplicitReservedBytes, budget.usedBytes); };
  const operation = work => {
    if (active) return Promise.reject(Error('OUTPUT_INDEX_BUSY'));
    const p = (async () => { check(); return work(); })(); active = p;
    p.finally(() => { if (active === p) active = null; }).catch(() => {}); return p;
  };
  async function dispose() {
    if (removed) return; if (disposing) return disposing; stopped = true; canceler.abort();
    disposing = (async () => {
      try {
        await active?.catch(() => {});
        for (const state of tracks) state.chunk = null;
        if (pendingCleanup) { await pendingCleanup(); pendingCleanup = null; }
        for (const store of stores) await store.dispose();
        if (spool && !spoolClosed) { spool.close(); spoolClosed = true; }
        await owner?.dispose();
        releaseBuffers(); sort = null; page = null; removed = true;
        signal?.removeEventListener('abort', externalAbort);
      } finally { disposing = null; }
    })(); return disposing;
  }
  try {
    check();
    try { owner = await createOwnedIndexJob({root, jobId, ownerToken, kind: 'output', budget, signal: workSignal, lockManager}); }
    catch (error) { pendingCleanup = error.retryCleanup; throw error; }
    directory = owner.directory; check();
    releaseBuffers = budget.reserve(PROFILE.sortReservedBytes + PAGE + 4096);
    sort = new Float64Array(PROFILE.maxTimestampSamples); page = buffer(PAGE); peak();
    const file = await directory.getFileHandle('metadata.bin', {create: true});
    if (!file.createSyncAccessHandle) fail('OUTPUT_INDEX_SYNC_HANDLE_UNAVAILABLE');
    spool = await file.createSyncAccessHandle(); if (spool.getSize() !== 0) fail('OUTPUT_INDEX_SPOOL_NOT_EMPTY');
    spoolFile = file; check();
  } catch (error) { try { await dispose(); } catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = dispose; } throw error; }

  async function makeStore(track, name, width) {
    check(); let store;
    try { store = await createIndexStore({root: directory, jobId: `${jobId}-t${track.track.id}-${name}`,
      schema: {version: 1, recordBytes: width, endianness: 'little'}, budget, signal: workSignal, lockManager, yieldTask}); }
    catch (error) { pendingCleanup = error.retryCleanup; throw error; }
    stores.push(store); peak(); return store;
  }
  async function trackState(track) {
    if (track.vr180Index) return track.vr180Index;
    if (tracks.length >= PROFILE.maxTracks || !['video', 'audio'].includes(track.type)
      || (track.type === 'video' ? track.track.source._codec !== 'avc' : track.track.source._codec !== 'aac')) fail('OUTPUT_INDEX_PROFILE_UNSUPPORTED');
    if (tracks.some(t => t.track.type === track.type)) fail('OUTPUT_INDEX_DUPLICATE_TRACK_TYPE');
    const state = {track, count: 0, gopStart: 0, previous: null, lastUnits: null, chunk: null, bytes: 0,
      min: Infinity, end: -Infinity, presentationSpan: 0, keyCount: 0, chunkCount: 0, lastOffset: 0,
      needsCtts: false, cslg: null, sealed: false, tables: {}};
    tracks.push(state); track.vr180Index = state;
    for (const [name, width] of [['samples', 64], ['chunks', 24], ['stts', 8], ['ctts', 8], ['stsc', 12], ['stss', 4]]) state.tables[name] = await makeStore(track, name, width);
    state.tableBox = type => tableBox(state, type);
    return state;
  }
  async function getSample(state, id, dest = buffer(64)) { await state.tables.samples.readRecord(id, dest); return readSample(dest); }
  async function putSample(state, id, sample, dest = buffer(64)) { await state.tables.samples.patchRecord(id, writeSample(dest, sample)); }
  async function processTimestamps(state) {
    const count = state.count - state.gopStart; if (!count) return;
    if (count > PROFILE.maxTimestampSamples) fail('OUTPUT_INDEX_REORDER_LIMIT');
    check(); stats.peakTimestampSamples = Math.max(stats.peakTimestampSamples, count);
    stats.peakSortBytes = Math.max(stats.peakSortBytes, count * 8);
    const bytes = buffer(64);
    for (let i = 0; i < count; i++) { check(); sort[i] = (await getSample(state, state.gopStart + i, bytes)).timestamp; }
    // Fixed reorder-group capacity independent of total file duration/sample count.
    sort.subarray(0, count).sort(); await yieldTask(); check();
    const track = state.track; track.startTimestampOffset ??= sort[0];
    for (let i = 0; i < count; i++) {
      check(); const id = state.gopStart + i, sample = await getSample(state, id, bytes);
      sample.decodeTimestamp = sort[i]; sample.composition = Math.round((sample.timestamp - sample.decodeTimestamp) * track.timescale);
      if (state.previous !== null) {
        const delta = Math.round(sample.decodeTimestamp * track.timescale - state.lastUnits); u32(delta);
        state.lastUnits += delta;
        const previous = await getSample(state, state.previous, bytes); previous.delta = delta;
        await putSample(state, state.previous, previous, bytes);
      } else state.lastUnits = sample.decodeTimestamp * track.timescale;
      await putSample(state, id, sample, bytes); state.previous = id;
    }
    state.gopStart = state.count;
  }
  function writerMetrics(writer) {
    stats.peakWriterSections = Math.max(stats.peakWriterSections, writer.target._sections?.length ?? 0);
    stats.peakWriterChunks = Math.max(stats.peakWriterChunks, writer.target._chunks?.length ?? 0);
  }
  async function flushChunk(state, writer) {
    if (!state.chunk) return; check(); const chunk = state.chunk, offset = checked(writer.getPos()), bytes = buffer(64);
    for (const item of chunk.samples) {
      check(); const sample = await getSample(state, item.id, bytes); sample.offset = checked(writer.getPos());
      await putSample(state, item.id, sample, bytes);
      // Bound both the upstream Writer sections and each backpressure interval.
      for (let at = 0; at < item.data.length; at += PAGE) {
        check(); writer.write(item.data.subarray(at, at + PAGE)); writerMetrics(writer); await writer.flush();
      }
      item.data = null;
    }
    const record = buffer(24), d = view(record); d.setFloat64(0, offset, true); d.setFloat64(8, chunk.samples.length, true); d.setFloat64(16, chunk.start, true);
    await state.tables.chunks.appendRecord(record); state.chunkCount++; state.lastOffset = offset; state.chunk = null;
  }
  async function register(muxer, track, original) {
    const state = await trackState(track); check();
    if (sampleCount >= PROFILE.maxSamples) fail('OUTPUT_INDEX_SAMPLE_LIMIT');
    if (original.type === 'key') await processTimestamps(state);
    if (state.count - state.gopStart >= PROFILE.maxTimestampSamples) fail('OUTPUT_INDEX_REORDER_LIMIT');
    const sample = {timestamp: original.timestamp, decodeTimestamp: original.timestamp, duration: original.duration,
      size: original.size, key: original.type === 'key', delta: Math.round(original.duration * track.timescale), composition: 0, offset: 0};
    if (state.chunk) {
      state.chunk.start = Math.min(state.chunk.start, sample.timestamp);
      if (sample.timestamp - state.chunk.start >= 0.5) await flushChunk(state, muxer.writer);
    }
    state.chunk ??= {start: sample.timestamp, bytes: 0, backingBytes: 0, samples: []};
    if (state.chunk.samples.length >= PROFILE.maxChunkSamples || sample.size > PROFILE.maxChunkBytes - state.chunk.bytes) fail('OUTPUT_INDEX_CHUNK_LIMIT');
    // Conservatively count every borrowed backing allocation, even shared buffers.
    const backingBytes = checked(original.data?.buffer?.byteLength);
    if (backingBytes > PROFILE.maxChunkBytes - state.chunk.backingBytes) fail('OUTPUT_INDEX_CHUNK_BACKING_LIMIT');
    await state.tables.samples.appendRecord(writeSample(buffer(64), sample));
    state.chunk.samples.push({id: state.count, data: original.data}); state.chunk.bytes += sample.size; state.chunk.backingBytes += backingBytes;
    state.count++; sampleCount++; state.bytes += sample.size;
    state.min = Math.min(state.min, sample.timestamp); state.end = Math.max(state.end, sample.timestamp + sample.duration);
    stats.peakChunkSamples = Math.max(stats.peakChunkSamples, state.chunk.samples.length);
    stats.peakChunkBytes = Math.max(stats.peakChunkBytes, state.chunk.bytes);
    stats.peakChunkBackingBytes = Math.max(stats.peakChunkBackingBytes, state.chunk.backingBytes); peak();
  }
  async function appendRun(store, values) {
    const bytes = buffer(values.length * 4), d = view(bytes);
    values.forEach((value, index) => d.setUint32(index * 4, u32(value), true));
    await store.appendRecord(bytes);
  }
  async function finishTrack(state, writer) {
    await processTimestamps(state); await flushChunk(state, writer);
    const track = state.track, span = state.count ? state.end - state.min : 0;
    track.avgBitrate = span > 0 ? Math.round(8 * state.bytes / span) : 0;
    let windowStart = 0, windowBytes = 0, maxWindowBytes = 0, stts = null, ctts = null;
    let min = Infinity, end = -Infinity, cmin = Infinity, cmax = -Infinity, startTick = Infinity, endTick = -Infinity;
    const bytes = buffer(64), older = buffer(64);
    const emitCtts = async run => { const b = buffer(8), d = view(b); d.setUint32(0, u32(run.count), true); d.setInt32(4, i32(run.value), true); await state.tables.ctts.appendRecord(b); };
    for (let id = 0; id < state.count; id++) {
      check(); const sample = await getSample(state, id, bytes); windowBytes += sample.size;
      while (sample.decodeTimestamp - (await getSample(state, windowStart, older)).decodeTimestamp >= 1) {
        check(); windowBytes -= (await getSample(state, windowStart, older)).size; windowStart++;
      }
      maxWindowBytes = Math.max(maxWindowBytes, windowBytes);
      if (stts?.value === sample.delta) stts.count++; else { if (stts) await appendRun(state.tables.stts, [stts.count, stts.value]); stts = {count: 1, value: sample.delta}; }
      if (ctts?.value === sample.composition) ctts.count++; else { if (ctts) await emitCtts(ctts); ctts = {count: 1, value: sample.composition}; }
      if (sample.key) { state.keyCount++; await appendRun(state.tables.stss, [id + 1]); }
      cmin = Math.min(cmin, sample.composition); cmax = Math.max(cmax, sample.composition);
      const shifted = sample.timestamp - (track.startTimestampOffset ?? 0);
      min = Math.min(min, shifted); end = Math.max(end, shifted + sample.duration);
      startTick = Math.min(startTick, Math.round(shifted * track.timescale)); endTick = Math.max(endTick, Math.round((shifted + sample.duration) * track.timescale));
    }
    if (stts) await appendRun(state.tables.stts, [stts.count, stts.value]); if (ctts) await emitCtts(ctts);
    track.maxBitrate = 8 * maxWindowBytes; state.presentationSpan = state.count ? end - min : 0;
    state.needsCtts = cmin !== 0 || cmax !== 0;
    if (state.needsCtts && endTick < 2147483648) {
      const b = buffer(24), d = view(b); [Math.max(-cmin, 0), cmin, cmax, startTick, endTick].forEach((value, i) => d.setInt32(4 + i * 4, i32(value)));
      state.cslg = full('cslg', b);
    }
    let lastCount = null;
    await state.tables.chunks.iterate(async (b, id) => { check(); const count = view(b).getFloat64(8, true);
      if (lastCount !== count) { await appendRun(state.tables.stsc, [id + 1, count, 1]); lastCount = count; }
    });
    for (const store of Object.values(state.tables)) await store.seal(); state.sealed = true;
  }
  function tableBox(state, type) {
    if (!state.sealed) fail('OUTPUT_INDEX_TABLE_UNSEALED');
    if (type === 'cslg') return state.cslg;
    if (type === 'stss' && state.keyCount === state.count) return null;
    let count, width, prefix = 8, store;
    if (type === 'stsz') { count = state.count; width = 4; prefix = 12; store = state.tables.samples; }
    else if (type === 'stco') { count = state.chunkCount; width = state.lastOffset >= 2 ** 32 ? 8 : 4; type = width === 8 ? 'co64' : 'stco'; store = state.tables.chunks; }
    else { store = state.tables[type]; count = store.metrics.count; width = type === 'stsc' ? 12 : type === 'stss' ? 4 : 8; }
    const contents = buffer(prefix), d = view(contents); if (type === 'ctts') contents[0] = 1;
    d.setUint32(prefix - 4, u32(count));
    return {type, contents, vr180Table: {store, width, count}, vr180ContentBytes: checked(prefix + count * width)};
  }
  function tagTree(box) {
    if (layout && box.type === 'avc1') {
      const state = tracks.find(s => s.track.type === 'video'), {width, height} = state.track.info;
      if (layout === 'sbs' ? width !== height * 2 : height !== width * 2) fail('VR180_GEOMETRY_MISMATCH');
      box.children = [...box.children.filter(b => b && !['st3d', 'sv3d'].includes(b.type)),
        full('st3d', Uint8Array.of(0, 0, 0, 0, layout === 'sbs' ? 2 : 1)),
        {type: 'sv3d', children: [full('svhd', new Uint8Array([0, 0, 0, 0, ...new TextEncoder().encode('Kushyameln Works VR180 b1\0')])),
          {type: 'proj', children: [full('prhd', be(0, 0, 0, 0)), full('equi', be(0, 0, 0, 0x40000000, 0x40000000))]}]}];
    }
    for (const child of box.children ?? []) if (child) tagTree(child);
  }
  function measure(box) {
    if (box.vr180Raw) {
      const limit = box.vr180AudioDependency ? AUDIO_DEPENDENCY_MAX_BOX_BYTES : CONTAINER_METADATA_MAX_CONTAINER_BYTES;
      if (box.vr180Raw.size > limit) fail('OUTPUT_METADATA_TRANSFER_LIMIT');
      return box.vr180Size = box.vr180Raw.size;
    }
    let content = box.vr180ContentBytes ?? (box.contents?.byteLength ?? 0);
    if (!box.vr180Table && content > PROFILE.maxLeafBytes) fail('OUTPUT_INDEX_LEAF_LIMIT');
    for (const child of box.children ?? []) if (child) content = checked(content + measure(child));
    box.vr180Size = checked(content + (content + 8 >= 2 ** 32 ? 16 : 8)); return box.vr180Size;
  }
  async function emit(writer, bytes) {
    for (let at = 0; at < bytes.length; at += PAGE) {
      check(); const part = bytes.subarray(at, at + PAGE); writer.write(part); writerMetrics(writer); await writer.flush();
      for (let done = 0, calls = 0; done < part.length;) {
        check(); const written = spool.write(part.subarray(done), {at: spoolBytes});
        if (!safe(written) || written > part.length - done || written === 0) fail('OUTPUT_INDEX_SPOOL_NO_PROGRESS');
        done += written; spoolBytes += written; stats.metadataWriteBytes += written; stats.metadataWriteCalls++;
        if (++calls % 64 === 0) { await yieldTask(); check(); }
      }
      await yieldTask(); check();
    }
  }
  async function writeBox(writer, box) {
    check();
    if (box.vr180Raw) {
      for (let at = 0; at < box.vr180Raw.size; at += PAGE) {
        check(); const bytes = new Uint8Array(await box.vr180Raw.slice(at, at + PAGE).arrayBuffer());
        await emit(writer, bytes);
      }
      return;
    }
    const header = buffer(box.vr180Size >= 2 ** 32 ? 16 : 8), d = view(header);
    d.setUint32(0, header.length === 16 ? 1 : u32(box.vr180Size)); for (let i = 0; i < 4; i++) header[4 + i] = box.type.charCodeAt(i);
    if (header.length === 16) d.setBigUint64(8, BigInt(box.vr180Size)); await emit(writer, header);
    if (box.contents) await emit(writer, box.contents);
    if (box.vr180Table) {
      let used = 0; const {store, width} = box.vr180Table, d = view(page);
      await store.iterate(async bytes => {
        check(); if (used + width > PAGE) { await emit(writer, page.subarray(0, used)); used = 0; }
        const s = view(bytes);
        if (box.type === 'stsz') d.setUint32(used, s.getUint32(24, true));
        else if (box.type === 'co64') d.setBigUint64(used, BigInt(checked(s.getFloat64(0, true))));
        else if (box.type === 'stco') d.setUint32(used, u32(s.getFloat64(0, true)));
        else for (let i = 0; i < width; i += 4) d.setUint32(used + i, s.getUint32(i, true));
        used += width;
      });
      if (used) await emit(writer, page.subarray(0, used));
    }
    for (const child of box.children ?? []) if (child) await writeBox(writer, child);
  }
  function sourceFor(file, mdatPosition, mdatBytes, extent) {
    const header = buffer(16), d = view(header); d.setUint32(0, mdatBytes >= 2 ** 32 ? 1 : u32(mdatBytes)); header.set(new TextEncoder().encode('mdat'), 4);
    if (mdatBytes >= 2 ** 32) d.setBigUint64(8, BigInt(mdatBytes));
    const ranges = [{start: 0, end: ftyp.length, blob: new Blob([ftyp])}, {start: mdatPosition, end: mdatPosition + 16, blob: new Blob([header])},
      {start: moovPosition, end: extent, blob: file}];
    return {size: extent, slice(start, end) {
      checked(start); checked(end); if (start > end || end > extent) fail('OUTPUT_METADATA_RANGE_INVALID');
      const parts = []; let at = start;
      for (const range of ranges) {
        if (at >= end) break; if (at < range.start || at >= range.end) continue;
        const stop = Math.min(end, range.end); parts.push(range.blob.slice(at - range.start, stop - range.start)); at = stop;
      }
      if (at !== end) fail('OUTPUT_METADATA_PAYLOAD_UNAVAILABLE');
      stats.metadataReadBytes += end - start; stats.metadataReads++; return new Blob(parts);
    }};
  }
  const api = {
    profile: PROFILE,
    get owner() { return owner.ticket; },
    get metrics() { peak(); return {profile: PROFILE, jobId, sampleCount, moovPosition, moovBytes: spoolBytes, verification,
      ...stats, explicitReservedBytes: budget.usedBytes, budgetPeakBytes: budget.peakBytes, disposed: removed,
      tracks: tracks.map(s => ({id: s.track.track.id, samples: s.count, chunks: s.chunkCount,
        liveChunkSamples: s.chunk?.samples.length ?? 0, liveChunkBytes: s.chunk?.bytes ?? 0, liveChunkBackingBytes: s.chunk?.backingBytes ?? 0,
        tables: Object.fromEntries(Object.entries(s.tables).map(([name, store]) => [name, store.metrics]))}))}; },
    get metadataSource() { return metadataSource; },
    start(muxer) {
      check(); if (bound) fail('OUTPUT_INDEX_ALREADY_BOUND'); bound = muxer;
      if (muxer.fastStart !== false || muxer.isFragmented || muxer.isQuickTime || muxer.isCmaf || muxer.formatOptions.onMoov || muxer.formatOptions.onMdat
        || muxer.output.tracks.length > PROFILE.maxTracks || Object.keys(muxer.output._metadataTags ?? {}).length) fail('OUTPUT_INDEX_PROFILE_UNSUPPORTED');
      if (muxer.formatOptions.onFtyp) fail('OUTPUT_INDEX_FTYP_CALLBACK_UNSUPPORTED');
      muxer.formatOptions.onFtyp = bytes => { if (bytes.length > 1024) fail('OUTPUT_INDEX_FTYP_LIMIT'); ftyp = bytes.slice(); };
    },
    register(muxer, track, sample) { return operation(() => register(muxer, track, sample)); },
    closeTrack(track) { return operation(async () => { if (track.vr180Index) await processTimestamps(track.vr180Index); }); },
    finalize(muxer, makeMoov) { return operation(async () => {
      for (const track of muxer.trackDatas) await finishTrack(await trackState(track), muxer.writer);
      check(); muxer.ensureOneEnabledTrack();
      const mdatPosition = muxer.boxWriter.offsets.get(muxer.mdat), mdatBytes = checked(muxer.writer.getPos() - mdatPosition);
      muxer.mdat.size = mdatBytes; muxer.mdat.largeSize = mdatBytes >= 2 ** 32; muxer.boxWriter.patchBox(muxer.mdat); await muxer.writer.flush();
      const tree = makeMoov(muxer); tagTree(tree);
      const trackKinds = muxer.trackDatas.map(track => track.type === 'video' ? 'vide' : 'soun');
      transferMetadataToTree(tree, trackKinds, containerMetadata);
      transferAudioDependenciesToTree(tree, trackKinds, audioDependencies, {audioCount: tracks.find(state => state.track.type === 'audio')?.count ?? 0});
      const size = measure(tree); moovPosition = muxer.writer.getPos();
      await writeBox(muxer.writer, tree); if (spoolBytes !== size || spool.getSize() !== size) fail('OUTPUT_INDEX_SPOOL_EXTENT_MISMATCH');
      check(); spool.flush(); stats.metadataFlushes++; spool.close(); spoolClosed = true; stats.metadataClosed = true;
      const file = await spoolFile.getFile(); if (file.size !== size) fail('OUTPUT_INDEX_SPOOL_FILE_MISMATCH');
      const extent = checked(moovPosition + size); metadataSource = sourceFor(file, mdatPosition, mdatBytes, extent);
      verification = await inspectMp4(metadataSource, {signal: workSignal});
      await verifyAudioDependencyOutput(metadataSource, audioDependencies, {signal: workSignal}); check();
      if (layout && !verification.projection) fail('OUTPUT_INDEX_VR_METADATA_MISSING');
      return {size, extent, source: metadataSource};
    }); },
    dispose, abort: dispose,
  };
  return Object.freeze(api);
}
