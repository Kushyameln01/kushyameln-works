// Private VR180 prototype. Stable (PTS, decode sample ID) order, bounded external merge.
import {INDEX_PAGE_BYTES as PAGE} from './index-store.mjs';
const WIDTH = 16;
const fail = message => { throw Error(message); };
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const less = (a, b) => a.pts < b.pts || (a.pts === b.pts && a.id < b.id);
const decode = bytes => { const d = view(bytes); return {pts: d.getFloat64(0, true), id: d.getFloat64(8, true)}; };
const encode = (bytes, value) => { const d = view(bytes); d.setFloat64(0, value.pts, true); d.setFloat64(8, value.id, true); return bytes; };

/** makeStore owns every temporary store; caller cleanup must retain failed leases.
 * Runs have fixed arithmetic extents: no list proportional to the run count.
 */
export async function buildPresentationIndex({samples, count, makeStore, retireStore, budget, check, yieldTask,
  sortBytes = 4 * 1024 ** 2, fanIn = 8, metrics}) {
  if (!Number.isSafeInteger(sortBytes) || sortBytes < WIDTH || sortBytes > 4 * 1024 ** 2 || sortBytes % WIDTH
    || !Number.isSafeInteger(fanIn) || fanIn < 2 || fanIn > 8) fail('INPUT_SORT_PROFILE_INVALID');
  const capacity = sortBytes / WIDTH;
  const release = budget.reserve(sortBytes + 2 * 64 + WIDTH * (fanIn + 2) + fanIn * PAGE);
  let workspace = new Float64Array(sortBytes / 8);
  let source, inverse;
  try {
    metrics.sortCapacityRecords = capacity; metrics.sortReservedBytes = sortBytes; metrics.sortPasses = 1;
    source = await makeStore('presentation-run-0', WIDTH);
    const sampleBytes = new Uint8Array(64), record = new Uint8Array(WIDTH);
    let operations = 0;
    const pause = async () => { if (++operations % 4096 === 0) { await yieldTask(); check(); } };
    const gt = (a, b) => workspace[2 * a] > workspace[2 * b]
      || (workspace[2 * a] === workspace[2 * b] && workspace[2 * a + 1] > workspace[2 * b + 1]);
    const swap = (a, b) => { const pts = workspace[2 * a], id = workspace[2 * a + 1];
      workspace[2 * a] = workspace[2 * b]; workspace[2 * a + 1] = workspace[2 * b + 1];
      workspace[2 * b] = pts; workspace[2 * b + 1] = id; };
    const sift = async (root, length) => {
      for (;;) { const left = 2 * root + 1; if (left >= length) return;
        let next = left; if (left + 1 < length && gt(left + 1, left)) next++;
        if (!gt(next, root)) return; swap(root, next); root = next; await pause(); }
    };
    for (let start = 0; start < count; start += capacity) {
      check(); const length = Math.min(capacity, count - start);
      for (let i = 0; i < length; i++) {
        await samples.readRecord(start + i, sampleBytes); check();
        workspace[2 * i] = view(sampleBytes).getFloat64(24, true); workspace[2 * i + 1] = start + i;
      }
      for (let i = Math.floor(length / 2) - 1; i >= 0; i--) await sift(i, length);
      for (let end = length - 1; end > 0; end--) { swap(0, end); await sift(0, end); await pause(); }
      for (let i = 0; i < length; i++) {
        check(); encode(record, {pts: workspace[2 * i], id: workspace[2 * i + 1]}); await source.appendRecord(record);
      }
    }
    await source.seal({expectedCount: count});
    // Each run cursor retains one explicitly reserved 64 KiB page. This avoids
    // forcing the source's single cache to reread a page for every merged record.
    let runLength = capacity, generation = 1;
    while (runLength < count) {
      check(); const target = await makeStore(`presentation-run-${generation}`, WIDTH);
      const readCursor = async cursor => {
        const pageIndex = Math.floor(cursor.at * WIDTH / PAGE), offset = cursor.at * WIDTH % PAGE;
        if (cursor.pageIndex !== pageIndex) {
          const n = await source.readPage(pageIndex, cursor.page);
          if (offset + WIDTH > n) fail('INPUT_MERGE_PAGE_TRUNCATED'); cursor.pageIndex = pageIndex;
        }
        cursor.value = decode(cursor.page.subarray(offset, offset + WIDTH));
      };
      for (let base = 0; base < count; base += runLength * fanIn) {
        const cursors = [];
        for (let i = 0; i < fanIn; i++) {
          const start = base + i * runLength; if (start >= count) break;
          const cursor = {at: start, end: Math.min(start + runLength, count), page: new Uint8Array(PAGE), pageIndex: -1};
          await readCursor(cursor); cursors.push(cursor);
        }
        while (cursors.some(c => c.value !== null)) {
          check(); let selected = -1;
          for (let i = 0; i < cursors.length; i++) if (cursors[i].value !== null
            && (selected === -1 || less(cursors[i].value, cursors[selected].value))) selected = i;
          const cursor = cursors[selected]; await target.appendRecord(encode(record, cursor.value));
          cursor.at++;
          if (cursor.at < cursor.end) await readCursor(cursor);
          else cursor.value = null;
        }
      }
      await target.seal({expectedCount: count});
      await retireStore(source); source = target; runLength *= fanIn; generation++; metrics.sortPasses++;
    }
    inverse = await makeStore('presentation-inverse', 8);
    const rank = new Uint8Array(8);
    for (let i = 0; i < count; i++) { check(); await inverse.appendRecord(rank); }
    await source.iterate(async (bytes, i) => {
      check(); const {id} = decode(bytes); view(rank).setFloat64(0, i, true); await inverse.patchRecord(id, rank);
    });
    await inverse.seal({expectedCount: count});
    metrics.presentationRecords = count;
    return {order: source, inverse};
  } finally { workspace = null; release(); }
}
