// Build only; does not execute product modules. Pinned esbuild is provided explicitly.
// ESBUILD_MODULE_PATH=/absolute/path/esbuild/lib/main.js node tools/media-baseline/bundle.mjs
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const repo=resolve(new URL('../..',import.meta.url).pathname);
const base=resolve(process.argv[2]??repo+'/docs');
const record=resolve(process.argv[3]??repo+'/tools/media-baseline/bundle-record.json');
if(!process.env.ESBUILD_MODULE_PATH)throw Error('Set ESBUILD_MODULE_PATH to the reviewed esbuild 0.28.0 module');
const {build,version}=await import(pathToFileURL(resolve(process.env.ESBUILD_MODULE_PATH)).href);
if(version!=='0.28.0')throw Error('Expected esbuild 0.28.0');
const allowedURLs=new Set(['shared/compute/kernel.mjs','shared/unity-analysis/kernel/registry.mjs','shared/technical-library/kernel/registry.mjs']);
const result=await build({
 entryPoints:[resolve(base,'shared/compute/pool-worker.mjs')],outfile:resolve(base,'shared/compute/pool-worker.bundle.mjs'),
 bundle:true,format:'esm',platform:'browser',target:'es2022',minify:false,sourcemap:false,metafile:true,write:false,
 plugins:[{name:'reviewed-module-url',setup(b){b.onLoad({filter:/\.mjs$/},async args=>{
  let source=await readFile(args.path,'utf8');const name=relative(base,args.path).split('\\').join('/');
  if(source.includes('import.meta.url')){
   if(!allowedURLs.has(name))throw Error('Unreviewed module URL '+name);
   const re=/new URL\(\s*(['"])([^'"]+)\1,\s*import\.meta\.url\s*\)/g;
   if(source.replace(re,'').includes('import.meta.url'))throw Error('Nonliteral module URL '+name);
   source=source.replace(re,(_,q,value)=>{
    const asset=posix.normalize(posix.join(posix.dirname(name),value));
    if(!['shared/ft/kernel/ft-kernel.wasm','shared/unity-analysis/kernel/unity-analysis.wasm','shared/technical-library/kernel/index-step.wasm'].includes(asset))throw Error('Unreviewed WASM asset '+asset);
    let target=posix.relative('shared/compute',asset);if(!target.startsWith('.'))target='./'+target;
    return `new URL(${JSON.stringify(target)},import.meta.url)`;
   });
  }
  return {contents:source,loader:'js',resolveDir:dirname(args.path)};
 });}}]
});
if(result.outputFiles.length!==1||Object.values(result.metafile.outputs).some(out=>out.imports.length))throw Error('External bundle imports');
const inputs=Object.keys(result.metafile.inputs).map(path=>relative(base,resolve(path)).split('\\').join('/')).sort();
if(inputs.some(path=>!path.startsWith('shared/')||path.startsWith('shared/media/')||path.startsWith('shared/media-basic/')))throw Error('Unexpected public compute dependency');
const output=result.outputFiles[0];
if(/media-lbp|media-align|media-paper/.test(output.text))throw Error('Retired task in public bundle');
await writeFile(output.path,output.contents);
await writeFile(record,JSON.stringify({esbuildVersion:version,inputs,sha256:createHash('sha256').update(output.contents).digest('hex'),bytes:output.contents.length,externalImports:0,retiredPreprocessingDependencies:0},null,2)+'\n');
console.log(`Bundle: ${output.contents.length} bytes, ${inputs.length} modules, no preprocessing dependencies`);
