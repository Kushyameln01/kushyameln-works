// Requirement-derived expectations. Run only against verified deployed Pages root.
import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=process.env.UNITY_PAGES_ROOT;if(!root)throw Error('Verified Pages root required');
const {expandInput}=await import(pathToFileURL(root+'/shared/unity-analysis/archive.mjs'));
const {zipSync}=await import(pathToFileURL(root+'/shared/ft/vendor/fflate.mjs'));
const enc=new TextEncoder();
test('archive preserves unknown bytes and direct/ZIP equality',()=>{const b=enc.encode('opaque\x00body');const z=zipSync({'Assets/unknown.bin':b});assert.deepEqual(expandInput({path:'assets.zip',bytes:z}),[{path:'Assets/unknown.bin',bytes:b}]);assert.deepEqual(expandInput({path:'Assets/unknown.bin',bytes:b}),[{path:'Assets/unknown.bin',bytes:b}]);});
test('unsafe path, case conflict, corrupt CRC and archive bound rejected',()=>{assert.throws(()=>expandInput({path:'x.zip',bytes:zipSync({'../escape':enc.encode('x')})}));assert.throws(()=>expandInput({path:'x.zip',bytes:zipSync({'A':enc.encode('x'),'a':enc.encode('y')})}));const z=zipSync({'a':enc.encode('test')},{level:0});z[31]^=1;assert.throws(()=>expandInput({path:'x.zip',bytes:z}));assert.throws(()=>expandInput({path:'x.zip',bytes:new Uint8Array(16*1024*1024+1)}),/ARCHIVE_INPUT_LIMIT/);});
