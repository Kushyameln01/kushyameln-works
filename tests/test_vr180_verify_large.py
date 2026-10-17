"""Independent oracle regression tests; only the existing two-second media is used."""
import importlib.util
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
