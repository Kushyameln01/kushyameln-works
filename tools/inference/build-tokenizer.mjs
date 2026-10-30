/** Rebuild the pinned SentencePiece browser module using an explicit local tool directory. */
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const expected='31ce41230f8694c63afa1ffeecb862d0bf3768d858328d335530997a86a1f27d';
let toolingArg,outputArg;
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];
 if(arg==='--help'){console.log('Usage: node tools/inference/build-tokenizer.mjs [--tooling DIR] [--output FILE]\nDefault tooling: INFERENCE_TOKENIZER_TOOLING or tools/inference/tokenizer-tooling.\nInstall exact @sctg/sentencepiece-js@1.3.3 and esbuild@0.25.12 in that directory.');process.exit(0);}
 else if(arg==='--tooling'){toolingArg=process.argv[++i];if(!toolingArg)throw Error('--tooling requires a directory');}
 else if(arg==='--output'){outputArg=process.argv[++i];if(!outputArg)throw Error('--output requires a file');}
 else if(!arg.startsWith('-')&&!toolingArg)toolingArg=arg; // retain the previous positional-directory call
 else throw Error(`Unknown argument: ${arg}`);
}
const tooling=path.resolve(toolingArg||process.env.INFERENCE_TOKENIZER_TOOLING||path.join(here,'tokenizer-tooling'));
const require=createRequire(path.join(tooling,'package.json'));
for(const [name,version] of [['@sctg/sentencepiece-js','1.3.3'],['esbuild','0.25.12']]){
 const packageFile=path.join(tooling,'node_modules',name,'package.json');
 if(!fs.existsSync(packageFile))throw Error(`Missing ${name}@${version}; install the pinned packages under --tooling ${tooling}`);
 if(JSON.parse(fs.readFileSync(packageFile,'utf8')).version!==version)throw Error(`Pinned ${name}@${version} is required`);
}
const esbuild=require('esbuild');
const output=path.resolve(outputArg||path.join(root,'docs/shared/inference/vendor/sentencepiece.mjs')),temporary=output+'.tmp';fs.mkdirSync(path.dirname(output),{recursive:true});
await esbuild.build({stdin:{contents:`export {SentencePieceProcessor} from ${JSON.stringify(path.join(tooling,'node_modules/@sctg/sentencepiece-js/dist/index.js'))};`,resolveDir:tooling,loader:'js'},bundle:true,treeShaking:true,format:'esm',platform:'browser',external:['module'],minify:true,outfile:temporary,plugins:[{name:'no-node-filesystem',setup(b){b.onResolve({filter:/^fs$/},()=>({path:'fs',namespace:'disabled-node'}));b.onLoad({filter:/.*/,namespace:'disabled-node'},()=>({contents:'export function readFileSync(){throw new Error("Select the tokenizer model as a local browser file");}',loader:'js'}));}}]});
const bytes=fs.readFileSync(temporary),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(sha256!==expected)throw Error(`Tokenizer output SHA256 mismatch: ${sha256}; existing accepted module was not overwritten`);
fs.renameSync(temporary,output);
console.log(JSON.stringify({package:'@sctg/sentencepiece-js',version:'1.3.3',esbuild:'0.25.12',bytes:bytes.length,sha256,output}));
