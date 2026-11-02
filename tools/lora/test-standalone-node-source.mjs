import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openStandaloneNodeSource,createStandaloneNodeWriter} from './standalone-node-source.mjs';

async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lora-node-source-'));try{await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}

test('independent retained source survives releasing its root and closes after final release',()=>fixture(async dir=>{
 const file=path.join(dir,'source.bin');await fs.writeFile(file,new Uint8Array([3,4,5,6]));
 const root=await openStandaloneNodeSource(file,{maxReadBytes:3}),lease=root.retain('fixture-consumer');
 assert.equal(root.size,4);assert.equal(root.stats().references,2);
 await root.release();assert.equal(root.isValid(),false);assert.equal(lease.isValid(),true);
 assert.deepEqual([...await lease.source.read(1,3)],[4,5,6]);
 await assert.rejects(root.read(0,1),/released/);
 await assert.rejects(lease.source.read(0,4),/range|budget/);
 await assert.rejects(lease.source.read(-1,1),/range|budget/);
 await lease.release();await lease.release();assert.equal(lease.isValid(),false);
 assert.equal(root.stats().closed,true);assert.equal(root.stats().references,0);assert.equal(root.stats().inFlight,0);
}));

test('changed original bytes and replaced path invalidate all source capabilities',()=>fixture(async dir=>{
 const file=path.join(dir,'source.bin');await fs.writeFile(file,'original');
 const root=await openStandaloneNodeSource(file),lease=root.retain('reader');
 await fs.writeFile(file,'mutated!');await assert.rejects(lease.source.read(0,1),/changed/);
 assert.equal(root.isValid(),false);assert.equal(lease.isValid(),false);await root.release();await lease.release();
 const second=await openStandaloneNodeSource(file);await fs.rename(file,path.join(dir,'old.bin'));await fs.writeFile(file,'mutated!');
 await assert.rejects(second.read(0,1),/changed/);assert.equal(second.stats().invalid,true);await second.release();
}));

test('abort refuses reads and root release waits for in-flight terminal before fd close',()=>fixture(async dir=>{
 const file=path.join(dir,'source.bin');await fs.writeFile(file,Buffer.alloc(1024*1024,23));const source=await openStandaloneNodeSource(file);
 const controller=new AbortController();controller.abort();await assert.rejects(source.read(0,1,{signal:controller.signal}),/abort/i);
 const read=source.read(0,1024*1024),release=source.release();const data=await read;await release;
 assert.equal(data.length,1024*1024);assert.equal(data[1024*1024-1],23);assert.equal(source.stats().closed,true);assert.equal(source.stats().inFlight,0);
}));

test('saved package writer streams exclusive private payloads and never overwrites',()=>fixture(async dir=>{
 const saved=path.join(dir,'saved'),writer=await createStandaloneNodeWriter(saved);
 async function* chunks(){yield new Uint8Array([1,2]);yield new Uint8Array([3,4,5]);}
 await writer.writeSource('source-0.safetensors',chunks());await writer.writeManifest({sources:[{fileName:'source-0.safetensors'}]});
 assert.deepEqual([...await fs.readFile(path.join(saved,'source-0.safetensors'))],[1,2,3,4,5]);
 assert.equal(JSON.parse(await fs.readFile(path.join(saved,'manifest.json'),'utf8')).sources.length,1);
 assert.equal(writer.stats().sourceBytes,5);await assert.rejects(writer.writeSource('source-0.safetensors',chunks()),/exist/i);
 await assert.rejects(createStandaloneNodeWriter(saved),/exist/i);await assert.rejects(writer.writeSource('../escape',chunks()),/filename/i);
}));
