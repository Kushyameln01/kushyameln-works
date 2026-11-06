/** Private diagnostic only: lower the two isolated MLAS SGEMM bodies with WABT. */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

function parseSexpr(text){
 const tokens=text.replace(/\(;[\s\S]*?;\)/g,'').replace(/;;[^\n]*/g,'').match(/"(?:\\.|[^"\\])*"|[^\s()]+|[()]/g)??[];
 let at=0;
 function one(){const token=tokens[at++];if(token==='('){const value=[];while(tokens[at]!==')'){if(at>=tokens.length)throw Error('Unclosed folded WAT');value.push(one());}at++;return value;}if(token===')'||token===undefined)throw Error('Invalid folded WAT');return token;}
 const value=one();if(at!==tokens.length||value[0]!=='module')throw Error('One folded WAT module required');return value;
}
const render=node=>Array.isArray(node)?'('+node.map(render).join(' ')+')':node;

export function lowerSgemmWat(wat){
 const module=parseSexpr(wat),functions=module.filter(node=>Array.isArray(node)&&node[0]==='func');
 let fusions=0;const details=[];
 for(let index=0;index<functions.length;index++){
  const func=functions[index],alpha=new Set(),names=new Set(),savedAddends=[];
  function namesIn(node){if(Array.isArray(node))for(const child of node)namesIn(child);else if(typeof node==='string')names.add(node);}
  namesIn(func);
  function find(node){if(!Array.isArray(node))return;if(['local.set','local.tee'].includes(node[0])&&node[2]?.[0]==='f32x4.splat'&&node[2][1]?.[0]==='local.get'&&node[2][1][1]==='8')alpha.add(node[1]);for(const child of node)find(child);}
  find(func);
  const usesAlpha=node=>Array.isArray(node)&&(node[0]==='local.get'&&alpha.has(node[1])||node.some(usesAlpha));
  let changed=0,alphaExcluded=0,controlFlowExcluded=0;
  const branchOps=new Set(['br','br_if','br_table','return','return_call','return_call_indirect','throw','rethrow','delegate']);
  const hasBranch=node=>Array.isArray(node)&&(branchOps.has(node[0])||node.some(hasBranch));
  function visit(node){
   if(!Array.isArray(node))return node;
   node=node.map(visit);
   if(node[0]!=='f32x4.add'||node.length!==3)return node;
   const left=node[1],right=node[2],leftMul=left?.[0]==='f32x4.mul',rightMul=right?.[0]==='f32x4.mul';
   if(!leftMul&&!rightMul)return node;
   // MlasMultiplyFloat32x4(acc, alpha) plus output C is not a K-step FMA.
   if(leftMul&&usesAlpha(left)||rightMul&&usesAlpha(right)){alphaExcluded++;return node;}
   // A result block would change numeric branch depths inside its operands.
   // Keep such expressions unchanged rather than guessing their targets.
   if(hasBranch(left)||hasBranch(right)){controlFlowExcluded++;return node;}
   // For the initial pair of products retain the first rounded product, then
   // fuse the next product into it, matching increasing-K accumulation.
   const product=rightMul?right:left,accumulator=rightMul?left:right;
   if(product.length!==3)throw Error('Invalid folded SIMD multiplication');
   changed++;fusions++;
   if(!rightMul)return ['f32x4.relaxed_madd',product[1],product[2],accumulator];
   // In add(C,mul(A,B)), WASM evaluates C first. Moving C behind A/B
   // changes local.tee/store effects. Capture C before evaluating either
   // multiplicand, with a distinct local for each potentially nested fusion.
   let temp='$fma_saved_'+savedAddends.length;
   while(names.has(temp))temp+='_';
   names.add(temp);savedAddends.push(temp);
   return ['block',['result','v128'],['local.set',temp,accumulator],
    ['f32x4.relaxed_madd',product[1],product[2],['local.get',temp]]];
  }
  const lowered=visit(func);let at=typeof lowered[1]==='string'?2:1;
  while(Array.isArray(lowered[at])&&['type','param','result','local','export','import'].includes(lowered[at][0]))at++;
  // Append after the old local declarations, preserving every old numeric index.
  lowered.splice(at,0,...savedAddends.map(name=>['local',name,'v128']));module[module.indexOf(func)]=lowered;
  details.push({isolatedFunctionIndex:index,fusions:changed,alphaExcluded,controlFlowExcluded,alphaVectorLocals:[...alpha],
   savedAddendLocals:savedAddends,evaluationOrder:'Original left operand before right operand; right-product addend captured before A/B'});
 }
 return {wat:render(module),fusions,functions:details};
}

async function main(){
 const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2].replace(/^--/,''),process.argv[3+i*2]]));
 if(!args.wabt||!args.input||!args.output||!args.report)throw Error('--wabt --input --output --report required');
 const {default:factory}=await import(pathToFileURL(args.wabt).href),wabt=await factory();
 const bytes=new Uint8Array(await readFile(args.input));const original=wabt.readWasm(bytes,{readDebugNames:false});
 let compiled;
 try{
  original.validate();const wat=original.toText({foldExprs:true,inlineExport:false}),lowered=lowerSgemmWat(wat);
  if(lowered.functions.length!==2||lowered.functions.some(value=>value.fusions<1||value.alphaVectorLocals.length!==1))throw Error('Expected the two source-pinned SGEMM specializations');
  compiled=wabt.parseWat('private-sgemm-fma.wat',lowered.wat,{simd:true,relaxed_simd:true});compiled.validate();
  const candidate=compiled.toBinary({canonicalize_lebs:true,write_debug_names:false}).buffer;
  if(!WebAssembly.validate(candidate))throw Error('Host does not validate relaxed SIMD candidate');
  await writeFile(args.output,candidate,{flag:'wx'});
  await writeFile(args.report,JSON.stringify({schemaVersion:1,status:'diagnostic-only-unaccepted',newNeuralRuns:0,newModelExports:0,...lowered},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:true,newNeuralRuns:0,functions:lowered.functions,fusions:lowered.fusions}));
 }finally{compiled?.destroy();original.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
