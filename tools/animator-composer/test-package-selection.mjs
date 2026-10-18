// Public synthetic fixtures only. Optional argv[2] is a private local package;
// it is read in place and its bytes are never written into test artifacts.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {gzipSync,gunzipSync} from '../../docs/shared/ft/vendor/fflate.mjs';
import {writeUnityPackage,readUnityPackage} from '../../docs/shared/ft/unity-package.mjs';
import {scanUnityPackage,selectUnityPackage,PACKAGE_LIMITS} from '../../docs/animator-composer/lib/package-selection.mjs';
import {digest} from '../../docs/animator-composer/lib/generate.mjs';
import {serializeExpression} from '../../docs/animator-composer/lib/registration.mjs';
import {workerHarness,inputFile} from './harness-worker.mjs';
import {generationFixture} from './test-generation.mjs';
import {asset,GUIDS,clip} from './fixture-composition.mjs';
const enc=new TextEncoder(),dec=new TextDecoder();let passed=0;
async function test(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
const fixture=generationFixture(),source=fixture.packages[0].assets;
source.push(asset(GUIDS.image,'Assets/Picture.PNG','image bytes','2800000'));
const folderGuid='99999999999999999999999999999999';
source.push({guid:folderGuid,path:'Assets/Folder',asset:null,meta:`fileFormatVersion: 2\nguid: ${folderGuid}\nfolderAsset: yes\n`});
source.push(asset('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Assets/Notes.txt','not a setting'));
const bytes=writeUnityPackage(source),original=bytes.slice(),tar=gunzipSync(bytes);
function checksum(t,offset){t.fill(32,offset+148,offset+156);const sum=t.subarray(offset,offset+512).reduce((s,n)=>s+n,0);t.set(enc.encode(sum.toString(8).padStart(6,'0')+'\0 '),offset+148);}
function octal(t,offset,size,value){t.set(enc.encode(value.toString(8).padStart(size-1,'0')+'\0'),offset);}
function memberList(t){const entries=[];for(let offset=0;offset<t.length&&!t.subarray(offset,offset+512).every(x=>!x);){const header=t.subarray(offset,offset+512),name=dec.decode(header.subarray(0,100)).split('\0')[0],size=Number.parseInt(dec.decode(header.subarray(124,136)),8);entries.push({offset,name,size,start:offset+512});offset+=512+Math.ceil(size/512)*512;}return entries;}
const members=memberList(tar),find=child=>members.find(m=>m.name===GUIDS.base+'/'+child);
function corrupt(mutator){const t=tar.slice();mutator(t);return gzipSync(t,{mtime:0});}
function rejectBoth(b,re){assert.throws(()=>scanUnityPackage(b),re);assert.throws(()=>selectUnityPackage(b,[GUIDS.base]),re);assert.throws(()=>readUnityPackage(b),re);}
function replacePath(t,guid,path){const m=members.find(m=>m.name===guid+'/pathname'),value=enc.encode(path);assert(value.length<512);t.fill(0,m.start,m.start+512);t.set(value,m.start);octal(t,m.offset+124,12,value.length);checksum(t,m.offset);}

await test('scan owns only metadata; second pass owns only selected setting bodies',()=>{
  const scan=scanUnityPackage(bytes);assert.equal(scan.expandedBytes,tar.length);assert.equal(scan.assets.length,source.length);
  for(const a of scan.assets){assert(!('asset' in a));assert(!Object.values(a).some(v=>v instanceof Uint8Array));}
  assert.equal(scan.assets.find(a=>a.guid===GUIDS.image).referenceOnly,true);
  assert.equal(scan.assets.find(a=>a.guid===GUIDS.image).extension,'.png');
  assert.equal(scan.assets.find(a=>a.guid===folderGuid).selectable,false);
  assert.equal(scan.assets.find(a=>a.path.endsWith('.txt')).referenceOnly,false);
  const chosen=selectUnityPackage(bytes,[GUIDS.base,GUIDS.clip]);assert.equal(chosen.assets.length,2);
  for(const a of chosen.assets){const before=source.find(s=>s.guid===a.guid);assert.deepEqual(a.asset,before.asset);assert.equal(a.meta,before.meta);}
  assert(!chosen.inventory.some(a=>'asset' in a));assert(!chosen.assets.some(a=>a.guid===GUIDS.image));
  assert.equal(chosen.selectedBytes,chosen.assets.reduce((sum,a)=>sum+a.asset.length+enc.encode(a.meta).length,0));
  assert.deepEqual(bytes,original,'Original compressed bytes are unchanged');
  const preview=new Uint8Array(2*1024*1024),withPreview=new Uint8Array(tar.length+512+preview.length),offset=tar.length-1024;
  withPreview.set(tar.subarray(0,offset));withPreview.set(tar.subarray(find('asset').offset,find('asset').offset+512),offset);
  withPreview.fill(0,offset,offset+100);withPreview.set(enc.encode(GUIDS.base+'/preview.png'),offset);octal(withPreview,offset+124,12,preview.length);checksum(withPreview,offset);
  withPreview.fill(255,offset+512,offset+512+preview.length);
  const packedPreview=gzipSync(withPreview);assert.deepEqual(scanUnityPackage(packedPreview).assets,scan.assets);
  assert.deepEqual(selectUnityPackage(packedPreview,[GUIDS.base]).assets,chosen.assets.filter(a=>a.guid===GUIDS.base));
});
await test('selection rejects duplicates, absent GUIDs, non-settings and source-byte budget',()=>{
  assert.throws(()=>selectUnityPackage(bytes,[GUIDS.base,GUIDS.base]),/unique/);
  assert.throws(()=>selectUnityPackage(bytes,['b'.repeat(32)]),/absent/);
  assert.throws(()=>selectUnityPackage(bytes,[GUIDS.image]),/not selectable/);
  assert.throws(()=>selectUnityPackage(bytes,[GUIDS.base],{maxSelectedBytes:10}),/budget/);
});
await test('gzip header, CRC, ISIZE, truncated stream and concatenated member are rejected',()=>{
  const header=bytes.slice();header[3]|=128;rejectBoth(header,/gzip header/);
  const crc=bytes.slice();crc[crc.length-8]^=1;rejectBoth(crc,/checksum/);
  const size=bytes.slice();size[size.length-4]^=1;rejectBoth(size,/size mismatch/);
  assert.throws(()=>scanUnityPackage(bytes.subarray(0,bytes.length-12)));
  const extra=gzipSync(new Uint8Array(1024)),joined=new Uint8Array(bytes.length+extra.length);joined.set(bytes);joined.set(extra,bytes.length);rejectBoth(joined,/multiple gzip/);
  const tooLarge=bytes.slice();new DataView(tooLarge.buffer).setUint32(tooLarge.length-4,PACKAGE_LIMITS.expanded+1,true);assert.throws(()=>scanUnityPackage(tooLarge),/1 GiB/);
});
await test('tar checksums, numeric headers, unsafe members, links and special types are rejected',()=>{
  rejectBoth(corrupt(t=>t[0]^=1),/checksum/);
  rejectBoth(corrupt(t=>{t[100]=56;checksum(t,0);}),/tar mode/);
  rejectBoth(corrupt(t=>{t[0]=46;checksum(t,0);}),/member path/);
  rejectBoth(corrupt(t=>{t[157]=120;checksum(t,0);}),/links/);
  rejectBoth(corrupt(t=>{t[156]=50;checksum(t,0);}),/special/);
  rejectBoth(corrupt(t=>{t[257]=0;checksum(t,0);}),/format/);
  rejectBoth(corrupt(t=>{t.set(enc.encode('ustar\0'+'00'),257);t[345]=120;checksum(t,0);}),/prefix/);
});
await test('padding, end markers, duplicate members and incomplete directories are rejected',()=>{
  const body=find('asset');rejectBoth(corrupt(t=>t[body.start+body.size]=1),/padding/);
  rejectBoth(corrupt(t=>t[t.length-1]=1),/end marker/);
  rejectBoth(gzipSync(tar.subarray(0,tar.length-512)),/end marker/);
  rejectBoth(gzipSync(tar.subarray(0,tar.length-1024)),/end marker/);
  const duplicate=new Uint8Array(tar.length+512);duplicate.set(tar.subarray(0,512));duplicate.set(tar,512);rejectBoth(gzipSync(duplicate),/duplicate/);
  rejectBoth(gzipSync(tar.subarray(512)),/incomplete/);
});
await test('pathname/meta UTF-8, GUID agreement and folder asset semantics are enforced',()=>{
  rejectBoth(corrupt(t=>t[find('pathname').start]=255),/UTF-8/);
  rejectBoth(corrupt(t=>t[find('asset.meta').start]=255),/UTF-8/);
  rejectBoth(corrupt(t=>{const m=find('pathname');t[m.start]=47;}),/safe path/);
  rejectBoth(corrupt(t=>{const m=find('asset.meta'),text=dec.decode(t.subarray(m.start,m.start+m.size)),i=text.indexOf(GUIDS.base);t[m.start+i]=50;}),/GUID mismatch/);
  const folder=members.find(m=>m.name===folderGuid+'/asset.meta');
  rejectBoth(corrupt(t=>{const i=dec.decode(t.subarray(folder.start,folder.start+folder.size)).indexOf('yes');t.set(enc.encode('no '),folder.start+i);}),/missing/);
  rejectBoth(corrupt(t=>replacePath(t,GUIDS.add,'Assets/Base.controller')),/duplicate asset path/);
  rejectBoth(corrupt(t=>{replacePath(t,GUIDS.base,'Assets/Parent.controller');replacePath(t,GUIDS.add,'Assets/Parent.controller/Child.controller');}),/non-folder parent/);
  rejectBoth(corrupt(t=>replacePath(t,GUIDS.base,'Assets/../Escape.controller')),/unsafe asset path/);
});
await test('member size guards run before allocation or waiting for a declared body',()=>{
  assert.throws(()=>scanUnityPackage(corrupt(t=>{const m=find('asset.meta');octal(t,m.offset+124,12,PACKAGE_LIMITS.meta+1);checksum(t,m.offset);})),/metadata member limit/);
  assert.throws(()=>scanUnityPackage(corrupt(t=>{const m=find('pathname');octal(t,m.offset+124,12,PACKAGE_LIMITS.pathname+1);checksum(t,m.offset);})),/metadata member limit/);
  const huge=corrupt(t=>{const m=find('asset');octal(t,m.offset+124,12,PACKAGE_LIMITS.asset+1);checksum(t,m.offset);});
  assert.throws(()=>selectUnityPackage(huge,[GUIDS.base]),/selected asset exceeds 128 MiB/);
});
await test('aggregate metadata, member count and compressed input limits are bounded',()=>{
  assert.throws(()=>scanUnityPackage(new Uint8Array(PACKAGE_LIMITS.compressed+1)),/compressed data exceeds 128 MiB/);
  assert.throws(()=>scanUnityPackage(bytes,{maxMetadataBytes:10}),/remaining multi-package budget/);
  const count=PACKAGE_LIMITS.members+1,dirs=new Uint8Array((count+2)*512);
  for(let i=0;i<count;i++){
    const offset=i*512;dirs.set(tar.subarray(0,512),offset);dirs.set(enc.encode((i+1).toString(16).padStart(32,'0')+'/'),offset);checksum(dirs,offset);
  }
  assert.throws(()=>scanUnityPackage(gzipSync(dirs,{level:1,mtime:0})),/member count exceeds 50000/);
  const size=PACKAGE_LIMITS.meta,large=new Uint8Array(8*(512+size)+512+1024);
  for(let i=0;i<9;i++){
    const offset=i*(512+size);large.set(tar.subarray(find('asset.meta').offset,find('asset.meta').offset+512),offset);
    large.set(enc.encode((i+1).toString(16).padStart(32,'0')+'/asset.meta'),offset);octal(large,offset+124,12,i===8?1:size);checksum(large,offset);
  }
  assert.throws(()=>scanUnityPackage(gzipSync(large,{level:1,mtime:0})),/metadata exceeds 32 MiB/);
});
await test('Worker stops aggregate scan metadata at 64 MiB and commits no partial inventory',async()=>{
  const entries=Array.from({length:6},(_,i)=>{
    const guid=(i+1).toString(16).padStart(32,'0'),prefix=`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\n# `;
    return {guid,path:`Assets/Folder${i}`,asset:null,meta:prefix+'x'.repeat(PACKAGE_LIMITS.meta-prefix.length)};
  });
  const packed=writeUnityPackage(entries),files=[1,2,3].map(i=>{const copy=packed.slice();copy[4]=i;return new File([copy],`metadata-${i}.unitypackage`);});
  const h=await workerHarness(),result=(await h.request({type:'scan',files})).message;
  assert.equal(result.type,'error');assert.match(result.message,/metadata合計が64 MiB/);
  assert.equal((await h.request({type:'catalog'})).message.type,'error');
});

await test('production Worker scan → select → analyze → generate preserves inputs and validates selection',async()=>{
  const h=await workerHarness(),file=new File([bytes],'source.unitypackage');
  const scan=(await h.request({type:'scan',files:[file,new File([bytes],'renamed.unitypackage')]})).message;
  assert.equal(scan.type,'scanned');assert.equal(scan.packages.length,1);assert.equal(h.fetches,0);
  assert(scan.packages[0].assets.every(a=>!('meta' in a)&&!('asset' in a)));
  assert(!scan.selection.packages[0].guids.includes(GUIDS.image));
  assert.equal((await h.request({type:'analyze',plan:fixture.plan})).message.type,'error','Scan cannot reuse earlier/partial loaded assets');
  const loaded=(await h.request({type:'select',selection:scan.selection})).message;assert.equal(loaded.type,'loaded',JSON.stringify(loaded));
  assert.equal(loaded.importPackages[0].assets.length,source.length);
  const plan=structuredClone(fixture.plan);plan.inputHashes=loaded.inputs.map(p=>p.hash);plan.importSelection=loaded.selection;
  const analyzed=(await h.request({type:'analyze',plan})).message;assert.equal(analyzed.type,'analyzed');assert(analyzed.view.ready,JSON.stringify(analyzed.view.issues));
  const done=(await h.request({type:'generate',plan})).message;assert.equal(done.type,'complete',JSON.stringify(done));
  assert(![...readUnityPackage(new Uint8Array(done.archiveBuffer)).values()].some(a=>a.path.endsWith('.PNG')));
  for(const mutate of [s=>s.packages[0].hash='f'.repeat(64),s=>s.packages[0].guids.push(GUIDS.base),s=>s.packages[0].guids.push(GUIDS.image),s=>s.packages[0].guids.push('b'.repeat(32)),s=>s.packages[0].guids=[],s=>s.preserveResources=false]){
    const selection=structuredClone(scan.selection);mutate(selection);
    assert.equal((await h.request({type:'select',selection})).message.type,'error');
    assert.equal((await h.request({type:'catalog'})).message.type,'error','Failed select leaves no old catalog usable');
    assert.equal((await h.request({type:'select',selection:scan.selection})).message.type,'loaded','Valid selection can recover without scanning again');
  }
  await h.request({type:'scan',files:[file]});assert.equal((await h.request({type:'generate',plan})).message.type,'error','New scan invalidates previously loaded sources');
});
await test('Worker preserves known fileID checks through omission and same-hash re-scan',async()=>{
  const f=generationFixture();f.packages[0].assets.find(a=>a.guid===GUIDS.clip).asset=enc.encode(clip('7400001'));
  const file=new File([writeUnityPackage(f.packages[0].assets)],'known-id.unitypackage'),h=await workerHarness();
  let scan=(await h.request({type:'scan',files:[file]})).message;
  assert.equal((await h.request({type:'select',selection:scan.selection})).message.type,'loaded');
  for(const rescan of [false,true]){
    if(rescan)scan=(await h.request({type:'scan',files:[file]})).message;
    const selection=structuredClone(scan.selection);selection.packages[0].guids=selection.packages[0].guids.filter(g=>g!==GUIDS.clip);
    const loaded=(await h.request({type:'select',selection})).message;assert.equal(loaded.type,'loaded');
    const plan=structuredClone(f.plan);plan.inputHashes=loaded.inputs.map(p=>p.hash);plan.importSelection=loaded.selection;plan.externalReferences=[GUIDS.clip+':7400000'];
    const analyzed=(await h.request({type:'analyze',plan})).message;assert.equal(analyzed.type,'analyzed');assert(!analyzed.view.ready);
    assert(analyzed.view.referenceCandidates.some(c=>c.eligibilityReason==='known_missing_file_id'),JSON.stringify(analyzed.view.referenceCandidates));
  }
});
await test('raw Expression, empty per-package selections, changed source and busy guard',async()=>{
  const raw=new File([serializeExpression([{name:'Raw',type:'Bool',defaultValue:0,saved:true,networkSynced:true}])],'Expression.asset');
  const h=await workerHarness(),file=new File([bytes],'source.unitypackage');
  const scan=(await h.request({type:'scan',files:[file,raw]})).message;assert.equal(scan.type,'scanned');
  scan.selection.packages.find(p=>p.hash===scan.packages[0].hash).guids=[];
  const loaded=(await h.request({type:'select',selection:scan.selection})).message;assert.equal(loaded.type,'loaded');assert.equal(loaded.catalog.expressions.length,1);assert.equal(loaded.inputs.reduce((s,p)=>s+p.assetCount,0),1);
  let release,began;const gate=new Promise(r=>release=r),started=new Promise(r=>began=r);
  class Delayed extends File{async arrayBuffer(){began();await gate;return super.arrayBuffer();}}
  const running=h.request({type:'scan',files:[new Delayed([bytes],'delayed.unitypackage')]});await started;
  assert.equal((await h.request({type:'select',selection:scan.selection})).message.type,'error');release();await running;
  class Changed extends File{reads=0;async arrayBuffer(){const b=await super.arrayBuffer();if(++this.reads>1)new Uint8Array(b)[0]^=1;return b;}}
  const changed=(await h.request({type:'scan',files:[new Changed([bytes],'changed.unitypackage')]})).message;
  const result=(await h.request({type:'select',selection:changed.selection})).message;assert.equal(result.type,'error');assert.match(result.message,/変わりました/);
  const failed=(await h.request({type:'scan',files:[file,new File(['bad'],'bad.unitypackage')]})).message;assert.equal(failed.type,'error');
  assert.equal((await h.request({type:'select',selection:changed.selection})).message.type,'error','Partial scan is not committed');
});

if(process.argv[2])await test('private original: streaming scan/select and production Worker without resource body retention',async()=>{
  const path=process.argv[2],before=await readFile(path),hash=await digest(before),start=performance.now();
  const scan=scanUnityPackage(before),scanMs=Math.round(performance.now()-start),guids=scan.assets.filter(a=>a.selectable).map(a=>a.guid);
  assert(scan.assets.every(a=>!('asset' in a)));assert(scan.assets.some(a=>a.referenceOnly));
  const second=performance.now(),selected=selectUnityPackage(before,guids),selectMs=Math.round(performance.now()-second);
  assert.equal(selected.assets.length,guids.length);assert(selected.assets.every(a=>/\.(controller|anim|asset|prefab|mask)$/i.test(a.path)));
  assert(selected.inventory.every(a=>!('asset' in a)));
  const h=await workerHarness(),file=await inputFile(path),scanned=await h.request({type:'scan',files:[file]});assert.equal(scanned.message.type,'scanned',JSON.stringify(scanned.message));
  const loaded=await h.request({type:'select',selection:scanned.message.selection});assert.equal(loaded.message.type,'loaded',JSON.stringify(loaded.message));
  assert.equal(loaded.message.inputs[0].assetCount,guids.length);assert.equal(await digest(await readFile(path)),hash,'Original file hash is unchanged');
  console.log(JSON.stringify({hash,compressedBytes:before.length,expandedBytes:scan.expandedBytes,inventory:scan.assets.length,selectedAssets:guids.length,
    selectedBytes:selected.selectedBytes,metadataBytes:scan.metadataBytes,scanMs,selectMs,workerScanMs:scanned.elapsedMs,workerSelectMs:loaded.elapsedMs,
    controllers:loaded.message.catalog.controllers.length,expressions:loaded.message.catalog.expressions.length,imagesRetained:0}));
});
console.log(`PASS ${passed} package-selection groups; browser layout and Unity runtime are not exercised.`);
