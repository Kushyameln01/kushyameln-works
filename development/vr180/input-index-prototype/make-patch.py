#!/usr/bin/env python3
"""Generate a demuxer-only patch against the fixed npm source; no network."""
from pathlib import Path
import argparse
import difflib
import hashlib
import json

p = argparse.ArgumentParser()
p.add_argument('--source', type=Path, required=True)
args = p.parse_args()
out = Path(__file__).parent
name = 'src/isobmff/isobmff-demuxer.ts'
original = (args.source / name).read_text()
source = original


def replace(old, new):
    global source
    if source.count(old) != 1:
        raise RuntimeError(f'Pinned source context changed: {old[:100]!r} ({source.count(old)})')
    source = source.replace(old, new)


replace('export class IsobmffDemuxer extends Demuxer {',
        'export class IsobmffDemuxer extends Demuxer {\n'
        '\t/** VR180 private explicit adapter; never a failure fallback. */\n'
        '\tget vr180InputIndex() { return (this.input as any)._vr180InputIndex; }')
replace('\t\treturn this.metadataPromise ??= (async () => {',
        '\t\treturn this.metadataPromise ??= (async () => {\n'
        '\t\t\tif (this.vr180InputIndex) {\n'
        '\t\t\t\tawait this.vr180InputIndex.readMetadata(this, FileSlice);\n'
        '\t\t\t\treturn;\n\t\t\t}')
replace('\tgetSampleTableForTrack(internalTrack: InternalTrack) {',
        '\tgetSampleTableForTrack(internalTrack: InternalTrack) {\n'
        '\t\tif (this.vr180InputIndex) throw new Error("PRIVATE_INPUT_SYNC_TABLE_ACCESS");')
for method, key in [('getPacket', 'false'), ('getKeyPacket', 'true')]:
    context = f'\tasync {method}(timestamp: number, options: PacketRetrievalOptions) {{\n\t\tconst timestampInTimescale = this.mapTimestampIntoTimescale(timestamp);'
    replace(context, context + '\n\t\tconst adapter = this.internalTrack.demuxer.vr180InputIndex;\n'
            '\t\tif (adapter) return this.fetchPacketForSampleIndex(\n'
            f'\t\t\tawait adapter.sampleIndex(this.internalTrack, timestampInTimescale, {key}), options);')
context = '\tasync getNextKeyPacket(packet: EncodedPacket, options: PacketRetrievalOptions) {\n\t\tconst regularSampleIndex = this.packetToSampleIndex.get(packet);'
replace(context, context + '\n\t\tconst adapter = this.internalTrack.demuxer.vr180InputIndex;\n'
        '\t\tif (adapter && regularSampleIndex !== undefined) return this.fetchPacketForSampleIndex(\n'
        '\t\t\tawait adapter.nextKeyIndex(this.internalTrack, regularSampleIndex), options);')
context = '''\tprivate async fetchPacketForSampleIndex(sampleIndex: number, options: PacketRetrievalOptions) {
\t\tif (sampleIndex === -1) {
\t\t\treturn null;
\t\t}

\t\tconst sampleTable = this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack);
\t\tconst sampleInfo = getSampleInfo(sampleTable, sampleIndex);'''
replace(context, '''\tprivate async fetchPacketForSampleIndex(sampleIndex: number, options: PacketRetrievalOptions) {
\t\tif (sampleIndex === -1) {
\t\t\treturn null;
\t\t}

\t\tconst adapter = this.internalTrack.demuxer.vr180InputIndex;
\t\tconst sampleInfo = adapter
\t\t\t? await adapter.sampleInfo(this.internalTrack, sampleIndex)
\t\t\t: getSampleInfo(this.internalTrack.demuxer.getSampleTableForTrack(this.internalTrack), sampleIndex);''')
patch = ''.join(difflib.unified_diff(original.splitlines(True), source.splitlines(True),
                                   fromfile='a/' + name, tofile='b/' + name))
(out / 'mediabunny-input-index.patch').write_text(patch)
sha = lambda text: hashlib.sha256(text.encode()).hexdigest()
(out / 'patch-provenance.json').write_text(json.dumps({
    'upstreamCommit': '0664a57bf2f40e5c4efa176c75ebf1d60df69eb8', 'version': '1.61.5',
    'license': 'MPL-2.0', 'files': {name: {'originalSha256': sha(original), 'patchedSha256': sha(source)}},
    'patchSha256': sha(patch),
}, indent=2) + '\n')
