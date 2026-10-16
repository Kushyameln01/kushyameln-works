// Expectations authored before the ZIP buffer ownership change. Run only after verified Pages publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root=process.env.UNITY_PAGES_ROOT;
assert(root,'Verified Pages root required');
const receipt=JSON.parse(await readFile(root+'/../acquisition.json','utf8'));
assert.equal(receipt.status,'verified-deployed-pages-copy');
const {expandInput}=await import(pathToFileURL(root+'/shared/unity-analysis/archive.mjs'));
const {zipSync}=await import(pathToFileURL(root+'/shared/ft/vendor/fflate.mjs'));
const expand=bytes=>expandInput({path:'ownership.zip',bytes});
const enc=new TextEncoder();
const alterHeaders=(original,edit)=>{const bytes=original.slice(),view=new DataView(bytes.buffer),end=bytes.length-22,central=view.getUint32(end+16,true),local=view.getUint32(central+42,true);edit(view,local,central);return bytes;};

test('multiple ZIP input chunks preserve every byte, empty entry and independent output ownership',()=>{
 const first=new Uint8Array(2*1024*1024+31);let state=0x12345678;
 for(let i=0;i<first.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;first[i]=state>>>24;}
 const second=new Uint8Array(1024*1024+7).fill(173),empty=new Uint8Array();
 const archive=zipSync({'Assets/':empty,'Assets/first.bin':first,'Assets/second.bin':second,'Assets/empty.bin':empty});
 assert(archive.length>4096,'Fixture must cross the reader input-chunk boundary');
 const original=archive.slice(),result=expand(archive),files=new Map(result.map(f=>[f.path,f.bytes]));
 assert.equal(result.length,3);assert.deepEqual(files.get('Assets/first.bin'),first);assert.deepEqual(files.get('Assets/second.bin'),second);assert.deepEqual(files.get('Assets/empty.bin'),empty);
 assert.notEqual(files.get('Assets/first.bin').buffer,archive.buffer);assert.notEqual(files.get('Assets/first.bin').buffer,files.get('Assets/second.bin').buffer);
 files.get('Assets/first.bin')[0]^=1;assert.deepEqual(archive,original);assert.deepEqual(files.get('Assets/second.bin'),second);
});

test('declared size cannot permit overrun or truncated output',()=>{
 const archive=zipSync({'asset.bin':new Uint8Array(8193).fill(23)});
 const short=alterHeaders(archive,(v,l,c)=>{v.setUint32(l+22,1,true);v.setUint32(c+24,1,true);});
 const long=alterHeaders(archive,(v,l,c)=>{v.setUint32(l+22,8194,true);v.setUint32(c+24,8194,true);});
 assert.throws(()=>expand(short),/実展開容量超過/);
 assert.throws(()=>expand(long),/展開長不一致/);
});

test('CRC still verifies completed bytes before accepting an entry',()=>{
 const archive=zipSync({'asset.bin':enc.encode('complete bytes are validated')});
 const invalid=alterHeaders(archive,(v,l,c)=>{const crc=(v.getUint32(c+16,true)^1)>>>0;v.setUint32(l+14,crc,true);v.setUint32(c+16,crc,true);});
 assert.throws(()=>expand(invalid),/CRC不一致/);
});

test('path and normalized identity conflicts remain errors',()=>{
 for(const entries of [
  {'../escape.bin':enc.encode('x')},
  {'Assets/A.bin':enc.encode('a'),'Assets/a.bin':enc.encode('b')},
  {'Assets/é.bin':enc.encode('a'),'Assets/e\u0301.bin':enc.encode('b')},
  {'Assets/item':enc.encode('a'),'Assets/item/child.bin':enc.encode('b')}
 ])assert.throws(()=>expand(zipSync(entries)));
});

test('entry count is complete at 2048 and rejects 2049',()=>{
 const entries=Object.fromEntries(Array.from({length:2048},(_,i)=>[`Assets/${i}.bin`,new Uint8Array()]));
 const result=expand(zipSync(entries));assert.equal(result.length,2048);assert(result.every(f=>f.bytes.length===0));
 entries['Assets/2048.bin']=new Uint8Array();assert.throws(()=>expand(zipSync(entries)),/件数超過/);
});

test('expanded header limit is checked before allocating a 65 MiB output',()=>{
 const archive=zipSync({'asset.bin':enc.encode('small compressed fixture')});
 const oversized=alterHeaders(archive,(v,l,c)=>{v.setUint32(l+22,65*1024*1024,true);v.setUint32(c+24,65*1024*1024,true);});
 assert.throws(()=>expand(oversized),/展開容量超過/);
});

test('truncated archive never returns a partial inventory',()=>{
 const archive=zipSync({'Assets/a.bin':enc.encode('a'),'Assets/b.bin':enc.encode('b')});
 assert.throws(()=>expand(archive.subarray(0,archive.length-1)),/ZIP終端/);
});
