// Reproducible browser bundle. Registry resource URLs need to retain the
// originating module directory after bundling into shared/compute/.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=new URL('../../docs/shared/compute/pool-worker.bundle.mjs',import.meta.url);
const result=spawnSync('npm',['exec','--yes','--package=esbuild@0.25.11','--','esbuild','docs/shared/compute/pool-worker.mjs','--bundle','--format=esm','--platform=browser','--target=es2022','--supported:template-literal=false','--outfile=docs/shared/compute/pool-worker.bundle.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,npm_config_cache:process.env.npm_config_cache??'/tmp/kushyameln-esbuild-cache'}});
if(result.status!==0)throw Error('esbuild failed');
let source=await readFile(output,'utf8');
for(const [before,after]of [
  ['new URL("./index-step.wasm", import.meta.url)','new URL("../technical-library/kernel/index-step.wasm", import.meta.url)'],
  ['new URL("./unity-analysis.wasm", import.meta.url)','new URL("../unity-analysis/kernel/unity-analysis.wasm", import.meta.url)'],
]){
  if(source.split(before).length!==2)throw Error('Unexpected kernel URL in generated bundle: '+before);
  source=source.replace(before,after);
}
// The Template adapter already lives in shared/compute, the bundle directory.
// Assert that its literal resource URL survives bundling without relocation.
if(source.split('new URL("../../parameter-template/template.json", import.meta.url)').length!==2)throw Error('Unexpected Template URL in generated bundle');
await writeFile(output,source);
console.log('Preserved knowledge/Unity registry resource locations.');
