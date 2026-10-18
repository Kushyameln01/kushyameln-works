import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import * as audioDependencies from '../docs/shared/vr180/audio-dependency.mjs';
import * as openEndedMdat from '../docs/shared/vr180/open-ended-mdat.mjs';
import * as containerMetadata from '../docs/shared/vr180/container-metadata.mjs';
import * as geometry from '../docs/shared/vr180/geometry.mjs';
import * as fileOutput from '../docs/shared/vr180/file-output.mjs';
import * as mp4 from '../docs/shared/vr180/mp4.mjs';
import {inspectMp4 as inspectOutputMp4} from '../docs/shared/vr180/indexed/mp4-output-inspect.mjs';
import {sha256Blob} from '../docs/shared/vr180/sha256.mjs';
import * as indexStore from '../docs/shared/vr180/indexed/index-store.mjs';
import {PROFILE} from '../docs/shared/vr180/indexed/output-index.mjs';
import * as routeProfile from '../docs/shared/vr180/route-profile.mjs';
import * as media from '../docs/shared/vr180/vendor/mediabunny-indexed.mjs';

const source = (await readFile(new URL('../docs/shared/vr180/indexed/transform.mjs', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*;\n/gm, '').replace(/^export /gm, '');

test('indexed emits saveCommit before physical commit and complete only after saved-file verification', {timeout: 10000}, async () => {
  const input = new Blob([await readFile(new URL('../docs/vr180-studio/fixtures/stereo180-sbs.mp4', import.meta.url))]);
  const encoded = await mp4.tagMp4(input, {layout: 'sbs'});
  const bytes = new Uint8Array(await encoded.arrayBuffer()), view = new DataView(bytes.buffer);
  let moovPosition;
  for (let at = 0; at < bytes.length; at += view.getUint32(at)) {
    if (new TextDecoder().decode(bytes.subarray(at + 4, at + 8)) === 'moov') moovPosition = at;
  }
  assert(Number.isSafeInteger(moovPosition));
  const info = await inspectOutputMp4(encoded), events = [];
  const index = () => ({metrics: {}, async dispose() {}});
  const outputIndex = {...index(), metadataSource: encoded, metrics: {metadataClosed: true,
    sampleCount: info.sampleCounts.total, verification: info,
    moovPosition, moovBytes: encoded.size - moovPosition}};

  // Run the complete production conversion body. Codec and disk-index doubles
  // submit fixture packet counts and a pre-encoded fixture, without claiming a
  // browser pixel conversion. Commit, SHA-256 and saved MP4 inspection are real.
  const fork = {...media,
    Input: class {
      constructor(options) { this.actual = new media.Input(options); }
      async getTracks() {
        const tracks = await this.actual.getTracks();
        return tracks.map(track => track.type === 'video' ? {
          type: 'video', getCodec: async () => 'avc', hasHighDynamicRange: async () => false,
          getRotation: async () => 0, getFlip: async () => false, getPixelAspectRatio: async () => ({num: 1, den: 1}),
          getDisplayWidth: async () => info.width, getDisplayHeight: async () => info.height, canDecode: async () => true,
        } : track);
      }
      getDurationFromMetadata() { return this.actual.getDurationFromMetadata(); }
      dispose() { this.actual.dispose(); }
    },
    VideoSampleSink: class {
      async *samples() {
        for (let i = 0; i < info.sampleCounts.video; i++) yield {
          timestamp: i / 30, duration: 1 / 30, displayWidth: info.width, displayHeight: info.height, draw() {}, close() {},
        };
      }
    },
    CanvasSource: class {
      constructor(canvas, options) { this.options = options; }
      async add() { this.options.onEncodedPacket(); }
      close() {}
    },
    EncodedAudioPacketSource: class { async add() {} close() {} },
    StreamTarget: class { constructor(stream) { this.stream = stream; } },
    Output: class {
      constructor({target}) { this.target = target; this.state = 'pending'; }
      addVideoTrack() {} addAudioTrack() {}
      async start() { this.state = 'started'; }
      async finalize() {
        const writer = this.target.stream.getWriter();
        await writer.write({type: 'write', position: 0, data: bytes}); await writer.close();
        this.state = 'finalized'; events.push('mux-finalized');
      }
      async cancel() { this.state = 'canceled'; }
    },
    canEncodeVideo: async () => true,
  };
  let stored = new Blob(), draft, releaseClose, startedClose;
  const closing = new Promise(resolve => { startedClose = resolve; });
  const closeGate = new Promise(resolve => { releaseClose = resolve; });
  const handle = {
    async getFile() { events.push(stored.size ? 'saved-getFile' : 'initial-getFile'); return stored; },
    async createWritable() { return {
      async write({data}) { draft = data.slice(); events.push('mux-write'); },
      async truncate(size) { events.push('commit-truncate'); draft = draft.slice(0, size); },
      async close() { events.push('physical-close'); startedClose(); await closeGate; stored = new Blob([draft]); },
      async abort() { events.push('abort'); },
    }; },
  };
  // A fixed clock makes an unforced saveCommit disappear behind the throttle.
  const context = vm.createContext({Blob, DOMException, AbortController, WritableStream, Uint8Array, performance: {now: () => 1}, crypto: webcrypto,
    ...audioDependencies, ...openEndedMdat, ...containerMetadata, ...geometry, ...fileOutput, ...mp4, ...indexStore, ...routeProfile, PROFILE,
    createInputIndex: async () => index(), createOutputIndex: async () => outputIndex,
    sha256Blob: async (...args) => { events.push(events.includes('physical-close') ? 'metadata-readback' : 'metadata-expected-hash'); return sha256Blob(...args); },
    inspectOutputMp4: async (...args) => { events.push('saved-inspect'); return inspectOutputMp4(...args); },
    VideoEncoder: class {}, VideoDecoder: class {},
    OffscreenCanvas: class { constructor(width, height) { this.width = width; this.height = height; } getContext() { return {}; } },
  });
  new vm.Script(source, {filename: 'docs/shared/vr180/indexed/transform.mjs'}).runInContext(context);
  const conversion = context.convertStereo(input,
    {mode: 'convert', confirmed: true, layout: 'sbs', fov: 180, eyeSize: 256, bitrate: 2000000},
    {fork, outputHandle: handle, indexRoot: {getDirectoryHandle() {}}, jobId: 'save-progress',
      onProgress: progress => events.push(`progress:${progress.phase}`)});
  try {
    await closing;
    assert.equal(events.filter(event => event === 'progress:saveCommit').length, 1);
    assert(events.indexOf('progress:finalize') < events.indexOf('progress:saveCommit'));
    assert(events.indexOf('mux-finalized') < events.indexOf('progress:saveCommit'));
    assert(events.indexOf('progress:saveCommit') < events.indexOf('commit-truncate'));
    assert.equal(events.at(-1), 'physical-close');
    assert.equal(events.includes('progress:complete'), false);
  } finally { releaseClose(); await conversion; }
  for (const phase of ['saved-getFile', 'metadata-readback', 'saved-inspect']) {
    assert(events.indexOf('progress:saveCommit') < events.indexOf(phase));
    assert(events.indexOf(phase) < events.indexOf('progress:complete'));
  }
  assert.equal(events.filter(event => event === 'physical-close').length, 1);
  assert.equal(events.includes('abort'), false);
});
