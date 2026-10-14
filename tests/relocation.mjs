import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const record=JSON.parse(await readFile(join(root,'security/relocation.json')));
const tmp=await mkdtemp(join(tmpdir(),'pages-equivalence-'));
const hash=x=>createHash('sha256').update(x).digest('hex');
try {
  for(const f of record.files){
    const old=execFileSync('git',['show',`${record.baseline}:${f.old}`],{cwd:root,maxBuffer:8*1024*1024});
    const current=await readFile(join(root,f.new));
    assert.equal(hash(old),f.sha256);assert.deepEqual(current,old);
    const target=join(tmp,f.old);await mkdir(dirname(target),{recursive:true});await writeFile(target,old);
  }
  const names=execFileSync('git',['ls-tree','-r','--name-only',record.baseline,'docs/animator-composer'],{cwd:root}).toString().trim().split('\n');
  for(const name of names.filter(x=>x.endsWith('.mjs'))){
    const old=execFileSync('git',['show',`${record.baseline}:${name}`],{cwd:root}).toString();
    assert.equal(await readFile(join(root,name),'utf8'),old.replaceAll('ft-workbench/lib/','shared/ft/'));
    await mkdir(dirname(join(tmp,name)),{recursive:true});await writeFile(join(tmp,name),old);
  }
  const old=await import(pathToFileURL(join(tmp,'docs/ft-workbench/lib/unity-package.mjs')));
  const now=await import(pathToFileURL(join(root,'docs/shared/ft/unity-package.mjs')));
  const guid='1234567890abcdef1234567890abcdef';
  const assets=[{guid,path:'Assets/SecurityFixture.asset',meta:`fileFormatVersion: 2\nguid: ${guid}\n`,asset:new TextEncoder().encode('%YAML 1.1\n--- !u!114 &1\nMonoBehaviour:\n  m_Name: SECURITY_SYNTHETIC\n')}];
  const a=old.writeUnityPackage(assets),b=now.writeUnityPackage(assets);
  assert.deepEqual(a,b);assert.deepEqual(old.readUnityPackage(a),now.readUnityPackage(b));
  // mtime is explicitly zero in this archive writer: no nondeterminism allowed.
  const ko=await import(pathToFileURL(join(tmp,'docs/ft-workbench/lib/kernel/load-kernel.mjs')));
  const kn=await import(pathToFileURL(join(root,'docs/shared/ft/kernel/load-kernel.mjs')));
  const wasm=await readFile(join(root,'docs/shared/ft/kernel/ft-kernel.wasm'));
  const x=await ko.instantiateFtKernel(wasm),y=await kn.instantiateFtKernel(wasm);
  for(const n of [0.5,1,1.1])assert.deepEqual(x.anchors(n),y.anchors(n));
  assert.throws(()=>x.anchors(0),RangeError);assert.throws(()=>y.anchors(0),RangeError);
  assert.equal(x.animatorHash('SECURITY_SYNTHETIC'),y.animatorHash('SECURITY_SYNTHETIC'));
  const go=await import(pathToFileURL(join(tmp,'docs/animator-composer/lib/generate.mjs')));
  const gn=await import(pathToFileURL(join(root,'docs/animator-composer/lib/generate.mjs')));
  assert.deepEqual(go.inspect([]),gn.inspect([]));assert.deepEqual(go.checkPlan({},[]),gn.checkPlan({},[]));
  console.log('PASS: seven shared files byte-identical, all Composer JS differs only by relocation; package round-trip/kernel/catalog equivalent');
} finally {await rm(tmp,{recursive:true,force:true});}
