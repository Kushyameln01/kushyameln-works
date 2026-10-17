"""Bounded, streaming independent oracle for synthetic Route B outputs.

CLI and acceptance criteria match verify-conversion.py. The original oracle is
unchanged; this additional oracle handles up to 2048 px/eye, 400 frames, 30 s,
and 4096x2048 pixels (or the equivalent TB input). RGB frames are compared one
at a time. Its 180 s wall-clock budget covers probes, decoding and checksums.

This verifies saved synthetic pixels, PTS and audio, not browser performance,
VR player compatibility, real-camera quality or usability. FFmpeg stderr is
retained beside --report, or in a temporary directory when --report is omitted.
"""

import argparse
import hashlib
import json
import math
import pathlib
import subprocess
import tempfile
import threading
import time

import numpy as np


BOUNDS = {
    'maxEyeSize': 2048,
    'maxFramePixels': 4096 * 2048,
    'maxDimension': 4096,
    'maxFrames': 400,
    'maxDurationSeconds': 30,
    'maxFileBytes': 256 * 1024 * 1024,
    'wallTimeoutSeconds': 180,
    'maxProbeBytes': 2 * 1024 * 1024,
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


class Runtime:
    """Kill blocked FFmpeg pipes at the deadline, including on verification failure."""

    def __init__(self, directory):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.started = time.monotonic()
        self.expired = False
        self.children = []
        self.logs = {}
        self.lock = threading.Lock()
        self.timer = threading.Timer(BOUNDS['wallTimeoutSeconds'], self.expire)
        self.timer.daemon = True
        self.timer.start()

    def expire(self):
        with self.lock:
            self.expired = True
            for proc, _log in self.children:
                if proc.poll() is None:
                    proc.kill()

    def check(self):
        if self.expired or time.monotonic() - self.started >= BOUNDS['wallTimeoutSeconds']:
            raise TimeoutError('streaming verification exceeded 180 seconds')

    def start(self, label, args):
        self.check()
        log_path = self.directory / (label + '.stderr.log')
        log = log_path.open('wb')
        self.logs[label] = str(log_path)
        try:
            proc = subprocess.Popen(args, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=log, bufsize=0)
        except BaseException:
            log.close()
            raise
        with self.lock:
            self.children.append((proc, log))
            if self.expired:
                proc.kill()
        self.check()
        return proc

    def finish(self, proc, label):
        self.check()
        remaining = max(.001, BOUNDS['wallTimeoutSeconds'] - (time.monotonic() - self.started))
        code = proc.wait(timeout=remaining)
        self.check()
        require(code == 0, f'{label} exited with {code}; see {self.logs[label]}')

    def close(self):
        self.timer.cancel()
        with self.lock:
            for proc, _log in self.children:
                if proc.poll() is None:
                    proc.kill()
        for proc, log in self.children:
            try:
                proc.wait(timeout=5)
            finally:
                if proc.stdout:
                    proc.stdout.close()
                log.close()


def read_chunk(stream, size, runtime):
    """Read up to size bytes, allowing short OS pipe reads without losing framing."""
    data = bytearray(size)
    view = memoryview(data)
    offset = 0
    while offset < size:
        runtime.check()
        count = stream.readinto(view[offset:])
        if not count:
            break
        offset += count
    runtime.check()
    view.release()
    if offset != size:
        del data[offset:]
    return data


def probe(path, label, runtime):
    proc = runtime.start(label, [
        'ffprobe', '-v', 'error', '-show_streams', '-show_frames', '-show_format',
        '-show_entries',
        'stream=codec_type,width,height,start_time,duration:'
        'frame=media_type,best_effort_timestamp_time:format=duration',
        '-of', 'json', str(path),
    ])
    raw = read_chunk(proc.stdout, BOUNDS['maxProbeBytes'] + 1, runtime)
    require(len(raw) <= BOUNDS['maxProbeBytes'], f'{label}: probe output exceeds bounded metadata size')
    runtime.finish(proc, label)
    return json.loads(raw)


def inspect_video(info, label):
    videos = [s for s in info['streams'] if s['codec_type'] == 'video']
    require(len(videos) == 1, f'{label}: expected one video track')
    video = videos[0]
    width, height = video['width'], video['height']
    require(0 < width <= BOUNDS['maxDimension'] and 0 < height <= BOUNDS['maxDimension']
            and width * height <= BOUNDS['maxFramePixels'], f'{label}: dimensions exceed oracle bounds')
    frames = [f for f in info.get('frames', []) if f['media_type'] == 'video']
    require(0 < len(frames) <= BOUNDS['maxFrames'], f'{label}: frame count exceeds oracle bounds or is zero')
    times = [float(f['best_effort_timestamp_time']) for f in frames]
    require(all(math.isfinite(t) for t in times), f'{label}: non-finite PTS')
    duration = float(info.get('format', {}).get('duration', video.get('duration', 'nan')))
    require(math.isfinite(duration) and 0 < duration <= BOUNDS['maxDurationSeconds'] + .001,
            f'{label}: duration is absent, invalid or exceeds 30 seconds')
    require(max(times) - min(times) <= BOUNDS['maxDurationSeconds'], f'{label}: PTS span exceeds 30 seconds')
    return video, times


def red_event(eye, n):
    patch = eye[int(n * 104 / 256):int(n * 125 / 256), int(n * 120 / 256):int(n * 137 / 256)]
    means = patch.mean(axis=(0, 1))
    return bool(means[0] > 180 and means[1] < 90 and means[2] < 90)


def sha256_file(path, runtime):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            runtime.check()
            digest.update(chunk)
    return digest.hexdigest()


def verify(a, runtime, report):
    n = a.eye_size
    require(16 <= n <= BOUNDS['maxEyeSize'], 'eye size must be 16..2048 pixels')
    for path in (a.input, a.output):
        require(path.is_file() and 0 < path.stat().st_size <= BOUNDS['maxFileBytes'],
                f'{path}: file missing, empty or above 256 MiB')
    src = probe(a.input, 'input-probe', runtime)
    dst = probe(a.output, 'output-probe', runtime)
    sv, sp = inspect_video(src, 'input')
    dv, dp = inspect_video(dst, 'output')
    require((dv['width'], dv['height']) == (2 * n, n), 'wrong output dimensions')
    require(len(sp) == len(dp), 'presentation frame count changed')
    pts_error = max(abs(x - y) for x, y in zip(sp, dp))
    report.update(frames=len(sp), maxPtsErrorSeconds=pts_error)
    require(pts_error <= .001, f'PTS error {pts_error}')
    require(sv['width'] % (2 if a.layout == 'sbs' else 1) == 0
            and sv['height'] % (2 if a.layout == 'tb' else 1) == 0, 'input packed eye dimensions are fractional')
    ew = sv['width'] // (2 if a.layout == 'sbs' else 1)
    eh = sv['height'] // (2 if a.layout == 'tb' else 1)
    cw = ew // (2 if a.fov == 360 else 1)
    cx = (ew - cw) // 2
    parts = []
    for eye in (0, 1):
        x = cx + (ew * eye if a.layout == 'sbs' else 0)
        y = eh * eye if a.layout == 'tb' else 0
        parts.append(f'[v{eye}]crop={cw}:{eh}:{x}:{y},scale={n}:{n}:flags=bilinear[e{eye}]')
    filt = '[0:v]split=2[v0][v1];' + ';'.join(parts) + ';[e0][e1]hstack=inputs=2[out]'
    expected = runtime.start('expected-rgb', [
        'ffmpeg', '-v', 'error', '-i', str(a.input), '-filter_complex', filt,
        '-map', '[out]', '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
    ])
    actual = runtime.start('actual-rgb', [
        'ffmpeg', '-v', 'error', '-i', str(a.output), '-map', '0:v:0',
        '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-',
    ])
    frame_bytes = n * 2 * n * 3
    sums = [0, 0]
    reference_events, observed_events = [[], []], [[], []]
    for index in range(len(sp)):
        eb = read_chunk(expected.stdout, frame_bytes, runtime)
        ab = read_chunk(actual.stdout, frame_bytes, runtime)
        require(len(eb) == len(ab) == frame_bytes, f'frame count or size changed at frame {index}')
        ef = np.frombuffer(eb, np.uint8).reshape(n, 2 * n, 3)
        af = np.frombuffer(ab, np.uint8).reshape(n, 2 * n, 3)
        for eye in (0, 1):
            e = ef[:, eye * n:(eye + 1) * n]
            o = af[:, eye * n:(eye + 1) * n]
            diff = np.subtract(e, o, dtype=np.int16)
            # int64 accumulation avoids overflow without a full float64 movie.
            sums[eye] += int(np.einsum('ijk,ijk->', diff, diff, dtype=np.int64, optimize=False))
            if red_event(e, n):
                reference_events[eye].append(index)
            if red_event(o, n):
                observed_events[eye].append(index)
        report['decodedFramesCompared'] = index + 1
        del ef, af, e, o, diff, eb, ab
    require(not expected.stdout.read(1) and not actual.stdout.read(1), 'decoded frame count exceeds probed frame count')
    runtime.finish(expected, 'expected-rgb')
    runtime.finish(actual, 'actual-rgb')
    psnr = []
    for total in sums:
        mse = total / (len(sp) * n * n * 3)
        psnr.append(99 if mse == 0 else 10 * math.log10(255 * 255 / mse))
    report.update(eyePSNRdB=psnr, redFrameIndicesByEye=observed_events)
    require(min(psnr) >= 30, f'per-eye PSNR below preset threshold: {psnr}')
    require(reference_events == observed_events, 'short event timing changed')

    audio_in = [s for s in src['streams'] if s['codec_type'] == 'audio']
    audio_out = [s for s in dst['streams'] if s['codec_type'] == 'audio']
    require(len(audio_in) == len(audio_out), 'audio track lost or added')
    require(len(audio_in) <= 1, 'oracle supports at most one audio track')
    report['decodedAudioIdentical'] = None
    if audio_in:
        streams = []
        for label, path in (('input-pcm', a.input), ('output-pcm', a.output)):
            streams.append(runtime.start(label, [
                'ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0',
                '-f', 's16le', '-acodec', 'pcm_s16le', '-',
            ]))
        while True:
            ai = read_chunk(streams[0].stdout, 65536, runtime)
            ao = read_chunk(streams[1].stdout, 65536, runtime)
            require(ai == ao, 'decoded audio changed')
            if not ai:
                break
        runtime.finish(streams[0], 'input-pcm')
        runtime.finish(streams[1], 'output-pcm')
        report['decodedAudioIdentical'] = True
        start_error = abs(float(audio_in[0]['start_time']) - float(audio_out[0]['start_time']))
        require(math.isfinite(start_error) and start_error <= .001, 'audio start changed')
    report['outputSHA256'] = sha256_file(a.output, runtime)
    report['status'] = 'PASS'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    parser.add_argument('--layout', choices=['sbs', 'tb'], required=True)
    parser.add_argument('--fov', type=int, choices=[180, 360], required=True)
    parser.add_argument('--eye-size', type=int, required=True)
    parser.add_argument('--report', type=pathlib.Path)
    a = parser.parse_args()
    if a.report:
        log_dir = a.report.parent / (a.report.stem + '-stderr')
    else:
        log_dir = pathlib.Path(tempfile.mkdtemp(prefix='vr180-streaming-verifier-'))
    runtime = Runtime(log_dir)
    report = {
        'status': 'FAIL', 'input': str(a.input), 'output': str(a.output),
        'oracle': 'verify-conversion-streaming.py', 'bounds': BOUNDS,
        'scope': 'synthetic saved output; target VR consumer and novice usability not verified',
    }
    try:
        verify(a, runtime, report)
    except Exception as exc:
        report['error'] = f'{type(exc).__name__}: {exc}'
    finally:
        runtime.close()
        report['stderrLogs'] = runtime.logs
        report['elapsedSeconds'] = round(time.monotonic() - runtime.started, 3)
        encoded = json.dumps(report, indent=2) + '\n'
        if a.report:
            a.report.write_text(encoded)
        print(encoded, end='')
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
