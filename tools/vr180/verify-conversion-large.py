#!/usr/bin/env python3
"""Independent, incremental verification of saved VR180 MP4s.

The synthetic acceptance criteria match verify-conversion.py: aggregate RGB
PSNR >=30 dB per eye, frame count/order and PTS <=1 ms, red-event frame flags,
identical decoded s16 PCM and audio start <=1 ms. Every frame and packet is
scanned, not sampled. --mode copy additionally checks the existing append-only
metadata contract, all timing tables and every compressed packet record/hash.
--mode remux separately validates packet-preserving repackaging: every video
and AAC payload, decoder configuration, rational timestamp, and decoded RGB/PCM.
It permits changed container offsets and time-base units, not changed content.

Python retains one RGB frame pair, fixed PCM blocks and bounded probe records
and diagnostics, not a movie-wide JSON document/timestamp/event array. The
installed FFmpeg/ffprobe may retain their own demux/codec indexes; this script
does not claim bounded native RSS or demonstrated 5/10 GB capacity. Use an
explicit wall-clock budget appropriate to the trial. No target VR playback or
real-camera visual-quality acceptance is implied by the synthetic criteria.
"""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import importlib.util
import itertools
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import xml.etree.ElementTree as ET

import numpy as np

RECORD_BYTES = 128 * 1024
IO_BYTES = 64 * 1024
MAX_EYE_SIZE = 2048
MAX_FRAME_PIXELS = 4096 * 2048
STREAM_JSON_BYTES = 256 * 1024
STDERR_BYTES = 64 * 1024

# Reuse only the existing independent Python box reader, never producer JS.
_spec = importlib.util.spec_from_file_location('vr180_independent_metadata',
                                             Path(__file__).with_name('verify-metadata.py'))
metadata = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(metadata)


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Errors:
    def __init__(self, limit):
        self.report = {'total': 0, 'byKind': {}, 'details': [], 'dropped': 0, 'limit': limit}

    def add(self, kind, message, **where):
        r = self.report
        r['total'] += 1
        r['byKind'][kind] = r['byKind'].get(kind, 0) + 1
        if len(r['details']) < r['limit']:
            r['details'].append({'kind': kind, 'message': str(message)[:1000], **where})
        else:
            r['dropped'] += 1


class Runtime:
    """Bound stderr while draining it; terminate blocked pipes at the deadline."""
    def __init__(self, directory, timeout):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.started = time.monotonic()
        self.timeout = timeout
        self.expired = False
        self.children = []
        self.logs = {}
        self.lock = threading.Lock()
        self.timer = threading.Timer(timeout, self.expire)
        self.timer.daemon = True
        self.timer.start()

    def expire(self):
        with self.lock:
            self.expired = True
            for proc, _thread in self.children:
                if proc.poll() is None:
                    proc.kill()

    def check(self):
        if self.expired or time.monotonic() - self.started >= self.timeout:
            raise TimeoutError('verification wall-clock budget exhausted')

    def start(self, label, args):
        self.check()
        log = {'path': str(self.directory / (label + '.stderr.log')), 'totalBytes': 0,
               'retainedBytes': 0, 'droppedBytes': 0}
        self.logs[label] = log
        proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, bufsize=0)

        def drain():
            try:
                with open(log['path'], 'wb') as output:
                    while block := proc.stderr.read(IO_BYTES):
                        log['totalBytes'] += len(block)
                        kept = block[:max(0, STDERR_BYTES - log['retainedBytes'])]
                        output.write(kept)
                        log['retainedBytes'] += len(kept)
                        log['droppedBytes'] += len(block) - len(kept)
            except Exception as exc:
                log['error'] = str(exc)[:1000]
            finally:
                proc.stderr.close()

        thread = threading.Thread(target=drain, daemon=True)
        with self.lock:
            self.children.append((proc, thread))
            thread.start()
            if self.expired:
                proc.kill()
        self.check()
        return proc

    def finish(self, proc, label):
        self.check()
        code = proc.wait(timeout=max(.001, self.timeout - (time.monotonic() - self.started)))
        for child, thread in self.children:
            if child is proc:
                thread.join(timeout=5)
                require(not thread.is_alive(), f'{label}: stderr did not finish')
                break
        self.check()
        require(code == 0, f'{label}: process exited {code}')
        log = self.logs[label]
        require(not log.get('error') and log['totalBytes'] == 0,
                f'{label}: FFmpeg reported errors; see {log["path"]}')

    def close(self):
        self.timer.cancel()
        with self.lock:
            for proc, _thread in self.children:
                if proc.poll() is None:
                    proc.kill()
        for proc, thread in self.children:
            proc.wait(timeout=5)
            proc.stdout.close()
            thread.join(timeout=5)


def read_chunk(stream, size, runtime):
    data = bytearray(size)
    view = memoryview(data)
    offset = 0
    while offset < size:
        runtime.check()
        count = stream.readinto(view[offset:])
        if not count:
            break
        offset += count
    view.release()
    del data[offset:]
    runtime.check()
    return data


def iter_xml_records(stream, kind, check, stats):
    """Remove each completed element from its parent; never retain the XML tree.

    FFprobe writes one element per line. Bound lines and the bytes between
    record completions, including side-data, so malformed records cannot grow
    the parser indefinitely. A closing root and successful XML EOF are needed.
    """
    parser = ET.XMLPullParser(events=('start', 'end'))
    stack = []
    pending = 0
    root_closed = False
    while True:
        check()
        line = stream.readline(RECORD_BYTES + 1)
        if not line:
            break
        pending += len(line)
        require(len(line) <= RECORD_BYTES and pending <= RECORD_BYTES,
                'probe record exceeds bounded metadata size')
        parser.feed(line)
        for event, elem in parser.read_events():
            if event == 'start':
                stack.append(elem)
                require(len(stack) <= 12, 'probe record nesting exceeds bound')
                continue
            require(stack and stack[-1] is elem, 'invalid probe XML nesting')
            if elem.tag == kind:
                # Side-data is part of the per-packet copy contract.
                record = dict(elem.attrib)
                children = list(elem.iter())[1:]
                require(len(children) <= 128, 'probe record has excessive side-data')
                if children:
                    record['_sideData'] = [(c.tag, dict(c.attrib)) for c in children]
                if len(stack) > 1:
                    stack[-2].remove(elem)
                elem.clear()
                pending = 0
                stats['count'] += 1
                yield record
            elif elem.tag == 'ffprobe':
                root_closed = True
            stack.pop()
    parser.close()
    require(root_closed and not stack, 'probe XML ended before its closing root')
    stats['endReached'] = True


def probe_records(path, label, kind, runtime, scans, selector=None):
    stats = scans[label] = {'count': 0, 'endReached': False}
    if kind == 'frame':
        entries = ('frame=media_type,stream_index,best_effort_timestamp_time,'
                   'pkt_duration_time,key_frame,pict_type:frame_side_data=')
    else:
        entries = ('packet=stream_index,pts,dts,duration,pts_time,dts_time,duration_time,'
                   'size,pos,flags,data_hash:packet_side_data')
    args = ['ffprobe', '-v', 'error', '-threads', '1', '-show_' + kind + 's',
            '-show_entries', entries, '-of', 'xml']
    if kind == 'packet':
        args += ['-show_data_hash', 'sha256']
    if selector:
        args += ['-select_streams', selector]
    proc = runtime.start(label, args + [str(path)])
    try:
        yield from iter_xml_records(proc.stdout, kind, runtime.check, stats)
        stats['endReached'] = False
        runtime.finish(proc, label)
        stats['endReached'] = True
    except BaseException:
        stats['endReached'] = False
        raise


def stream_info(path, label, runtime):
    proc = runtime.start(label, ['ffprobe', '-v', 'error', '-show_streams',
                                '-show_data_hash', 'sha256',
                                '-show_entries', 'stream=index,codec_type,codec_name,width,height,'
                                'sample_rate,channels,start_time,time_base,extradata_hash', '-of', 'json', str(path)])
    data = read_chunk(proc.stdout, STREAM_JSON_BYTES + 1, runtime)
    require(len(data) <= STREAM_JSON_BYTES, 'stream description exceeds bounded size')
    runtime.finish(proc, label)
    streams = json.loads(data)['streams']
    videos = [s for s in streams if s['codec_type'] == 'video']
    audios = [s for s in streams if s['codec_type'] == 'audio']
    require(len(videos) == 1 and len(audios) <= 1 and len(streams) == len(videos) + len(audios),
            'expected one video and zero or one audio track')
    video = videos[0]
    require(video['codec_name'] == 'h264', 'expected supported H.264 video')
    require(all(s['codec_name'] == 'aac' for s in audios), 'expected supported AAC audio')
    require(0 < video['width'] <= 4096 and 0 < video['height'] <= 4096
            and video['width'] * video['height'] <= MAX_FRAME_PIXELS, 'dimensions exceed oracle bounds')
    return {'video': video, 'audio': audios, 'streams': streams}


def finite(value):
    result = float(value)
    require(math.isfinite(result), 'non-finite timestamp')
    return result


def tool_version(tool, runtime):
    label = tool + '-version'
    proc = runtime.start(label, [tool, '-version'])
    data = read_chunk(proc.stdout, IO_BYTES + 1, runtime)
    require(len(data) <= IO_BYTES, 'tool version output exceeds bound')
    runtime.finish(proc, label)
    return data.decode('utf-8', errors='replace').splitlines()[0]


def scan_frames(source, output, info, runtime, report, errors):
    scans = report['scans']
    result = report['frameMetadata'] = {'inputVideoFrames': 0, 'outputVideoFrames': 0,
                                       'inputAudioFrames': 0, 'outputAudioFrames': 0}
    a = probe_records(source, 'input-video-frames', 'frame', runtime, scans, 'v:0')
    b = probe_records(output, 'output-video-frames', 'frame', runtime, scans, 'v:0')
    maximum, position = 0., None
    report.update(maxPtsErrorSeconds=maximum, maxPtsErrorFrame=position)
    previous = [None, None]
    for index, pair in enumerate(itertools.zip_longest(a, b)):
        times = []
        for side, row in enumerate(pair):
            if row is None:
                times.append(None)
                continue
            result['inputVideoFrames' if side == 0 else 'outputVideoFrames'] += 1
            timestamp = finite(row['best_effort_timestamp_time'])
            if previous[side] is not None and timestamp < previous[side]:
                errors.add('frameOrder', 'decoded presentation timestamps decreased', side=side, frame=index)
            previous[side] = timestamp
            times.append(timestamp)
        if None in times:
            errors.add('frameCount', 'video metadata frame absent on one side', frame=index)
        else:
            delta = abs(times[0] - times[1])
            if delta > maximum:
                maximum, position = delta, index
                report.update(maxPtsErrorSeconds=maximum, maxPtsErrorFrame=position)
            if delta > .001:
                errors.add('pts', 'presentation timestamp differs by more than 1 ms',
                           frame=index, seconds=delta)
    require(result['inputVideoFrames'] > 0 and result['outputVideoFrames'] > 0, 'no decoded video frames')
    report.update(frames=result['inputVideoFrames'], maxPtsErrorSeconds=maximum,
                  maxPtsErrorFrame=position)
    for side, path in enumerate((source, output)):
        if info[side]['audio']:
            label = ('input' if side == 0 else 'output') + '-audio-frames'
            key = 'inputAudioFrames' if side == 0 else 'outputAudioFrames'
            for row in probe_records(path, label, 'frame', runtime, scans, 'a:0'):
                finite(row['best_effort_timestamp_time'])
                result[key] += 1


def scan_packets(source, output, info, mode, runtime, report, errors):
    result = report['packets'] = {'allFieldsEqual': None}
    previous = [{}, {}]
    digests = [hashlib.sha256(), hashlib.sha256()]
    sizes = [source.stat().st_size, output.stat().st_size]
    for label in ('input', 'output'):
        result[label] = {'count': 0, 'byStream': {}}
    streams = [probe_records(p, label + '-packets', 'packet', runtime, report['scans'])
               for p, label in ((source, 'input'), (output, 'output'))]
    equal = True
    for index, pair in enumerate(itertools.zip_longest(*streams)):
        for side, packet in enumerate(pair):
            if packet is None:
                continue
            summary = result['input' if side == 0 else 'output']
            track = int(packet['stream_index'])
            require(track in {s['index'] for s in info[side]['streams']}, 'unknown packet track')
            size, offset = int(packet['size']), int(packet['pos'])
            require(size > 0 and 0 <= offset <= offset + size <= sizes[side], 'packet offset outside saved file')
            require(packet.get('data_hash', '').startswith('SHA256:') and len(packet['data_hash']) == 71,
                    'missing independent compressed packet hash')
            dts = finite(packet['dts_time'])
            finite(packet['pts_time'])
            if 'duration_time' in packet:
                require(finite(packet['duration_time']) >= 0, 'negative packet duration')
            if track in previous[side] and dts < previous[side][track]:
                errors.add('packetOrder', 'DTS decreased in decode order', side=side, packet=index, stream=track)
            previous[side][track] = dts
            summary['count'] += 1
            key = str(track)
            summary['byStream'][key] = summary['byStream'].get(key, 0) + 1
            digests[side].update(json.dumps(packet, sort_keys=True, separators=(',', ':')).encode() + b'\n')
        if mode == 'copy' and pair[0] != pair[1]:
            equal = False
            errors.add('packetCopy', 'compressed packet/hash/timing/offset/side-data record differs', packet=index)
    for side, label in enumerate(('input', 'output')):
        require(result[label]['count'] > 0, 'no compressed packets')
        result[label]['sequenceSHA256'] = digests[side].hexdigest()
    if mode == 'copy':
        result['allFieldsEqual'] = equal


def red_event(eye, n):
    patch = eye[int(n * 104 / 256):int(n * 125 / 256), int(n * 120 / 256):int(n * 137 / 256)]
    means = patch.mean(axis=(0, 1))
    return bool(means[0] > 180 and means[1] < 90 and means[2] < 90)


def compare_audio_packets(source, output, info, runtime, report, errors):
    """AAC is passed through: compare its entire ordered timeline and payload.

    Remuxing may change track IDs, interleaving, offsets and time-base units.
    Convert integer timestamps with exact rationals before applying the 1 ms
    acceptance bound; do not compare ffprobe's rounded decimal strings.
    """
    tracks = [side['audio'] for side in info]
    require(len(tracks[0]) == len(tracks[1]), 'audio track lost or added')
    if not tracks[0]:
        report['audioPackets'] = {'present': False}
        return
    a, b = (t[0] for t in tracks)
    require(a.get('extradata_hash') and a['extradata_hash'] == b.get('extradata_hash'),
            'AAC decoder configuration changed or is unavailable')
    bases = [Fraction(t['time_base']) for t in (a, b)]
    require(all(t > 0 for t in bases), 'invalid audio time base')
    result = report['audioPackets'] = {'present': True, 'inputCount': 0, 'outputCount': 0,
                                      'payloadOrderEqual': True, 'sideDataEqual': True,
                                      'maxTimeErrorSeconds': {'pts': 0., 'dts': 0., 'duration': 0.},
                                      'maxTimeErrorPacket': {'pts': None, 'dts': None, 'duration': None}}
    streams = [probe_records(path, label + '-audio-packets', 'packet', runtime,
                             report['scans'], 'a:0')
               for path, label in ((source, 'input'), (output, 'output'))]
    for index, pair in enumerate(itertools.zip_longest(*streams)):
        for side, packet in enumerate(pair):
            if packet is not None:
                result['inputCount' if side == 0 else 'outputCount'] += 1
        if None in pair:
            result['payloadOrderEqual'] = False
            errors.add('audioPacketCount', 'AAC packet absent on one side', packet=index)
            continue
        left, right = pair
        if any(left.get(k) != right.get(k) for k in ('size', 'data_hash')):
            result['payloadOrderEqual'] = False
            errors.add('audioPacketPayload', 'ordered AAC payload differs', packet=index)
        if left.get('_sideData', []) != right.get('_sideData', []):
            result['sideDataEqual'] = False
            errors.add('audioPacketSideData', 'AAC skip/trim side-data changed', packet=index)
        for field in ('pts', 'dts', 'duration'):
            require(field in left and field in right, 'missing AAC packet ' + field)
            delta = abs(int(left[field]) * bases[0] - int(right[field]) * bases[1])
            if float(delta) > result['maxTimeErrorSeconds'][field]:
                result['maxTimeErrorSeconds'][field] = float(delta)
                result['maxTimeErrorPacket'][field] = index
            if delta > Fraction(1, 1000):
                errors.add('audioPacketTime', 'AAC packet time differs by more than 1 ms',
                           packet=index, field=field, seconds=float(delta))
    require(result['inputCount'] > 0 and result['outputCount'] > 0, 'no AAC packets')


def ffmpeg_args(path):
    return ['ffmpeg', '-v', 'error', '-xerror', '-threads', '1', '-filter_threads', '1',
            '-filter_complex_threads', '1', '-i', str(path)]


def compare_video_packets(source, output, info, runtime, report, errors):
    """Independent ordered-packet oracle for the private encoded-remux path."""
    tracks = [side['video'] for side in info]
    require(tracks[0].get('extradata_hash') and
            tracks[0]['extradata_hash'] == tracks[1].get('extradata_hash'),
            'H.264 decoder configuration changed or is unavailable')
    bases = [Fraction(track['time_base']) for track in tracks]
    require(all(base > 0 for base in bases), 'invalid video time base')
    result = report['videoPackets'] = {'inputCount': 0, 'outputCount': 0,
        'payloadOrderEqual': True, 'flagsAndSideDataEqual': True,
        'maxTimeErrorSeconds': {'pts': 0., 'dts': 0., 'duration': 0.},
        'maxTimeErrorPacket': {'pts': None, 'dts': None, 'duration': None}}
    streams = [probe_records(path, label+'-video-packets', 'packet', runtime,
                             report['scans'], 'v:0')
               for path,label in ((source,'input'),(output,'output'))]
    for index, pair in enumerate(itertools.zip_longest(*streams)):
        for side, packet in enumerate(pair):
            if packet is not None: result['inputCount' if side == 0 else 'outputCount'] += 1
        if None in pair:
            result['payloadOrderEqual'] = False
            errors.add('videoPacketCount', 'H.264 packet absent on one side', packet=index)
            continue
        left, right = pair
        if any(left.get(key) != right.get(key) for key in ('size','data_hash')):
            result['payloadOrderEqual'] = False
            errors.add('videoPacketPayload', 'ordered H.264 payload differs', packet=index)
        if left.get('flags') != right.get('flags') or left.get('_sideData',[]) != right.get('_sideData',[]):
            result['flagsAndSideDataEqual'] = False
            errors.add('videoPacketFlags', 'H.264 key/discard flags or side-data changed', packet=index)
        for field in ('pts','dts','duration'):
            require(field in left and field in right, 'missing H.264 packet '+field)
            delta = abs(int(left[field])*bases[0]-int(right[field])*bases[1])
            if float(delta) > result['maxTimeErrorSeconds'][field]:
                result['maxTimeErrorSeconds'][field] = float(delta)
                result['maxTimeErrorPacket'][field] = index
            if delta > Fraction(1,1000):
                errors.add('videoPacketTime', 'H.264 packet time differs by more than 1 ms', packet=index,field=field,seconds=float(delta))
    require(result['inputCount'] > 0 and result['outputCount'] > 0, 'no H.264 packets')


def compare_pixels(source, output, info, layout, fov, n, mode, limit, runtime, report, errors):
    sv, dv = info[0]['video'], info[1]['video']
    if mode in ('copy','remux'):
        require((sv['width'], sv['height']) == (dv['width'], dv['height']), 'copy dimensions changed')
        require((dv['width'], dv['height']) == ((2 * n, n) if layout == 'sbs' else (n, 2 * n)),
                'copy oracle expects square packed eyes matching --eye-size')
        expected_args = ffmpeg_args(source) + ['-map', '0:v:0']
        output_layout = layout
    else:
        require((dv['width'], dv['height']) == (2 * n, n), 'wrong output dimensions')
        require(sv['width'] % (2 if layout == 'sbs' else 1) == 0
                and sv['height'] % (2 if layout == 'tb' else 1) == 0, 'fractional packed eye dimensions')
        ew = sv['width'] // (2 if layout == 'sbs' else 1)
        eh = sv['height'] // (2 if layout == 'tb' else 1)
        cw = ew // (2 if fov == 360 else 1)
        cx = (ew - cw) // 2
        parts = []
        for eye in (0, 1):
            x = cx + (ew * eye if layout == 'sbs' else 0)
            y = eh * eye if layout == 'tb' else 0
            parts.append(f'[v{eye}]crop={cw}:{eh}:{x}:{y},scale={n}:{n}:flags=bilinear[e{eye}]')
        filt = '[0:v]split=2[v0][v1];' + ';'.join(parts) + ';[e0][e1]hstack=inputs=2[out]'
        expected_args = ffmpeg_args(source) + ['-filter_complex', filt, '-map', '[out]']
        output_layout = 'sbs'
    suffix = ['-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']
    processes = [runtime.start('expected-rgb', expected_args + suffix),
                 runtime.start('actual-rgb', ffmpeg_args(output) + ['-map', '0:v:0'] + suffix)]
    for label in ('expected-rgb', 'actual-rgb'):
        report['scans'][label] = {'count': 0, 'endReached': False}
    result = report['pixels'] = {'inputFrames': 0, 'outputFrames': 0, 'comparedFrames': 0,
                                 'missingOutputFrames': 0, 'extraOutputFrames': 0,
                                 'maxChannelError': 0, 'maxChannelErrorLocation': None}
    events = report['events'] = {'inputCountByEye': [0, 0], 'outputCountByEye': [0, 0],
                                'outputIndicesDroppedByEye': [0, 0], 'allFrameFlagsEqual': True}
    kept_events = [[], []]
    event_hashes = [[hashlib.sha256() for _ in range(2)] for _ in range(2)]
    sums = [0, 0]
    frame_bytes = dv['width'] * dv['height'] * 3
    index = 0
    while True:
        blocks = [read_chunk(p.stdout, frame_bytes, runtime) for p in processes]
        if not any(blocks):
            break
        frames = []
        flags = [[], []]
        for side, block in enumerate(blocks):
            if not block:
                frames.append(None)
                continue
            require(len(block) == frame_bytes, f'partial RGB frame at {index}')
            result['inputFrames' if side == 0 else 'outputFrames'] += 1
            report['scans']['expected-rgb' if side == 0 else 'actual-rgb']['count'] += 1
            frame = np.frombuffer(block, np.uint8).reshape(dv['height'], dv['width'], 3)
            eyes = [frame[:, eye*n:(eye+1)*n] if output_layout == 'sbs'
                    else frame[eye*n:(eye+1)*n, :] for eye in (0, 1)]
            frames.append(eyes)
            for eye, pixels in enumerate(eyes):
                is_red = red_event(pixels, n)
                flags[side].append(is_red)
                if is_red:
                    events['inputCountByEye' if side == 0 else 'outputCountByEye'][eye] += 1
                    event_hashes[side][eye].update(str(index).encode() + b'\n')
                    if side == 1:
                        if len(kept_events[eye]) < limit:
                            kept_events[eye].append(index)
                        else:
                            events['outputIndicesDroppedByEye'][eye] += 1
        if frames[0] is None or frames[1] is None:
            key = 'extraOutputFrames' if frames[0] is None else 'missingOutputFrames'
            result[key] += 1
            errors.add('pixels', 'decoded frame absent on one side', frame=index)
        else:
            result['comparedFrames'] += 1
            for eye in (0, 1):
                diff = np.subtract(frames[0][eye], frames[1][eye], dtype=np.int16)
                sums[eye] += int(np.einsum('ijk,ijk->', diff, diff, dtype=np.int64, optimize=False))
                absolute = np.abs(diff)
                maximum = int(absolute.max())
                if maximum > result['maxChannelError']:
                    y, x, channel = np.unravel_index(int(absolute.argmax()), absolute.shape)
                    result['maxChannelError'] = maximum
                    result['maxChannelErrorLocation'] = {'frame': index, 'eye': eye,
                                                         'x': int(x), 'y': int(y), 'channel': int(channel)}
                if flags[0][eye] != flags[1][eye]:
                    events['allFrameFlagsEqual'] = False
                    errors.add('event', 'short-event frame flag changed', frame=index, eye=eye)
        index += 1
    for proc, label in zip(processes, ('expected-rgb', 'actual-rgb')):
        runtime.finish(proc, label)
        report['scans'][label]['endReached'] = True
    require(result['comparedFrames'] > 0, 'no pixel frame pairs')
    psnr = []
    for eye, total in enumerate(sums):
        mse = total / (result['comparedFrames'] * n * n * 3)
        value = 99 if mse == 0 else 10 * math.log10(255 * 255 / mse)
        psnr.append(value)
        if value < 30:
            errors.add('psnr', 'aggregate eye PSNR below 30 dB', eye=eye, dB=value)
    report.update(eyePSNRdB=psnr, decodedFramesCompared=result['comparedFrames'],
                  redFrameIndicesByEye=kept_events)
    if mode == 'remux' and result['maxChannelError'] != 0:
        errors.add('remuxPixels', 'packet-preserving remux changed decoded RGB pixels')
    events['inputSequenceSHA256ByEye'] = [h.hexdigest() for h in event_hashes[0]]
    events['outputSequenceSHA256ByEye'] = [h.hexdigest() for h in event_hashes[1]]
    if result['missingOutputFrames'] or result['extraOutputFrames']:
        events['allFrameFlagsEqual'] = False
    metadata_counts = report.get('frameMetadata', {})
    for key, count in (('inputVideoFrames', result['inputFrames']), ('outputVideoFrames', result['outputFrames'])):
        if metadata_counts.get(key) != count:
            errors.add('frameCount', 'RGB count differs from independently probed frame count', side=key)


def compare_audio(source, output, info, runtime, report, errors):
    report['decodedAudioIdentical'] = None
    ai, ao = info[0]['audio'], info[1]['audio']
    require(len(ai) == len(ao), 'audio track lost or added')
    if not ai:
        report['audio'] = {'present': False}
        return
    require(all(ai[0].get(k) == ao[0].get(k) for k in ('sample_rate', 'channels')), 'audio format changed')
    start_error = abs(finite(ai[0]['start_time']) - finite(ao[0]['start_time']))
    result = report['audio'] = {'present': True, 'inputBytes': 0, 'outputBytes': 0,
                                'differentBytes': 0, 'firstDifferentByte': None,
                                'startErrorSeconds': start_error}
    if start_error > .001:
        errors.add('audioStart', 'audio start changed by more than 1 ms', seconds=start_error)
    processes = []
    for path, label in ((source, 'input-pcm'), (output, 'output-pcm')):
        processes.append(runtime.start(label, ffmpeg_args(path) + ['-map', '0:a:0', '-f', 's16le',
                                                                  '-acodec', 'pcm_s16le', '-']))
        report['scans'][label] = {'count': 0, 'endReached': False}
    position = 0
    while True:
        left, right = [read_chunk(p.stdout, IO_BYTES, runtime) for p in processes]
        if not left and not right:
            break
        result['inputBytes'] += len(left)
        result['outputBytes'] += len(right)
        report['scans']['input-pcm']['count'] += len(left)
        report['scans']['output-pcm']['count'] += len(right)
        common = min(len(left), len(right))
        mask = np.frombuffer(left, np.uint8, count=common) != np.frombuffer(right, np.uint8, count=common)
        mismatch = int(np.count_nonzero(mask)) + abs(len(left) - len(right))
        if mismatch:
            first = int(mask.argmax()) if np.any(mask) else common
            if result['firstDifferentByte'] is None:
                result['firstDifferentByte'] = position + first
            result['differentBytes'] += mismatch
            errors.add('audio', 'decoded PCM bytes differ', offset=position + first, differentBytes=mismatch)
        position += max(len(left), len(right))
    for proc, label in zip(processes, ('input-pcm', 'output-pcm')):
        runtime.finish(proc, label)
        report['scans'][label]['endReached'] = True
    report['decodedAudioIdentical'] = result['differentBytes'] == 0


def check_metadata(source, output, layout, mode, runtime, report):
    class Reader(metadata.Reader):
        def read(self, offset, size):
            runtime.check()
            return super().read(offset, size)

    original, saved = Reader(source), Reader(output)
    try:
        top = saved.boxes()
        moov = metadata.exactly(top, 'moov')
        report['vrMetadata'] = metadata.verify_metadata(saved, moov, layout if mode in ('copy','remux') else 'sbs')
        if mode == 'copy':
            old_moov = metadata.exactly(original.boxes(), 'moov')
            require(moov['start'] == original.length and moov['end'] == saved.length,
                    'copy output must append the new moov at original EOF')
            free = [b for b in top if b['type'] == 'free' and b['start'] == old_moov['start']]
            require(len(free) == 1 and free[0]['size'] == old_moov['size'], 'old moov/free extent changed')
            metadata.verify_prefix(original, saved, old_moov)
            before = metadata.track_tables(original, old_moov)
            after = metadata.track_tables(saved, moov)
            require(len(before) == len(after), 'track count changed')
            for a, b in zip(before, after):
                require(a['handler'] == b['handler'] and a['preserved_box_hashes'] == b['preserved_box_hashes'],
                        'copy sample/timing/offset/edit tables changed')
                if a['handler'] == 'vide':
                    left, right = a['sample_entry'], b['sample_entry']
                    require(left['type'] == right['type'] and
                            original.read(left['payload'], 78) == saved.read(right['payload'], 78),
                            'copy video sample description changed')
                    descriptions = []
                    for reader, entry in ((original, left), (saved, right)):
                        descriptions.append([(c['type'], reader.box_hash(c))
                                             for c in reader.children(entry, 78)
                                             if c['type'] not in ('st3d', 'sv3d')])
                    require(descriptions[0] == descriptions[1], 'copy codec/display configuration changed')
                else:
                    require(original.box_hash(a['sample_entry']) == saved.box_hash(b['sample_entry']),
                            'copy audio sample description changed')
            report['copyTablesIdentical'] = True
    finally:
        original.close()
        saved.close()


def file_hash(path, label, runtime, report):
    stats = report['scans'][label] = {'count': 0, 'endReached': False}
    h = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            runtime.check()
            h.update(block)
            stats['count'] += len(block)
    stats['endReached'] = True
    return h.hexdigest()


def verify_files(source, output, *, layout, fov, eye_size, mode='convert', timeout=1800,
                 detail_limit=32, log_dir=None):
    source, output = Path(source), Path(output)
    require(layout in ('sbs', 'tb') and fov in (180, 360) and mode in ('copy', 'convert', 'remux'), 'invalid mode/settings')
    require(mode != 'copy' or fov == 180, 'copy requires 180 degree input')
    require(mode != 'remux' or fov == 180, 'remux requires 180 degree input')
    require(16 <= eye_size <= MAX_EYE_SIZE, 'eye size must be 16..2048')
    require(math.isfinite(timeout) and 0 < timeout <= 7 * 86400, 'invalid wall-clock budget')
    require(0 <= detail_limit <= 1000, 'detail limit must be 0..1000')
    temporary = tempfile.TemporaryDirectory(prefix='vr180-large-oracle-') if log_dir is None else None
    directory = Path(temporary.name if temporary else log_dir)
    runtime = Runtime(directory, timeout)
    errors = Errors(detail_limit)
    report = {'schema': 'vr180-independent-large-verifier-v1', 'status': 'FAIL',
              'input': str(source), 'output': str(output), 'mode': mode,
              'settings': {'layout': layout, 'fov': fov, 'eyeSize': eye_size},
              'oracle': Path(__file__).name, 'scans': {}, 'errors': errors.report,
              'completeScan': False, 'copyTablesIdentical': None,
              'bounds': {'eyePixels': MAX_EYE_SIZE, 'framePixels': MAX_FRAME_PIXELS,
                         'probeRecordBytes': RECORD_BYTES, 'streamDescriptionBytes': STREAM_JSON_BYTES,
                         'metadataPayloadBytes': 16 * 1024 * 1024, 'metadataBoxCount': 100000,
                         'pcmBlockBytes': IO_BYTES, 'stderrBytesPerProcess': STDERR_BYTES,
                         'detailLimit': detail_limit, 'wallTimeoutSeconds': timeout,
                         'frameCountLimit': None, 'fileBytesLimit': None},
              'scope': 'synthetic full scans; native FFmpeg memory, 5/10 GB capacity, real-camera quality, '
                       'target VR playback and usability are not established by this report'}
    try:
        states = []
        for path in (source, output):
            stat = path.stat()
            require(path.is_file() and stat.st_size > 0, 'missing or empty media file')
            states.append((stat.st_size, stat.st_mtime_ns, stat.st_ino))
        report.update(inputBytes=states[0][0], outputBytes=states[1][0])
        report['tools'] = {name: tool_version(name, runtime) for name in ('ffmpeg', 'ffprobe')}
        info = [stream_info(path, name + '-streams', runtime)
                for path, name in ((source, 'input'), (output, 'output'))]
        report['streams'] = {'input': info[0]['streams'], 'output': info[1]['streams']}
        if mode == 'copy':
            preserved = [[{k: v for k, v in stream.items()
                           if not (stream['codec_type'] == 'video' and k == 'side_data_list')}
                          for stream in side['streams']] for side in info]
            if preserved[0] != preserved[1]:
                errors.add('copyStreams', 'copy codec, dimensions, audio format or time-base changed')
        stages = [
            ('metadata', lambda: check_metadata(source, output, layout, mode, runtime, report)),
            ('frames', lambda: scan_frames(source, output, info, runtime, report, errors)),
            ('packets', lambda: scan_packets(source, output, info, mode, runtime, report, errors)),
            ('audioPackets', lambda: compare_audio_packets(source, output, info, runtime, report, errors)),
            ('pixels', lambda: compare_pixels(source, output, info, layout, fov, eye_size, mode,
                                              detail_limit, runtime, report, errors)),
            ('audio', lambda: compare_audio(source, output, info, runtime, report, errors)),
        ]
        if mode == 'remux':
            stages.insert(3,('videoPackets',lambda:compare_video_packets(source,output,info,runtime,report,errors)))
        for name, action in stages:
            runtime.check()
            try:
                action()
            except Exception as exc:
                errors.add(name, f'{type(exc).__name__}: {exc}')
        report['inputSHA256'] = file_hash(source, 'input-hash', runtime, report)
        report['outputSHA256'] = file_hash(output, 'output-hash', runtime, report)
        for path, before in zip((source, output), states):
            after = path.stat()
            require(before == (after.st_size, after.st_mtime_ns, after.st_ino), 'file changed during verification')
        required = ['input-video-frames', 'output-video-frames', 'input-packets', 'output-packets',
                    'expected-rgb', 'actual-rgb', 'input-hash', 'output-hash']
        if mode == 'remux': required += ['input-video-packets','output-video-packets']
        for side, name in enumerate(('input', 'output')):
            if info[side]['audio']:
                required += [name + '-audio-frames', name + '-audio-packets', name + '-pcm']
        report['completeScan'] = all(report['scans'].get(name, {}).get('endReached', False) for name in required)
        if not report['completeScan']:
            errors.add('incomplete', 'one or more required scans did not reach a confirmed successful EOF')
        if errors.report['total'] == 0 and report['completeScan']:
            report['status'] = 'PASS'
    except Exception as exc:
        errors.add('fatal', f'{type(exc).__name__}: {exc}')
    finally:
        runtime.close()
        report['elapsedSeconds'] = round(time.monotonic() - runtime.started, 6)
        report['stderrLogs'] = runtime.logs
        report['stderrLogsRetained'] = temporary is None
        if temporary:
            for log in report['stderrLogs'].values():
                log['path'] = None
            temporary.cleanup()
        report['verifierSHA256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        report['metadataVerifierSHA256'] = hashlib.sha256(Path(metadata.__file__).read_bytes()).hexdigest()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--layout', choices=['sbs', 'tb'], required=True)
    parser.add_argument('--fov', choices=[180, 360], type=int, required=True)
    parser.add_argument('--eye-size', type=int, required=True)
    parser.add_argument('--mode', choices=['convert', 'copy', 'remux'], default='convert')
    parser.add_argument('--timeout', type=float, default=1800)
    parser.add_argument('--detail-limit', type=int, default=32)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    log_dir = args.report.parent / (args.report.stem + '-stderr') if args.report else None
    report = verify_files(args.input, args.output, layout=args.layout, fov=args.fov,
                          eye_size=args.eye_size, mode=args.mode, timeout=args.timeout,
                          detail_limit=args.detail_limit, log_dir=log_dir)
    encoded = json.dumps(report, indent=2, allow_nan=False) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded)
    print(encoded, end='')
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
