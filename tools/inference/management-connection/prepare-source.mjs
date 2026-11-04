import {parseArgs} from 'node:util';
import {acquireConnectionSources} from './source.mjs';
const {values}=parseArgs({options:{'repository-root':{type:'string'},output:{type:'string'}}});
if(!values['repository-root']||!values.output)throw TypeError('--repository-root and fresh --output required');
const result=await acquireConnectionSources({repositoryRoot:values['repository-root'],outputRoot:values.output});
console.log(JSON.stringify({management:{root:result.management.root,commit:result.management.receipt.commit,files:result.management.receipt.files.length},diffusion:{root:result.diffusion.root,commit:result.diffusion.receipt.commit,files:result.diffusion.receipt.files.length},neuralInference:false}));
