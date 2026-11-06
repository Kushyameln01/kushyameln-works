#!/usr/bin/env python3
"""Keep original assertions; replace checkout claims with fixed remote Git-tree binding."""
import difflib, hashlib, json, os, pathlib
out=pathlib.Path(os.environ.get('TEXT_RECEIPT_DIR','/tmp/text-packet-receipt-20261102'))
original=out/'source/tools/inference/text-encoder/inspect_conditioning_handoff.mjs'
target=original.with_name('inspect_received_conditioning_handoff.mjs')
text=original.read_text()
original_hash=hashlib.sha256(original.read_bytes()).hexdigest()
edits=[
 ("import {execFileSync} from 'node:child_process';\n", ""),
 ("const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();", "const acquisitionRoot=resolve(root,'..');\nconst remoteTree=JSON.parse(readFileSync(resolve(acquisitionRoot,'remote-tree.json'),'utf8'));\nconst acquisition=JSON.parse(readFileSync(resolve(acquisitionRoot,'acquisition.json'),'utf8'));\nconst remoteBlobs=new Map(remoteTree.tree.filter(e=>e.type==='blob').map(e=>[e.path,e]));\nassert.equal(remoteTree.truncated,false);\nassert.equal(acquisition.distributionCommit,'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48');\nassert.equal(remoteTree.sha,acquisition.remoteTreeSha);"),
 ("assert.equal(blob,git('rev-parse','--verify',`HEAD:${path}`),`Untracked/changed HEAD bytes: ${path}`);", "assert.equal(blob,remoteBlobs.get(path)?.sha,`Changed immutable remote Git blob: ${path}`);\n assert.equal(b.length,remoteBlobs.get(path)?.size,`Remote Git size: ${path}`);"),
 ("result.actualCheckoutSha=git('rev-parse','--verify','HEAD');assert.match(result.actualCheckoutSha,/^[a-f0-9]{40}$/);", "result.acquiredDistributionCommit=acquisition.distributionCommit;\n result.remoteTreeSha=remoteTree.sha;result.gitCheckoutCreated=false;result.actualCheckoutSha=null;\n result.gitBindingMethod='Immutable GitHub commit/tree plus actual raw bytes; no checkout claimed';\n result.derivedFrom={path:'tools/inference/text-encoder/inspect_conditioning_handoff.mjs',distributionCommit:acquisition.distributionCommit,sha256:'"+original_hash+"',modification:'Only Git checkout/HEAD reads replaced with pre-acquired immutable remote tree/blob checks; all packet/receipt assertions retained'};"),
 ("headGitBlob:blob", "remoteGitBlob:blob"),
 ("headGitBlobMatched:true", "remoteGitBlobMatched:true")
]
for old,new in edits:
    assert text.count(old)==1, old
    text=text.replace(old,new)
target.write_text(text)
(out/'received-inspector.patch').write_text(''.join(difflib.unified_diff(original.read_text().splitlines(True),text.splitlines(True),fromfile=str(original),tofile=str(target))))
(out/'received-inspector-derivation.json').write_text(json.dumps({'originalPath':str(original),'originalSha256':original_hash,'derivedPath':str(target),'derivedSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'reason':'Keep shared Git database unchanged and avoid creating a full huge checkout; verify actual bytes against immutable remote Git tree blobs. No actualCheckoutSha claim.','changes':'Only source Git binding and report labels changed. Model, numerical oracle, projection and reexport absent. All existing packet/receipt semantic assertions retained.'},indent=2)+'\n')
print(json.dumps({'derivedPath':str(target),'derivedSha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
