"""Receive exact Git source bytes into a temporary code-only directory, then test.

No model/LoRA payload or network request is used. Gitobjects for the three fixed
source commits must already have been fetched explicitly by the recipient.
"""
from pathlib import Path
import json,os,subprocess,tempfile
root=Path(__file__).resolve().parents[2]
declaration=json.loads((root/'docs/shared/diffusion-models/profiles/p0-bindings.json').read_text())
sources=[(declaration['referenceSet']['commit'],f['path']) for f in declaration['referenceSet']['files']]
sources += [(a['commit'],a['path']) for a in declaration['assets']]
with tempfile.TemporaryDirectory(prefix='diffusion-p0-code-') as tmp:
    received=0
    for commit,path in sorted(set(sources)):
        b=subprocess.check_output(['git','show',commit+':'+path],cwd=root)
        target=Path(tmp)/commit/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(b)
        received+=len(b)
    command=['node','--test','--test-isolation=none','tools/diffusion-models/test-p0-bindings.mjs']
    run=subprocess.run(command,cwd=root,env=dict(os.environ,P0_SOURCE_ROOT=tmp),capture_output=True,text=True)
    out=root/'development/ai-connection/profile-adoption'
    (out/'p0-tests.log').write_text(run.stdout+run.stderr)
    (out/'p0-verification.json').write_text(json.dumps(dict(passed=run.returncode==0,command=command,
        wrapper='python tools/diffusion-models/test-p0-bindings.py',scope='source integrity/sidecar contract only; no new numerical execution',
        receivedCodeBytes=received,receivedFileCount=len(set(sources)),fullModelPayloadsRead=False),indent=2)+'\n')
    print(run.stdout+run.stderr,end='')
    raise SystemExit(run.returncode)
