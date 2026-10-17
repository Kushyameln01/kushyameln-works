/*!
 * Derived in part from Mediabunny 1.61.5 (Vanilagy and contributors).
 * Source Code Form is subject to Mozilla Public License, v. 2.0.
 * https://mozilla.org/MPL/2.0/
 * Modifications: VR180 private asynchronous input-index prototype, 2026-10-17.
 */
import {createIndexBudget, createIndexStore, INDEX_PAGE_BYTES as PAGE} from '../index-prototype/index-store.mjs';
import {createOwnedIndexJob} from '../index-prototype/job-owner.mjs';
import {inspectMp4 as inspectPublicMp4} from '../../../docs/shared/vr180/mp4.mjs';
import {inspectMp4 as inspectFixedMuxerFixture} from '../output-index-prototype/mp4-output-inspect.mjs';
import {buildPresentationIndex} from './presentation-index.mjs';

export const INPUT_PROFILE = Object.freeze({maxSamples: 100000, maxTracks: 2, metadataBytes: 16 * 1024 ** 2,
  pageBytes: PAGE, sortBytes: 4 * 1024 ** 2, mergeFanIn: 8, maxBoxes: 20000, maxDepth: 16});
const safe = n => Number.isSafeInteger(n) && n >= 0;
const fail = message => { throw Error(message); };
const checked = n => safe(n) ? n : fail('INPUT_UNSAFE_POSITION');
const dv = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const word = (bytes, at = 4) => String.fromCharCode(...bytes.subarray(at, at + 4));
const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
const tables = new Set(['stts', 'ctts', 'stsz', 'stsc', 'stco', 'co64', 'stss']);
const ignored = new Set(['free', 'skip', 'wide', 'sdtp', 'sgpd', 'sbgp']);
function sample(bytes) { const d = dv(bytes); return {sampleOffset: d.getFloat64(0, true), sampleSize: d.getUint32(8, true),
  isKeyFrame: !!d.getUint32(12, true), decodeTimestamp: d.getFloat64(16, true), presentationTimestamp: d.getFloat64(24, true),
  duration: d.getFloat64(32, true), chunkOffset: d.getFloat64(40, true), chunkSize: d.getFloat64(48, true)}; }
function sampleBytes(bytes, value) { const d = dv(bytes); bytes.fill(0);
  d.setUint32(8, value.sampleSize, true); d.setUint32(12, +value.isKeyFrame, true);
  for (const [at, key] of [[0, 'sampleOffset'], [16, 'decodeTimestamp'], [24, 'presentationTimestamp'],
    [32, 'duration'], [40, 'chunkOffset'], [48, 'chunkSize']]) {
    if (!Number.isSafeInteger(value[key])) fail('INPUT_UNSAFE_SAMPLE_FIELD'); d.setFloat64(at, value[key], true);
  } return bytes; }
/** One explicit private fork Input per controller. No in-memory fallback.
 * source is the same Blob/range source passed to that Input. Dispose in finally,
 * after Input.dispose(); failed cleanup keeps ownership and is retryable.
 */
export async function createInputIndex({source, root, jobId = crypto.randomUUID(), signal,
  budget = createIndexBudget(), lockManager = globalThis.navigator?.locks, yieldTask = tick,
  sortBytes = INPUT_PROFILE.sortBytes, mergeFanIn = INPUT_PROFILE.mergeFanIn, fixedMuxerFixture = false, ownerToken} = {}) {
  if (!source?.slice || !safe(source.size) || !source.size || !root?.getDirectoryHandle || !root?.removeEntry
    || !/^[A-Za-z0-9_-]{1,64}$/.test(jobId) || typeof fixedMuxerFixture !== 'boolean') fail('INPUT_INDEX_OPTIONS_INVALID');
  let owner, releaseScratch = () => {}, directory, removed = false, stopped = false, active, disposing, pendingCleanup;
  let bound, initialized = false, inspection = null, queued = 0, tail = Promise.resolve();
  const ownedStores = new Set(), tracks = new Map();
  const stats = {tableReadBytes: 0, tableReadCalls: 0, tableMaxReadBytes: 0, tableCacheMisses: 0,
    inspectorReadBytes: 0, inspectorMaxReadBytes: 0, metadataReadBytes: 0, metadataMaxReadBytes: 0,
    metadataSmallBytes: 0, metadataSkeletonBytes: 0, retainedDescriptionBytes: 0, maxSkeletonBuildBytes: 0, boxCount: 0,
    sampleCount: 0, peakOwnedStores: 0, initializationCount: 0, queryCount: 0, peakPendingOperations: 0};
  const check = () => { if (stopped || signal?.aborted) throw new DOMException('Input index canceled.', 'AbortError'); };
  const operation = work => {
    if (queued >= 8) return Promise.reject(Error('INPUT_INDEX_PENDING_LIMIT'));
    queued++; stats.peakPendingOperations = Math.max(stats.peakPendingOperations, queued);
    const p = tail.catch(() => {}).then(() => { check(); return work(); }); active = tail = p;
    p.finally(() => { queued--; if (active === p) active = null; }).catch(() => {}); return p;
  };
  async function dispose() {
    if (removed) return; if (disposing) return disposing; stopped = true;
    disposing = (async () => {
      try {
        await active?.catch(() => {});
        if (pendingCleanup) { await pendingCleanup(); pendingCleanup = null; }
        for (const store of ownedStores) { await store.dispose(); ownedStores.delete(store); }
        await owner?.dispose();
        releaseScratch(); tracks.clear(); removed = true;
      } finally { disposing = null; }
    })(); return disposing;
  }
  try {
    check();
    try { owner = await createOwnedIndexJob({root, jobId, ownerToken, kind: 'input', budget, signal, lockManager}); }
    catch (error) { pendingCleanup = error.retryCleanup; throw error; }
    directory = owner.directory; check();
    releaseScratch = budget.reserve(4096); // bounded query rows, scalar headers and record scratch
  } catch (error) { try { await dispose(); } catch (cleanup) { error.cleanupError = cleanup.message; error.retryCleanup = dispose; } throw error; }

  async function makeStore(track, name, width) {
    let store;
    try { store = await createIndexStore({root: directory, jobId: `${jobId}-t${track.id.toString(36)}-${name}`,
      schema: {version: 1, recordBytes: width, endianness: 'little'}, budget, signal, lockManager, yieldTask}); }
    catch (error) { pendingCleanup = error.retryCleanup; throw error; }
    ownedStores.add(store); stats.peakOwnedStores = Math.max(stats.peakOwnedStores, ownedStores.size);
    if (ownedStores.size > 12) fail('INPUT_STORE_DESCRIPTOR_LIMIT'); return store;
  }
  async function retireStore(store) { await store.dispose(); ownedStores.delete(store); }
  async function read(at, length, kind = 'metadata') {
    check(); checked(at); checked(length); checked(at + length);
    if (length > PAGE || at + length > source.size) fail('INPUT_RANGE_READ_INVALID');
    const bytes = new Uint8Array(await source.slice(at, at + length).arrayBuffer()); check();
    if (bytes.length !== length) fail('INPUT_RANGE_TRUNCATED');
    stats[kind + 'ReadBytes'] += length; stats[kind + 'MaxReadBytes'] = Math.max(stats[kind + 'MaxReadBytes'], length);
    if (kind === 'table') stats.tableReadCalls++; return bytes;
  }
  async function header(at, end) {
    const bytes = await read(at, 8), type = word(bytes); let size = dv(bytes).getUint32(0), head = 8;
    if (size === 1) { const ext = dv(await read(at + 8, 8)).getBigUint64(0); if (ext > BigInt(Number.MAX_SAFE_INTEGER)) fail('INPUT_UNSAFE_BOX_SIZE'); size = Number(ext); head = 16; }
    if (size < head || !safe(at + size) || at + size > end) fail('INPUT_BOX_BOUNDS');
    if (++stats.boxCount > 3 * INPUT_PROFILE.maxBoxes) fail('INPUT_BOX_LIMIT');
    if (!(stats.boxCount % 256)) { await yieldTask(); check(); }
    return {type, start: at, end: at + size, payload: at + head, size, header: head};
  }
  async function measureSkeleton(start, end, track = null, depth = 0) {
    if (depth > INPUT_PROFILE.maxDepth) fail('INPUT_BOX_DEPTH');
    let length = 0;
    for (let at = start; at < end;) {
      const node = await header(at, end); at = node.end;
      if (tables.has(node.type)) {
        if (!track || track.tables[node.type]) fail('INPUT_DUPLICATE_TABLE'); track.tables[node.type] = node; continue;
      }
      if (ignored.has(node.type)) continue;
      if (containers.has(node.type)) {
        let child = track;
        if (node.type === 'trak') child = {id: null, originalStart: node.start, tables: {}, metrics: {}};
        length += 8 + await measureSkeleton(node.payload, node.end, child, depth + 1);
        if (node.type === 'trak') {
          if (!safe(child.id) || tracks.has(child.id) || tracks.size >= INPUT_PROFILE.maxTracks) fail('INPUT_TRACK_ID_INVALID');
          tracks.set(child.id, child);
        }
      } else {
        stats.metadataSmallBytes += node.size;
        if (stats.metadataSmallBytes > INPUT_PROFILE.metadataBytes) fail('INPUT_SMALL_METADATA_LIMIT');
        if (node.type === 'tkhd' && track) {
          const bytes = await read(node.payload, Math.min(32, node.size - node.header)), d = dv(bytes);
          track.id = d.getUint32(bytes[0] === 1 ? 20 : 12);
        }
        length += node.size;
      }
      if (length > INPUT_PROFILE.metadataBytes) fail('INPUT_METADATA_SKELETON_LIMIT');
    }
    return length;
  }
  async function emitSkeleton(start, end, target, position = 0, depth = 0) {
    if (depth > INPUT_PROFILE.maxDepth) fail('INPUT_BOX_DEPTH');
    const output = dv(target);
    for (let at = start; at < end;) {
      const node = await header(at, end); at = node.end;
      if (tables.has(node.type) || ignored.has(node.type)) continue;
      if (containers.has(node.type)) {
        const begin = position; position += 8;
        if (position > target.length) fail('INPUT_METADATA_SKELETON_EXTENT');
        target.set(new TextEncoder().encode(node.type), begin + 4);
        position = await emitSkeleton(node.payload, node.end, target, position, depth + 1);
        output.setUint32(begin, position - begin);
      } else {
        if (position + node.size > target.length) fail('INPUT_METADATA_SKELETON_EXTENT');
        for (let local = 0; local < node.size; local += PAGE) {
          target.set(await read(node.start + local, Math.min(PAGE, node.size - local)), position + local);
        }
        position += node.size;
      }
    }
    return position;
  }
  async function table(node, stride, prefix = 8) {
    if (!node) fail('INPUT_TABLE_MISSING');
    const head = await read(node.payload, prefix, 'table'), h = dv(head);
    const count = h.getUint32(prefix - 4), length = node.end - node.payload;
    if (!safe(count * stride + prefix) || count * stride + prefix !== length) fail('INPUT_TABLE_EXTENT');
    const release = budget.reserve(PAGE + 64); let page = null, pageIndex = -1;
    return {count, version: head[0], head: h, async row(index) {
      check(); if (!safe(index) || index >= count) fail('INPUT_TABLE_ROW_RANGE');
      const position = index * stride, indexPage = Math.floor(position / PAGE), offset = position % PAGE;
      // 12-byte stsc rows can cross a 64 KiB page. Copy just that row.
      const bytes = new Uint8Array(stride);
      for (let done = 0; done < stride;) {
        const absolute = position + done, p = Math.floor(absolute / PAGE), within = absolute % PAGE;
        if (pageIndex !== p) {
          page = null;
          page = await read(node.payload + prefix + p * PAGE, Math.min(PAGE, length - prefix - p * PAGE), 'table');
          pageIndex = p; stats.tableCacheMisses++;
        }
        const n = Math.min(stride - done, page.length - within); if (n <= 0) fail('INPUT_TABLE_PAGE_TRUNCATED');
        bytes.set(page.subarray(within, within + n), done); done += n;
      }
      return dv(bytes);
    }, dispose() { page = null; release(); }};
  }
  async function buildTrack(state) {
    const opened = [], open = async (...args) => { const t = await table(...args); opened.push(t); return t; };
    try {
      const nodes = state.tables, sizesHeader = dv(await read(nodes.stsz.payload, 12, 'table'));
      const constant = sizesHeader.getUint32(4), count = sizesHeader.getUint32(8);
      stats.sampleCount += count; state.count = count;
      if (stats.sampleCount > INPUT_PROFILE.maxSamples) fail('INPUT_SAMPLE_LIMIT');
      const sizes = constant ? null : await open(nodes.stsz, 4, 12);
      const offsets = await open(nodes.co64 ?? nodes.stco, nodes.co64 ? 8 : 4);
      const chunks = await open(nodes.stsc, 12), times = await open(nodes.stts, 8);
      const compositions = nodes.ctts ? await open(nodes.ctts, 8) : null, keys = nodes.stss ? await open(nodes.stss, 4) : null;
      state.samples = await makeStore(state, 'samples', 64);
      const record = new Uint8Array(64); const releaseRecord = budget.reserve(record.byteLength);
      try {
        let id = 0, dts = 0, timingAt = 0, timing = await times.row(0), timingLeft = timing.getUint32(0);
        let compAt = 0, comp = compositions ? await compositions.row(0) : null, compLeft = comp?.getUint32(0) ?? 0;
        let keyAt = 0, key = keys?.count ? (await keys.row(0)).getUint32(0) - 1 : Infinity;
        let chunkAt = 0, chunk = await chunks.row(0), nextChunk = chunks.count > 1 ? await chunks.row(1) : null;
        for (let c = 0; c < offsets.count; c++) {
          check(); if (nextChunk && nextChunk.getUint32(0) <= c + 1) { chunk = nextChunk; chunkAt++; nextChunk = chunkAt + 1 < chunks.count ? await chunks.row(chunkAt + 1) : null; }
          const per = chunk.getUint32(4), offsetRow = await offsets.row(c);
          const rawOffset = nodes.co64 ? offsetRow.getBigUint64(0) : BigInt(offsetRow.getUint32(0));
          if (rawOffset > BigInt(Number.MAX_SAFE_INTEGER)) fail('INPUT_UNSAFE_CHUNK_OFFSET');
          const chunkOffset = Number(rawOffset), first = id; let offset = chunkOffset;
          for (let j = 0; j < per; j++, id++) {
            check(); if (id >= count) fail('INPUT_SAMPLE_COUNT_MISMATCH');
            while (!timingLeft) { timing = await times.row(++timingAt); timingLeft = timing.getUint32(0); }
            if (compositions) while (!compLeft) { comp = await compositions.row(++compAt); compLeft = comp.getUint32(0); }
            while (keys && key < id && keyAt + 1 < keys.count) key = (await keys.row(++keyAt)).getUint32(0) - 1;
            const size = constant || (await sizes.row(id)).getUint32(0), delta = timing.getUint32(4);
            const pts = dts + (comp ? (compositions.version ? comp.getInt32(4) : comp.getUint32(4)) : 0);
            await state.samples.appendRecord(sampleBytes(record, {sampleOffset: offset, sampleSize: size,
              isKeyFrame: !keys || id === 0 || key === id, decodeTimestamp: dts, presentationTimestamp: pts,
              duration: delta, chunkOffset, chunkSize: 0}));
            offset = checked(offset + size); dts = checked(dts + delta); timingLeft--; if (comp) compLeft--;
          }
          const chunkSize = offset - chunkOffset;
          for (let index = first; index < id; index++) { await state.samples.readRecord(index, record); const item = sample(record);
            item.chunkSize = chunkSize; await state.samples.patchRecord(index, sampleBytes(record, item)); }
        }
        if (id !== count) fail('INPUT_SAMPLE_COUNT_MISMATCH');
        await state.samples.seal({expectedCount: count});
      } finally { releaseRecord(); }
      state.hasComposition = !!compositions;
    } finally { for (const t of opened) t.dispose(); }
    if (state.hasComposition) Object.assign(state, await buildPresentationIndex({samples: state.samples, count: state.count,
      makeStore: (name, width) => makeStore(state, name, width), retireStore, budget, check, yieldTask,
      sortBytes, fanIn: mergeFanIn, metrics: state.metrics}));
  }
  async function readMetadata(demuxer, FileSlice) {
    return operation(async () => {
      if (bound && bound !== demuxer) fail('INPUT_INDEX_ALREADY_BOUND'); bound = demuxer;
      if (initialized) return;
      stats.initializationCount++;
      const inspectedSource = {size: source.size, slice(start, end) {
        const slice = source.slice(start, end); return {async arrayBuffer() { check();
          stats.inspectorReadBytes += end - start; stats.inspectorMaxReadBytes = Math.max(stats.inspectorMaxReadBytes, end - start);
          const bytes = await slice.arrayBuffer(); check(); return bytes; }};
      }};
      // Private fixture compatibility is explicit. Production/default admission
      // always uses the unchanged public parser, including its cslg rejection.
      inspection = await (fixedMuxerFixture ? inspectFixedMuxerFixture : inspectPublicMp4)(inspectedSource, {signal});
      if (!inspection.transcodeSafe) fail('INPUT_TIMELINE_NOT_SUPPORTED: ' + inspection.transcodeIssues.join(', '));
      let moov = null;
      for (let at = 0; at < source.size;) {
        const node = await header(at, source.size); at = node.end;
        if (node.type === 'moov') moov = node;
        if (node.type === 'ftyp') demuxer.isQuickTime = word(await read(node.payload, 4), 0) === 'qt  ';
      }
      if (!moov) fail('INPUT_MOOV_MISSING');
      const skeletonLength = await measureSkeleton(moov.payload, moov.end);
      let bytes = new Uint8Array(skeletonLength);
      if (await emitSkeleton(moov.payload, moov.end, bytes) !== bytes.length) fail('INPUT_METADATA_SKELETON_EXTENT');
      stats.metadataSkeletonBytes = bytes.length; stats.maxSkeletonBuildBytes = bytes.length + PAGE;
      demuxer.readContiguousBoxes(FileSlice.tempFromBytes(bytes));
      // The fixed parser's readBytes returns subviews. Detach retained codec and
      // metadata bytes so a tiny description does not keep the whole skeleton.
      let backing = bytes.buffer; const seen = new Set();
      const detach = value => {
        if (ArrayBuffer.isView(value)) {
          if (value.buffer !== backing) return value;
          stats.retainedDescriptionBytes += value.byteLength;
          if (stats.retainedDescriptionBytes > INPUT_PROFILE.metadataBytes) fail('INPUT_RETAINED_METADATA_LIMIT');
          return value instanceof DataView ? new DataView(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)) : value.slice();
        }
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); if (seen.size > INPUT_PROFILE.maxBoxes) fail('INPUT_METADATA_OBJECT_LIMIT');
        for (const key of Object.keys(value)) value[key] = detach(value[key]); return value;
      };
      for (const track of demuxer.tracks) detach(track.info);
      detach(demuxer.metadataTags);
      stats.maxSkeletonBuildBytes += stats.retainedDescriptionBytes;
      bytes = null; backing = null; seen.clear();
      if (demuxer.isFragmented || demuxer.tracks.length !== tracks.size) fail('INPUT_PRIVATE_PROFILE_UNSUPPORTED');
      for (const track of demuxer.tracks) {
        const state = tracks.get(track.id); if (!state || track.encryptionInfo || !['avc', 'aac'].includes(track.info?.codec)) fail('INPUT_TRACK_PROFILE_UNSUPPORTED');
        const seconds = track.editListPreviousSegmentDurations / demuxer.movieTimescale;
        track.editListOffset -= Math.round(seconds * track.timescale);
        track.sampleTableByteOffset = null;
        await buildTrack(state);
      }
      demuxer.moovSlice = null; initialized = true;
    });
  }
  const stateFor = track => { check(); const state = tracks.get(track.id); if (!initialized || !state) fail('INPUT_INDEX_NOT_READY'); return state; };
  async function info(state, id) {
    if (!safe(id) || id >= state.count) return null;
    const bytes = new Uint8Array(64); await state.samples.readRecord(id, bytes); const item = sample(bytes);
    if (state.order) {
      const rankBytes = new Uint8Array(8); await state.inverse.readRecord(id, rankBytes); const rank = dv(rankBytes).getFloat64(0, true);
      if (rank < state.count - 1) { const next = new Uint8Array(16); await state.order.readRecord(rank + 1, next); item.duration = dv(next).getFloat64(0, true) - item.presentationTimestamp; }
    }
    return item;
  }
  async function find(state, timestamp, keyOnly) {
    let low = 0, high = state.count;
    const bytes = new Uint8Array(state.order ? 16 : 64);
    const at = async index => {
      await (state.order ?? state.samples).readRecord(index, bytes); const d = dv(bytes);
      return state.order ? {pts: d.getFloat64(0, true), id: d.getFloat64(8, true)} : {pts: d.getFloat64(24, true), id: index};
    };
    while (low < high) { check(); const middle = Math.floor((low + high) / 2); const row = await at(middle);
      if (row.pts <= timestamp) low = middle + 1; else high = middle; }
    for (let rank = low - 1; rank >= 0; rank--) {
      check(); const row = await at(rank); if (!keyOnly || (await info(state, row.id)).isKeyFrame) return row.id;
    }
    return -1;
  }
  return Object.freeze({readMetadata, dispose,
    get owner() { return owner.ticket; },
    sampleInfo(track, id) { return operation(async () => { stats.queryCount++; return info(stateFor(track), id); }); },
    sampleIndex(track, timestamp, keyOnly = false) { return operation(async () => { stats.queryCount++; return find(stateFor(track), timestamp, keyOnly); }); },
    nextKeyIndex(track, id) { return operation(async () => {
      const state = stateFor(track); for (let next = id + 1; next < state.count; next++) { check(); if ((await info(state, next)).isKeyFrame) return next; } return -1;
    }); },
    get metrics() { return {...stats, initialized, disposed: removed, inspection,
      validationProfile: fixedMuxerFixture ? 'fixed-muxer-fixture-only' : 'unchanged-public-parser', ownedStores: ownedStores.size,
      budgetReservedBytes: budget.usedBytes, budgetPeakBytes: budget.peakBytes,
      tracks: [...tracks.values()].map(t => ({id: t.id, count: t.count, hasComposition: t.hasComposition, ...t.metrics,
        sampleStore: t.samples?.metrics, presentationStore: t.order?.metrics, inverseStore: t.inverse?.metrics}))}; },
  });
}
