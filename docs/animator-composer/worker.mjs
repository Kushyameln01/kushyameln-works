import {readUnityPackage,MAX_UNITY_PACKAGE_BYTES} from '../ft-workbench/lib/unity-package.mjs';
import {instantiateFtKernel} from '../ft-workbench/lib/kernel/load-kernel.mjs';
import {splitUnityDocuments,extractReferences} from '../ft-workbench/lib/unity-text.mjs';
import {parseExpression} from './lib/registration.mjs';
import {digest,inspect,analyze,generate} from './lib/generate.mjs';

let packages=[], kernel=null, busy=false;
const send=(id,type,data={})=>self.postMessage({id,type,...data});
async function getKernel(){
  if(kernel)return kernel;
  const r=await fetch(new URL('../ft-workbench/lib/kernel/ft-kernel.wasm',import.meta.url));
  if(!r.ok)throw new Error('Hike/WASMを読み込めませんでした。再読込みしてください。');
  kernel=await instantiateFtKernel(await r.arrayBuffer());return kernel;
}
async function readFiles(files,id){
  if(!Array.isArray(files)||!files.length||files.length>24)throw new Error('素材を1〜24ファイル選択してください。');
  const result=[],seen=new Set();let total=0;
  for(const [n,file] of files.entries()){
    if(!(file instanceof File)||file.size===0||file.size>MAX_UNITY_PACKAGE_BYTES)throw new Error('空または128 MiBを超えるファイルは読み込めません。');
    send(id,'progress',{message:`素材を読み込んでいます (${n+1}/${files.length})：${file.name}`});
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length!==file.size)throw new Error(`ファイルの読込みが不完全です: ${file.name}`);
    const hash=await digest(bytes);if(seen.has(hash))continue;seen.add(hash);
    let assets;
    if(file.name.toLowerCase().endsWith('.asset')){
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      parseExpression(text);
      const expression=splitUnityDocuments(text).documents.find(d=>d.classId==='114'&&extractReferences(d.text).some(r=>r.guid==='67cc4cb7839cd3741b63733d5adf0442'&&r.fileId==='-1506855854'));
      const guid=hash.slice(0,32);
      const safeName=file.name.replace(/[^A-Za-z0-9_.-]/g,'_');
      assets=[{guid,path:`Assets/AttachedExpression/${guid}/${safeName}`,asset:bytes,
        meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${expression.fileId}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`}];
    }else assets=[...readUnityPackage(bytes).values()];
    total+=assets.reduce((sum,a)=>sum+(a.asset?.length??0)+a.meta.length,0);
    if(total>256*1024*1024)throw new Error('読込み素材の展開後サイズが合計256 MiBを超えます。使用する素材を含むpackageに絞ってください。');
    result.push({name:file.name,hash,assets});
  }
  return result;
}
self.addEventListener('message',async({data})=>{
  const {id,type,files,plan,assetChoices}=data??{};
  if(!Number.isSafeInteger(id)||!['load','catalog','analyze','generate'].includes(type))return;
  if(busy){send(id,'error',{message:'前の処理が終わるまでお待ちください。'});return;}
  busy=true;
  try{
    if(type==='load'){
      const loaded=await readFiles(files,id);
      const indexed=inspect(loaded,assetChoices??{});
      packages=loaded;
      send(id,'loaded',{catalog:indexed.catalog,inputs:packages.map(p=>({name:p.name,hash:p.hash,assetCount:p.assets.length}))});
    }else{
      if(!packages.length)throw new Error('先に素材を読み込んでください。');
      if(type==='catalog'){send(id,'catalog',{catalog:inspect(packages,assetChoices??{}).catalog});return;}
      const k=await getKernel();
      if(type==='analyze')send(id,'analyzed',{view:analyze(packages,plan,k).view});
      else{
        send(id,'progress',{message:'現在の設定を再検査し、構造とInstallerを生成しています。'});
        const result=await generate(packages,plan,k),a=result.archive;
        const archiveBuffer=a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength);
        self.postMessage({id,type:'complete',archiveBuffer,report:result.report,plan:result.plan,readme:result.readme,
          assetCount:result.assetCount,archiveBytes:a.byteLength},[archiveBuffer]);
      }
    }
  }catch(error){send(id,'error',{message:error?.message??'処理に失敗しました。',issues:error?.issues??[]});}
  finally{busy=false;}
});
