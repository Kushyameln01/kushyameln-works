"""Independent oracle regression tests; only the existing two-second media is used."""
import importlib.util
import hashlib
import io
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import tracemalloc
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'tools/vr180/verify-conversion-large.py'
spec = importlib.util.spec_from_file_location('vr180_verify_large', SCRIPT)
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


def box(kind, payload):
    return struct.pack('>I4s', len(payload) + 8, kind.encode()) + payload


def tagged_fixture(source, target, layout='sbs'):
    """Small test fixture writer. No production module is imported."""
    data = source.read_bytes()
    stereo = box('st3d', b'\0' * 4 + bytes([2 if layout == 'sbs' else 1]))
    sphere = box('sv3d', box('svhd', b'\0' * 4 + b'oracle-test\0') +
                 box('proj', box('prhd', b'\0' * 16) +
                     box('equi', struct.pack('>IIIII', 0, 0, 0, 0x40000000, 0x40000000))))

    def rewrite(payload):
        result = bytearray()
        at = 0
        while at < len(payload):
            size, kind = struct.unpack_from('>I4s', payload, at)
            if size < 8 or at + size > len(payload):
                raise ValueError('invalid test input')
            body = payload[at + 8:at + size]
            if kind in (b'moov', b'trak', b'mdia', b'minf', b'stbl'):
                body = rewrite(body)
            elif kind == b'stsd':
                body = body[:8] + rewrite(body[8:])
            elif kind == b'avc1':
                children = body[78:]
                end_avcc = 0
                while end_avcc < len(children):
                    length, tag = struct.unpack_from('>I4s', children, end_avcc)
                    end_avcc += length
                    if tag == b'avcC':
                        break
                body = body[:78] + children[:end_avcc] + stereo + sphere + children[end_avcc:]
            result.extend(box(kind.decode(), body))
            at += size
        return bytes(result)

    at = 0
    while at < len(data):
        size, kind = struct.unpack_from('>I4s', data, at)
        if kind == b'moov':
            replacement = rewrite(data[at:at + size])
            target.write_bytes(data[:at + 4] + b'free' + data[at + 8:] + replacement)
            return
        at += size
    raise ValueError('test input has no moov')


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg is required')
class LargeOracle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='vr180-oracle-test-')
        cls.directory = Path(cls.temp.name)
        cls.source = ROOT / 'docs/vr180-studio/fixtures/stereo180-sbs.mp4'
        cls.good = cls.directory / 'good.mp4'
        tagged_fixture(cls.source, cls.good)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def verify(self, output=None, **kwargs):
        return oracle.verify_files(self.source, output or self.good, layout='sbs', fov=180,
                                   eye_size=256, timeout=90, **kwargs)

    def transcode(self, name, extra):
        plain = self.directory / (name + '-plain.mp4')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(self.source),
                        '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-crf', '18',
                        '-preset', 'ultrafast', '-c:a', 'copy', '-fps_mode', 'passthrough',
                        *extra, str(plain)], check=True, capture_output=True)
        result = self.directory / (name + '.mp4')
        tagged_fixture(plain, result)
        return result

    def test_matches_original_small_oracle(self):
        old = subprocess.run([sys.executable, str(ROOT / 'tools/vr180/verify-conversion.py'),
                              str(self.source), str(self.good), '--layout', 'sbs', '--fov', '180',
                              '--eye-size', '256'], check=True, capture_output=True, text=True)
        old = json.loads(old.stdout)
        report = self.verify()
        self.assertEqual(report['status'], 'PASS', report)
        for name in ('frames', 'eyePSNRdB', 'maxPtsErrorSeconds', 'redFrameIndicesByEye',
                     'decodedAudioIdentical', 'outputSHA256'):
            self.assertEqual(report[name], old[name], name)
        self.assertTrue(report['completeScan'])
        self.assertTrue(all(s['endReached'] for s in report['scans'].values()))
        self.assertEqual(report['frameMetadata']['inputVideoFrames'], 60)
        self.assertGreater(report['packets']['input']['count'], 60)
        self.assertGreater(report['frameMetadata']['inputAudioFrames'], 0)
        self.assertEqual(report['qualityProfile']['id'], 'aggregate-30')
        self.assertFalse(report['qualityProfile']['frameFloorRequired'])
        self.assertTrue(report['frameQuality']['completeScan'])
        self.assertEqual(report['frameQuality']['framesByEye'], [60, 60])
        self.assertEqual(report['frameQuality']['zeroErrorFramesByEye'], [60, 60])
        self.assertEqual(report['frameQuality']['verdict'], 'DIAGNOSTIC_ONLY')

    def test_local_frame_damage_preserves_default_but_fails_explicit_frame_floor(self):
        damaged = self.transcode('one-frame-quality-dip', [
            '-vf', "drawbox=x=64:y=64:w=48:h=48:color=black:t=fill:enable='eq(n,5)'"
        ])
        default = self.verify(damaged)
        self.assertEqual(default['status'], 'PASS', default)
        quality = default['frameQuality']
        self.assertTrue(quality['completeScan'])
        self.assertGreater(quality['belowThresholdFramesByEye'][0], 0)
        self.assertEqual(quality['minimumAtFrameByEye'][0], 5)
        self.assertTrue(any(row['firstFrame'] <= 5 <= row['lastFrame'] for row in quality['intervalsByEye'][0]))
        self.assertEqual(quality['verdict'], 'DIAGNOSTIC_ONLY')
        strict = self.verify(damaged, quality_profile='aggregate-30-frame-30')
        self.assertEqual(strict['status'], 'FAIL', strict)
        self.assertTrue(strict['completeScan'])
        self.assertEqual(strict['eyePSNRdB'], default['eyePSNRdB'])
        self.assertNotIn('psnr', strict['errors']['byKind'])
        self.assertIn('framePSNR', strict['errors']['byKind'])
        self.assertEqual(strict['frameQuality']['verdict'], 'FAIL')
        self.assertEqual(strict['frameQuality']['allFrameSequenceSHA256ByEye'],
                         quality['allFrameSequenceSHA256ByEye'])
        self.assertNotEqual(strict['qualityProfile']['sha256'], default['qualityProfile']['sha256'])

    def test_copy_compares_all_packet_fields_and_timing_tables(self):
        report = self.verify(mode='copy')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertTrue(report['packets']['allFieldsEqual'])
        self.assertTrue(report['copyTablesIdentical'])
        self.assertEqual(report['packets']['input']['count'], report['packets']['output']['count'])

    def test_remux_compares_every_video_packet_and_exact_decoded_pixels(self):
        report = self.verify(mode='remux')
        self.assertEqual(report['status'], 'PASS', report)
        self.assertTrue(report['videoPackets']['payloadOrderEqual'])
        self.assertEqual(report['videoPackets']['inputCount'], 60)
        self.assertEqual(report['pixels']['maxChannelError'], 0)
        self.assertTrue(report['completeScan'])

    def test_remux_refuses_reencoded_packets_even_with_similar_images(self):
        report = self.verify(self.transcode('not-a-remux', []), mode='remux')
        self.assertEqual(report['status'], 'FAIL')
        self.assertTrue('videoPacketPayload' in report['errors']['byKind'] or
                        'videoPackets' in report['errors']['byKind'])

    def test_remux_does_not_claim_360_to_180_projection(self):
        with self.assertRaisesRegex(ValueError, 'remux requires 180'):
            oracle.verify_files(self.source, self.good, layout='sbs', fov=360,
                                eye_size=256, mode='remux', timeout=90)

    def test_missing_vr_metadata_fails(self):
        report = self.verify(self.source)
        self.assertEqual(report['status'], 'FAIL')
        self.assertIn('metadata', report['errors']['byKind'])

    def test_copy_rejects_360_degree_settings(self):
        with self.assertRaisesRegex(ValueError, 'copy requires 180'):
            oracle.verify_files(self.source, self.good, layout='sbs', fov=360,
                                eye_size=256, mode='copy', timeout=90)

    def test_audio_interior_timestamps_are_checked_even_when_pcm_is_identical(self):
        data = bytearray(self.good.read_bytes())
        at = data.rfind(b'stts')
        self.assertGreater(at, 0)
        self.assertEqual(struct.unpack_from('>IIIII', data, at + 8), (2, 94, 1024, 1, 768))
        struct.pack_into('>IIIII', data, at + 8, 2, 94, 1025, 1, 674)
        changed = self.directory / 'audio-time-drift.mp4'
        changed.write_bytes(data)
        report = self.verify(changed)
        self.assertTrue(report['decodedAudioIdentical'])
        self.assertEqual(report['status'], 'FAIL', report)
        self.assertTrue(report['completeScan'])
        self.assertIn('audioPacketTime', report['errors']['byKind'])

    def test_missing_frame_and_reversed_sequence_fail_with_bounded_details(self):
        for name, vf in [('missing-frame', "select='not(eq(n,14))'"), ('reversed', 'reverse')]:
            with self.subTest(name=name):
                report = self.verify(self.transcode(name, ['-vf', vf]), detail_limit=2)
                self.assertEqual(report['status'], 'FAIL')
                self.assertTrue(report['completeScan'], report)
                self.assertGreater(report['errors']['total'], 0)
                self.assertLessEqual(len(report['errors']['details']), 2)
                self.assertGreater(report['errors']['dropped'], 0)
                if name == 'missing-frame':
                    self.assertEqual(report['pixels']['missingOutputFrames'], 1)
                else:
                    self.assertIn('event', report['errors']['byKind'])

    def test_audio_modification_fails(self):
        changed = self.transcode('muted', ['-af', 'volume=0', '-c:a', 'aac'])
        report = self.verify(changed)
        self.assertEqual(report['status'], 'FAIL')
        self.assertFalse(report['decodedAudioIdentical'])
        self.assertGreater(report['audio']['differentBytes'], 0)
        self.assertIsNotNone(report['audio']['firstDifferentByte'])

    def test_offset_corruption_and_truncation_are_never_complete_passes(self):
        damaged = bytearray(self.good.read_bytes())
        at = damaged.rfind(b'stco')
        self.assertGreater(at, 0)
        struct.pack_into('>I', damaged, at + 12, len(damaged) + 100)
        offset_bad = self.directory / 'offset.mp4'
        offset_bad.write_bytes(damaged)
        truncated = self.directory / 'truncated.mp4'
        truncated.write_bytes(self.good.read_bytes()[:-21])
        for path in (offset_bad, truncated):
            with self.subTest(path=path.name):
                report = self.verify(path)
                self.assertEqual(report['status'], 'FAIL', report)
                self.assertGreater(report['errors']['total'], 0)

    def test_truncated_event_details_preserve_total_and_exact_comparison(self):
        report = self.verify(detail_limit=1)
        self.assertEqual(report['status'], 'PASS', report)
        self.assertEqual(report['redFrameIndicesByEye'], [[14], [14]])
        self.assertEqual(report['events']['outputCountByEye'], [6, 6])
        self.assertEqual(report['events']['outputIndicesDroppedByEye'], [5, 5])
        self.assertTrue(report['events']['allFrameFlagsEqual'])


class FrameQualityDiagnostics(unittest.TestCase):
    def accumulator(self, limit=2, profile='aggregate-30'):
        return oracle.FrameQuality(oracle.select_quality_profile(profile), limit)

    def test_profile_is_recorded_and_canonical_hash_is_not_self_referential(self):
        selected = oracle.select_quality_profile('aggregate-30')
        digest = selected.pop('sha256')
        expected = hashlib.sha256(json.dumps(selected, sort_keys=True, separators=(',', ':'),
                                            allow_nan=False).encode()).hexdigest()
        self.assertEqual(digest, expected)
        self.assertFalse(selected['frameFloorRequired'])
        self.assertEqual(selected['aggregateMinimumPSNRdB'], 30)
        with self.assertRaisesRegex(ValueError, 'unknown quality profile'):
            oracle.select_quality_profile('silently-adjusted-threshold')

    def test_exact_threshold_and_zero_error_do_not_fail_the_floor(self):
        quality = self.accumulator(profile='aggregate-30-frame-30')
        # 65025 / 1000 yields exactly 30 dB; zero error is positive infinity.
        for eye in (0, 1):
            quality.add(0, eye, 0, 1000)
            quality.add(1, eye, 65025, 1000)
            quality.add(2, eye, 65024, 1000)
        quality.finish(True)
        self.assertEqual(quality.report['verdict'], 'PASS')
        self.assertEqual(quality.report['minimumPSNRdBByEye'], [30, 30])
        self.assertEqual(quality.report['minimumAtFrameByEye'], [1, 1])
        self.assertEqual(quality.report['belowThresholdFramesByEye'], [0, 0])
        self.assertEqual(quality.report['zeroErrorFramesByEye'], [1, 1])
        # Immediately below the fixed floor, rather than a rounded display value.
        other = self.accumulator(profile='aggregate-30-frame-30')
        for eye in (0, 1):
            other.add(0, eye, 65026, 1000)
        other.finish(True)
        self.assertEqual(other.report['verdict'], 'FAIL')

    def test_intervals_merge_close_at_eof_and_do_not_bridge_missing_frames(self):
        quality = self.accumulator(limit=2)
        for index, squared in ((0, 65026), (1, 130050), (2, 0), (3, 65026), (5, 65026)):
            for eye in (0, 1):
                quality.add(index, eye, squared, 1000)
        quality.finish(False)
        report = quality.report
        self.assertEqual(report['verdict'], 'INCOMPLETE')
        self.assertEqual(report['belowThresholdFramesByEye'], [4, 4])
        self.assertEqual(report['intervalCountByEye'], [3, 3])
        self.assertEqual(report['intervalsDroppedByEye'], [1, 1])
        self.assertEqual(report['openIntervalsByEye'], [None, None])
        self.assertEqual([(r['firstFrame'], r['lastFrame'], r['frames'])
                          for r in report['intervalsByEye'][0]], [(0, 1, 2), (3, 3, 1)])
        self.assertEqual(report['intervalsByEye'][0][0]['minimumAtFrame'], 1)
        self.assertEqual(report['minimumAtFrameByEye'], [1, 1])

    def test_all_frame_hashes_cover_dropped_intervals_and_zero_error_frames(self):
        quality = self.accumulator(limit=0)
        expected = [hashlib.sha256(), hashlib.sha256()]
        for index in range(20):
            for eye in (0, 1):
                squared = 65026 + eye if index % 2 == 0 else 0
                quality.add(index, eye, squared, 1000)
                expected[eye].update(f'{index}:{squared}:1000\n'.encode('ascii'))
        quality.finish(True)
        self.assertEqual(quality.report['allFrameSequenceSHA256ByEye'], [h.hexdigest() for h in expected])
        self.assertEqual(quality.report['intervalsByEye'], [[], []])
        self.assertEqual(quality.report['intervalCountByEye'], [10, 10])
        self.assertEqual(quality.report['intervalsDroppedByEye'], [10, 10])
        self.assertNotEqual(*quality.report['allFrameSequenceSHA256ByEye'])

    def test_large_frame_count_does_not_accumulate_frame_or_interval_arrays(self):
        quality = self.accumulator(limit=2)
        tracemalloc.start()
        try:
            for index in range(30000):
                for eye in (0, 1):
                    quality.add(index, eye, 65026 if index % 2 == 0 else 0, 1000)
            quality.finish(True)
            peak = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()
        self.assertLess(peak, 128 * 1024)
        self.assertEqual(quality.report['framesByEye'], [30000, 30000])
        self.assertEqual(quality.report['intervalCountByEye'], [15000, 15000])
        self.assertEqual(quality.report['intervalsDroppedByEye'], [14998, 14998])
        self.assertEqual([len(rows) for rows in quality.report['intervalsByEye']], [2, 2])

    def test_incomplete_or_unpaired_scan_never_claims_frame_acceptance(self):
        quality = self.accumulator(profile='aggregate-30-frame-30')
        quality.add(0, 0, 0, 1000)
        quality.finish(True)
        self.assertFalse(quality.report['completeScan'])
        self.assertEqual(quality.report['verdict'], 'INCOMPLETE')
        self.assertEqual(quality.report['minimumPSNRdBByEye'], [None, None])
        with self.assertRaisesRegex(ValueError, 'order must increase'):
            quality.add(0, 0, 1, 1000)


class StreamingMechanics(unittest.TestCase):
    def test_many_probe_records_do_not_accumulate_an_xml_tree(self):
        class Lines:
            def __init__(self):
                self.count = 0

            def readline(self, _limit):
                self.count += 1
                if self.count == 1:
                    return b'<ffprobe><frames>\n'
                if self.count <= 100001:
                    return b'<frame best_effort_timestamp_time="0"/>\n'
                if self.count == 100002:
                    return b'</frames></ffprobe>\n'
                return b''

        stats = {'count': 0, 'endReached': False}
        tracemalloc.start()
        try:
            count = sum(1 for _ in oracle.iter_xml_records(Lines(), 'frame', lambda: None, stats))
            peak = tracemalloc.get_traced_memory()[1]
        finally:
            tracemalloc.stop()
        self.assertEqual(count, 100000)
        self.assertEqual(stats['count'], count)
        self.assertTrue(stats['endReached'])
        self.assertLess(peak, 2 * 1024 * 1024)

    def test_probe_parser_rejects_missing_xml_terminator(self):
        stream = io.BytesIO(b'<ffprobe><frames><frame best_effort_timestamp_time="0"/>')
        stats = {'count': 0, 'endReached': False}
        with self.assertRaises(Exception):
            list(oracle.iter_xml_records(stream, 'frame', lambda: None, stats))
        self.assertEqual(stats['count'], 1)
        self.assertFalse(stats['endReached'])

    def test_probe_parser_rejects_oversize_record(self):
        stream = io.BytesIO(b'<ffprobe><frames><frame x="' + b'a' * (oracle.RECORD_BYTES + 1))
        with self.assertRaises(ValueError):
            list(oracle.iter_xml_records(stream, 'frame', lambda: None, {'count': 0, 'endReached': False}))

    def test_partial_pipe_reads_preserve_pcm_and_rgb_framing(self):
        class ShortReads(io.BytesIO):
            def readinto(self, view):
                return super().readinto(view[:3])

        class Clock:
            def check(self):
                pass

        stream = ShortReads(b'123456789abc')
        self.assertEqual(oracle.read_chunk(stream, 10, Clock()), b'123456789a')
        self.assertEqual(oracle.read_chunk(stream, 10, Clock()), b'bc')

    def test_error_stderr_is_failure_even_with_exit_zero(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = oracle.Runtime(Path(directory), 10)
            try:
                proc = runtime.start('decoder', [sys.executable, '-c',
                                                "import sys;sys.stderr.write('invalid packet')"])
                self.assertEqual(proc.stdout.read(), b'')
                with self.assertRaises(ValueError):
                    runtime.finish(proc, 'decoder')
            finally:
                runtime.close()

    def test_deadline_unblocks_a_stalled_pipe_and_reaps_process(self):
        with tempfile.TemporaryDirectory() as directory:
            runtime = oracle.Runtime(Path(directory), .05)
            proc = runtime.start('stalled', [sys.executable, '-c', 'import time;time.sleep(60)'])
            try:
                with self.assertRaises(TimeoutError):
                    oracle.read_chunk(proc.stdout, 1, runtime)
            finally:
                runtime.close()
            self.assertIsNotNone(proc.poll())


if __name__ == '__main__':
    unittest.main()
