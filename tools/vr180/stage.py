"""Copy only the VR180 candidate and its unchanged pinned dependency to Sites staging."""
import hashlib, json, pathlib, shutil, sys
ROOT=pathlib.Path(__file__).resolve().parents[2]
DEST=pathlib.Path(sys.argv[1]).resolve()
if DEST != pathlib.Path('/workspace/sites/kushyameln-vr180-staging/dist'):
    raise SystemExit('Unexpected staging directory')
DEST.mkdir(parents=True,exist_ok=True)
for relative in ['vr180-studio','shared/vr180','shared/media-basic/vendor']:
    shutil.copytree(ROOT/'docs'/relative,DEST/relative,dirs_exist_ok=True)
(DEST/'index.html').write_text('<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./vr180-studio/"><title>VR180 Studio</title><a href="./vr180-studio/">VR180 Studioを開く</a></html>')
files={str(p.relative_to(DEST)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(DEST.rglob('*')) if p.is_file()}
evidence=ROOT/'development/vr180/evidence';evidence.mkdir(parents=True,exist_ok=True)
(evidence/'staging-files.json').write_text(json.dumps(files,indent=2)+'\n')
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file())}))
