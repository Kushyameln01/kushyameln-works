"""Independent oracle for saved synthetic Route B output (FFmpeg, not production JS).

Usage: python tools/vr180/verify-conversion.py INPUT OUTPUT --layout tb --fov 360 --eye-size 256
Thresholds fixed before browser conversion: exact frame count/order, PTS <= 1 ms,
RGB PSNR >= 30 dB per eye, red event frame indices identical, decoded audio identical.
These are synthetic regression criteria, not general VR comfort/visual quality criteria.
"""
import argparse, hashlib, json, math, pathlib, subprocess
import numpy as np

p = argparse.ArgumentParser()
p.add_argument('input', type=pathlib.Path); p.add_argument('output', type=pathlib.Path)
p.add_argument('--layout', choices=['sbs', 'tb'], required=True)
p.add_argument('--fov', type=int, choices=[180, 360], required=True)
p.add_argument('--eye-size', type=int, required=True)
p.add_argument('--report', type=pathlib.Path)
a = p.parse_args()
def run(args): return subprocess.check_output(args)
def probe(path):
    return json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_frames',
                           '-of', 'json', str(path)]))
src, dst = probe(a.input), probe(a.output)
sv = next(s for s in src['streams'] if s['codec_type'] == 'video')
dv = next(s for s in dst['streams'] if s['codec_type'] == 'video')
ew = sv['width'] // (2 if a.layout == 'sbs' else 1)
eh = sv['height'] // (2 if a.layout == 'tb' else 1)
cw = ew // (2 if a.fov == 360 else 1); cx = (ew - cw) // 2
n = a.eye_size
if n > 512 or len([f for f in src['frames'] if f['media_type'] == 'video']) > 120:
    raise SystemExit('This pixel oracle is bounded to <=512px per eye and <=120 frames; scale tests use separate metrics.')
parts = []
for eye in (0, 1):
    x = cx + (ew * eye if a.layout == 'sbs' else 0)
    y = eh * eye if a.layout == 'tb' else 0
    parts.append(f'[v{eye}]crop={cw}:{eh}:{x}:{y},scale={n}:{n}:flags=bilinear[e{eye}]')
filt = '[0:v]split=2[v0][v1];' + ';'.join(parts) + ';[e0][e1]hstack=inputs=2[out]'
expected_bytes = run(['ffmpeg', '-v', 'error', '-i', str(a.input), '-filter_complex', filt,
                      '-map', '[out]', '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
actual_bytes = run(['ffmpeg', '-v', 'error', '-i', str(a.output), '-map', '0:v:0',
                    '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'])
assert (dv['width'], dv['height']) == (2*n, n), 'wrong output dimensions'
assert len(expected_bytes) == len(actual_bytes), 'frame count or size changed'
expected = np.frombuffer(expected_bytes, np.uint8).reshape(-1, n, 2*n, 3)
actual = np.frombuffer(actual_bytes, np.uint8).reshape(expected.shape)
psnr = []
for eye in (0, 1):
    diff = expected[:, :, eye*n:(eye+1)*n].astype(float) - actual[:, :, eye*n:(eye+1)*n].astype(float)
    mse = np.mean(diff*diff); psnr.append(99 if mse == 0 else 10*math.log10(255*255/mse))
assert min(psnr) >= 30, f'per-eye PSNR below preset threshold: {psnr}'
def events(frames):
    # Red event occupies center x and y=100..130 in the independent 256px eye fixture.
    patch = frames[:, int(n*104/256):int(n*125/256), int(n*120/256):int(n*137/256)].astype(float)
    means = patch.mean(axis=(1, 2))
    return np.flatnonzero((means[:, 0] > 180) & (means[:, 1] < 90) & (means[:, 2] < 90)).tolist()
eye_events = []
for eye in (0, 1):
    reference = events(expected[:, :, eye*n:(eye+1)*n])
    observed = events(actual[:, :, eye*n:(eye+1)*n])
    assert reference == observed, f'short event timing changed in eye {eye}'
    eye_events.append(observed)
def pts(info): return [float(f['best_effort_timestamp_time']) for f in info['frames'] if f['media_type'] == 'video']
sp, dp = pts(src), pts(dst)
assert len(sp) == len(dp), 'presentation frame count changed'
max_pts_error = max(abs(x-y) for x, y in zip(sp, dp))
assert max_pts_error <= .001, f'PTS error {max_pts_error}'
audio_in = [s for s in src['streams'] if s['codec_type'] == 'audio']
audio_out = [s for s in dst['streams'] if s['codec_type'] == 'audio']
assert len(audio_in) == len(audio_out), 'audio track lost or added'
audio_equal = None
if audio_in:
    def pcm(path): return run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-f', 's16le', '-acodec', 'pcm_s16le', '-'])
    ai, ao = pcm(a.input), pcm(a.output); audio_equal = ai == ao
    assert audio_equal, 'decoded audio changed'
    assert abs(float(audio_in[0]['start_time'])-float(audio_out[0]['start_time'])) <= .001, 'audio start changed'
report = {'status': 'PASS', 'input': str(a.input), 'output': str(a.output),
          'outputSHA256': hashlib.sha256(a.output.read_bytes()).hexdigest(),
          'frames': len(sp), 'eyePSNRdB': psnr, 'maxPtsErrorSeconds': max_pts_error,
          'redFrameIndicesByEye': eye_events, 'decodedAudioIdentical': audio_equal,
          'scope': 'synthetic saved output; target VR consumer and novice usability not verified'}
if a.report: a.report.write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
