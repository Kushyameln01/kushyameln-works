"""Resolution/duration probes, not representative camera footage or entropy."""
import hashlib, json, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parents[2]
dest = root / 'docs/vr180-studio/fixtures'
source = dest / 'stereo180-sbs.mp4'
records = []
for seconds in (2, 12):
    target = dest / f'stereo180-4k-{seconds}s-sbs.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                    '-stream_loop', '-1', '-i', str(source), '-t', str(seconds),
                    '-vf', 'scale=4096:2048:flags=neighbor', '-c:v', 'libx264',
                    '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(target)], check=True)
    records.append({'name': target.name, 'duration': seconds, 'width': 4096, 'height': 2048,
                    'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()})
(dest / 'scale-manifest.json').write_text(json.dumps({'source': 'enlarged repeated synthetic stereo180-sbs; not real camera complexity', 'files': records}, indent=2) + '\n')
print(json.dumps(records, indent=2))
