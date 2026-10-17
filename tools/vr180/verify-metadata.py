#!/usr/bin/env python3
"""Independently verify a metadata-only MP4 output; does not import producer code.

Checks the stored files through a small Python box reader and the installed
ffprobe. Intended for deterministic local fixtures, not for accepting media
into the browser application. The JSON report includes its own script hash.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import time


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Reader:
    def __init__(self, path):
        self.path = Path(path)
        self.length = self.path.stat().st_size
        self.file = self.path.open('rb')
        self.boxes_read = 0

    def close(self):
        self.file.close()

    def read(self, offset, size):
        require(0 <= offset <= offset + size <= self.length, 'Read outside file')
        self.file.seek(offset)
        data = self.file.read(size)
        require(len(data) == size, 'Short read')
        return data

    def boxes(self, start=0, end=None):
        if end is None:
            end = self.length
        out = []
        while start < end:
            require(end - start >= 8, 'Truncated box header')
            size, raw_type = struct.unpack('>I4s', self.read(start, 8))
            header = 8
            if size == 1:
                size = struct.unpack('>Q', self.read(start + 8, 8))[0]
                header = 16
            require(size >= header and start + size <= end, 'Invalid box extent')
            self.boxes_read += 1
            require(self.boxes_read < 100000, 'Verifier box budget exceeded')
            out.append({'type': raw_type.decode('latin1'), 'start': start, 'end': start + size, 'payload': start + header, 'size': size})
            start += size
        return out

    def children(self, parent, prefix=0):
        return self.boxes(parent['payload'] + prefix, parent['end'])

    def payload(self, box):
        require(box['end'] - box['payload'] <= 16 * 1024 * 1024, 'Verifier metadata budget exceeded')
        return self.read(box['payload'], box['end'] - box['payload'])

    def box_hash(self, box):
        h = hashlib.sha256()
        at = box['start']
        while at < box['end']:
            n = min(1024 * 1024, box['end'] - at)
            h.update(self.read(at, n))
            at += n
        return h.hexdigest()


def exactly(boxes, kind):
    matches = [b for b in boxes if b['type'] == kind]
    require(len(matches) == 1, f'Expected exactly one {kind}, found {len(matches)}')
    return matches[0]


def track_tables(reader, moov):
    tracks = [b for b in reader.children(moov) if b['type'] == 'trak']
    result = []
    for trak in tracks:
        parts = reader.children(trak)
        mdia = exactly(parts, 'mdia')
        media = reader.children(mdia)
        handler = reader.payload(exactly(media, 'hdlr'))[8:12].decode('ascii')
        minf = exactly(media, 'minf')
        stbl = exactly(reader.children(minf), 'stbl')
        tables = reader.children(stbl)
        stsd = exactly(tables, 'stsd')
        descriptions = reader.children(stsd, 8)
        require(struct.unpack('>I', reader.payload(stsd)[4:8])[0] == len(descriptions), 'stsd count mismatch')
        require(len(descriptions) == 1, 'Expected one sample description')
        hashes = {b['type']: reader.box_hash(b) for b in tables if b['type'] != 'stsd'}
        hashes['mdhd'] = reader.box_hash(exactly(media, 'mdhd'))
        hashes['tkhd'] = reader.box_hash(exactly(parts, 'tkhd'))
        for node in parts:
            if node['type'] == 'edts':
                hashes['edts'] = reader.box_hash(node)
        result.append({'handler': handler, 'trak': trak, 'sample_entry': descriptions[0], 'preserved_box_hashes': hashes})
    return result


def verify_metadata(reader, moov, layout):
    tracks = track_tables(reader, moov)
    videos = [t for t in tracks if t['handler'] == 'vide']
    require(len(videos) == 1, 'Expected one video track')
    entry = videos[0]['sample_entry']
    require(entry['type'] == 'avc1', 'Expected avc1 sample entry')
    fixed = reader.read(entry['payload'], 78)
    width, height = struct.unpack('>HH', fixed[24:28])
    boxes = reader.children(entry, 78)
    st3d = exactly(boxes, 'st3d')
    sv3d = exactly(boxes, 'sv3d')
    avcc = exactly(boxes, 'avcC')
    require(avcc['end'] <= st3d['start'] < sv3d['start'], 'Spherical metadata ordering is incorrect')
    for optional in [b for b in boxes if b['type'] in ('pasp', 'clap')]:
        require(sv3d['end'] <= optional['start'], 'Spherical metadata must precede optional display boxes')
    expected_mode = 2 if layout == 'sbs' else 1
    require(reader.payload(st3d) == b'\0\0\0\0' + bytes([expected_mode]), 'Wrong st3d version/flags/stereo_mode')
    sphere = reader.children(sv3d)
    header = reader.payload(exactly(sphere, 'svhd'))
    require(header[:4] == b'\0' * 4 and header[-1:] == b'\0', 'Invalid svhd version/flags/source')
    metadata_source = header[4:-1].decode('utf-8')
    projection = reader.children(exactly(sphere, 'proj'))
    require(sorted(b['type'] for b in projection) == ['equi', 'prhd'], 'Unexpected projection subtype/duplicates')
    pose = reader.payload(exactly(projection, 'prhd'))
    require(pose == b'\0' * 16, 'Expected zero 16.16 projection pose')
    equi = reader.payload(exactly(projection, 'equi'))
    require(len(equi) == 20 and equi[:4] == b'\0' * 4, 'Invalid equi full box')
    bounds = struct.unpack('>IIII', equi[4:])
    require(bounds == (0, 0, 0x40000000, 0x40000000), 'Expected exact 180x180 cropped equirectangular bounds')
    return {
        'path': 'moov/trak(vide)/mdia/minf/stbl/stsd/avc1',
        'width': width, 'height': height, 'stereo_mode': expected_mode,
        'projection': 'equi', 'pose_degrees': [0, 0, 0],
        'bounds_u0_32': dict(zip(['top', 'bottom', 'left', 'right'], bounds)),
        'metadata_source': metadata_source, 'active_st3d_count': 1, 'active_sv3d_count': 1,
        'entry_children': [b['type'] for b in boxes],
    }


def verify_prefix(source, output, old_moov):
    # Expected prefix is defined by the append-only contract, independently of producer code.
    expected_change = old_moov['start'] + 4
    at = 0
    while at < source.length:
        n = min(1024 * 1024, source.length - at)
        expected = bytearray(source.read(at, n))
        for i, char in enumerate(b'free'):
            index = expected_change + i - at
            if 0 <= index < n:
                expected[index] = char
        require(bytes(expected) == output.read(at, n), f'Original bytes changed outside old moov fourcc at block {at}')
        at += n


def ffprobe(path):
    command = ['ffprobe', '-v', 'error', '-show_streams', '-show_packets', '-show_data_hash', 'sha256', '-of', 'json', str(path)]
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=120)
    require(not result.stderr.strip(), f'ffprobe reported an error: {result.stderr.strip()}')
    return json.loads(result.stdout)


def sequence_digest(packets):
    data = json.dumps(packets, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(data).hexdigest()


def verify(source_path, output_path, layout):
    source, output = Reader(source_path), Reader(output_path)
    try:
        original_top, result_top = source.boxes(), output.boxes()
        old_moov = exactly(original_top, 'moov')
        new_moov = exactly(result_top, 'moov')
        require(new_moov['start'] == source.length and new_moov['end'] == output.length, 'New moov must be appended at original EOF')
        free = [b for b in result_top if b['type'] == 'free' and b['start'] == old_moov['start']]
        require(len(free) == 1 and free[0]['size'] == old_moov['size'], 'Old moov was not replaced with an equal-size free')
        verify_prefix(source, output, old_moov)
        input_mdats = [b for b in original_top if b['type'] == 'mdat']
        output_mdats = [b for b in result_top if b['type'] == 'mdat']
        require(len(input_mdats) == len(output_mdats) > 0, 'mdat count changed')
        media = []
        for before, after in zip(input_mdats, output_mdats):
            require(before == after, 'mdat absolute offsets or sizes changed')
            before_hash, after_hash = source.box_hash(before), output.box_hash(after)
            require(before_hash == after_hash, 'mdat bytes changed')
            media.append({'start': before['start'], 'end': before['end'], 'sha256': before_hash})
        original_tracks, result_tracks = track_tables(source, old_moov), track_tables(output, new_moov)
        require(len(original_tracks) == len(result_tracks), 'Track count changed')
        table_checks = []
        for before, after in zip(original_tracks, result_tracks):
            require(before['handler'] == after['handler'], 'Track order/type changed')
            require(before['preserved_box_hashes'] == after['preserved_box_hashes'], 'Sample tables, offsets, edits or track timing changed')
            table_checks.append({'handler': before['handler'], 'box_hashes': before['preserved_box_hashes'], 'all_equal': True})
        metadata = verify_metadata(output, new_moov, layout)
        left, right = ffprobe(source_path), ffprobe(output_path)
        packets_a, packets_b = left.get('packets', []), right.get('packets', [])
        require(packets_a and packets_a == packets_b, 'ffprobe packet bytes/hash/PTS/DTS/duration/position/side-data sequence differs')
        original_streams = left.get('streams', [])
        result_streams = right.get('streams', [])
        require(len(original_streams) == len(result_streams) == len(original_tracks), 'ffprobe stream count changed')
        summaries = []
        for before, after in zip(original_streams, result_streams):
            before = dict(before); after = dict(after)
            if before['codec_type'] == 'video':
                before.pop('side_data_list', None)
                after.pop('side_data_list', None)
            require(before == after, 'ffprobe codec, dimensions, audio format or stream time-base changed')
            selected = [p for p in packets_a if p['stream_index'] == before['index']]
            require(selected and all(p.get('data_hash', '').startswith('SHA256:') for p in selected), 'Missing independent compressed-packet hashes')
            summaries.append({'stream_index': before['index'], 'type': before['codec_type'], 'codec': before['codec_name'], 'time_base': before['time_base'], 'packet_count': len(selected), 'packet_sequence_sha256': sequence_digest(selected), 'first_packet': selected[0], 'last_packet': selected[-1], 'all_fields_equal': True})
        video_probe = next(s for s in result_streams if s['codec_type'] == 'video')
        side = video_probe.get('side_data_list', [])
        stereo = next((s for s in side if s['side_data_type'] == 'Stereo 3D'), None)
        sphere = next((s for s in side if s['side_data_type'] == 'Spherical Mapping'), None)
        require(stereo and stereo['type'] == ('side by side' if layout == 'sbs' else 'top and bottom') and stereo.get('inverted') == 0, 'ffprobe did not recognize intended eye order')
        require(sphere and 'equirectangular' in sphere.get('projection', '') and all(sphere.get(k) == 0 for k in ['yaw', 'pitch', 'roll']), 'ffprobe did not recognize spherical projection/pose')
        return {
            'passed': True,
            'input': {'path': str(Path(source_path).resolve()), 'bytes': source.length, 'sha256': digest_file(source_path)},
            'output': {'path': str(Path(output_path).resolve()), 'bytes': output.length, 'sha256': digest_file(output_path)},
            'layout': layout,
            'append_contract': {'old_moov': old_moov, 'new_moov': new_moov, 'old_moov_became_same_size_free': True, 'original_prefix_unchanged_except_fourcc': True, 'active_moov_count': 1},
            'mdats': media, 'sample_and_timing_tables': table_checks, 'independent_box_metadata': metadata,
            'ffprobe': {'all_packet_fields_equal': True, 'compressed_packet_count': len(packets_a), 'packet_sequence_sha256': sequence_digest(packets_a), 'streams': summaries, 'video_side_data': side},
            'limits': ['No target headset/player verification.', 'ffprobe displayed crop bounds are pixel conversions, not raw unsigned 0.32 values.', 'This verifies metadata-only preservation, not pixel-transcode audio edit handling.'],
        }
    finally:
        source.close()
        output.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--layout', required=True, choices=['sbs', 'tb'])
    parser.add_argument('--report', required=True, type=Path)
    args = parser.parse_args()
    start = time.monotonic()
    base = {'schema': 'vr180-metadata-independent-verification-v1', 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'verifier': {'path': str(Path(__file__).resolve()), 'sha256': digest_file(__file__), 'python': sys.version.split()[0], 'ffprobe': subprocess.run(['ffprobe', '-version'], check=True, capture_output=True, text=True).stdout.splitlines()[0]}}
    try:
        result = verify(args.input, args.output, args.layout)
    except Exception as exc:
        result = {'passed': False, 'error': f'{type(exc).__name__}: {exc}', 'input': str(args.input), 'output': str(args.output), 'layout': args.layout}
    report = {**base, **result, 'verification_wall_seconds': round(time.monotonic() - start, 6)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'passed': report['passed'], 'report': str(args.report), 'error': report.get('error')}, ensure_ascii=False))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
