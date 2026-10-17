#!/usr/bin/env python3
"""Recreate a three-file unified patch against the pinned npm source (no network)."""
from pathlib import Path
import argparse,difflib,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);a=p.parse_args()
out=Path(__file__).parent
files={}
for name in ['src/isobmff/isobmff-muxer.ts','src/isobmff/isobmff-boxes.ts','src/media-source.ts']:
 original=(a.source/name).read_text();s=original
 def replace(old,new):
  global s
  if s.count(old)!=1: raise RuntimeError(f'Pinned source context changed: {name} / {old[:80]!r} ({s.count(old)})')
  s=s.replace(old,new)
 if name.endswith('muxer.ts'):
  replace('export type IsobmffTrackData = {','export type IsobmffTrackData = {\n\t/** VR180 private disk-index adapter; absent in the original path. */\n\tvr180Index?: any;')
  replace('export const presentationSpan = (trackData: IsobmffTrackData) => {','export const presentationSpan = (trackData: IsobmffTrackData) => {\n\tif (trackData.vr180Index) return trackData.vr180Index.presentationSpan;')
  replace('export class IsobmffMuxer extends Muxer {','export class IsobmffMuxer extends Muxer {\n\tprivate get vr180Index() { return (this.formatOptions as any).vr180Index; }')
  replace('\t\t// Write the header','\t\tthis.vr180Index?.start(this);\n\n\t\t// Write the header')
  replace('\tprivate async registerSample(trackData: IsobmffTrackData, sample: Sample) {','\tprivate async registerSample(trackData: IsobmffTrackData, sample: Sample) {\n\t\tif (this.vr180Index) return this.vr180Index.register(this, trackData, sample);')
  replace('\t\t\tthis.processTimestamps(trackData);\n\t\t}\n\n\t\tif (this.allTracksAreKnown())', '\t\t\tif (this.vr180Index) await this.vr180Index.closeTrack(trackData);\n\t\t\telse this.processTimestamps(trackData);\n\t\t}\n\n\t\tif (this.allTracksAreKnown())')
  replace('\t\tthis.allTracksKnown.resolve();\n\t\tthis.ensureOneEnabledTrack();','\t\tthis.allTracksKnown.resolve();\n\t\tthis.ensureOneEnabledTrack();\n\t\tif (this.vr180Index) return await this.vr180Index.finalize(this, moov);')
  # The new awaited disk boundaries must release their mutex on rejection/cancel.
  for start,end in [('async start() {','\n\tprivate allTracksAreKnown()'),('override async onTrackClose(track: OutputTrack) {','\n\tensureOneEnabledTrack()'),('async finalize() {','\n}\n')]:
   at=s.index(start); stop=s.index(end,at); segment=s[at:stop]
   if segment.count('\n\t\trelease();')!=1: raise RuntimeError('Unexpected mutex structure')
   segment=segment.replace('const release = await this.mutex.acquire();','const release = await this.mutex.acquire();\n\t\ttry {',1)
   segment=segment.replace('\n\t\trelease();','\n\t\t} finally { release(); }',1)
   s=s[:at]+segment+s[stop:]
 elif name.endswith('boxes.ts'):
  replace('const needsCtts = trackData.compositionTimeOffsetTable.length > 1\n\t\t|| trackData.compositionTimeOffsetTable.some(x => x.sampleCompositionTimeOffset !== 0);',
   'const needsCtts = trackData.vr180Index ? trackData.vr180Index.needsCtts\n\t\t: trackData.compositionTimeOffsetTable.length > 1\n\t\t|| trackData.compositionTimeOffsetTable.some(x => x.sampleCompositionTimeOffset !== 0);')
  for table in ['stts','stss','stsc','stsz','stco','ctts','cslg']:
   old=f'export const {table} = (trackData: IsobmffTrackData) => {{'
   replace(old,old+f'\n\tif (trackData.vr180Index) return trackData.vr180Index.tableBox(\'{table}\');')
 else:
  replace('\t\t\tconnectedTrack.output._muxer.onTrackClose(connectedTrack);', '\t\t\tawait connectedTrack.output._muxer.onTrackClose(connectedTrack);')
  replace('\t\t\tawait connectedTrack.output._muxer.onTrackClose(connectedTrack);\n\t\t})();', '\t\t\tawait connectedTrack.output._muxer.onTrackClose(connectedTrack);\n\t\t})();\n\t\t// close() is void: observe early rejection without replacing its promise.\n\t\t// finalize()/cancel() still await the original rejected _closingPromise.\n\t\tthis._closingPromise.catch(() => {});')
 files[name]=(original,s)
patch=''.join(''.join(difflib.unified_diff(o.splitlines(True),s.splitlines(True),fromfile='a/'+n,tofile='b/'+n)) for n,(o,s) in files.items())
(out/'mediabunny-output-index.patch').write_text(patch)
(out/'patch-provenance.json').write_text(json.dumps({'upstreamCommit':'0664a57bf2f40e5c4efa176c75ebf1d60df69eb8','version':'1.61.5','license':'MPL-2.0',
 'files':{n:{'originalSha256':hashlib.sha256(o.encode()).hexdigest(),'patchedSha256':hashlib.sha256(s.encode()).hexdigest()} for n,(o,s) in files.items()},
 'patchSha256':hashlib.sha256(patch.encode()).hexdigest()},indent=2)+'\n')
