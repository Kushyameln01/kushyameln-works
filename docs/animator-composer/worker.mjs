import {readUnityPackage,MAX_UNITY_PACKAGE_BYTES} from '../shared/ft/unity-package.mjs';
import {instantiateFtKernel} from '../shared/ft/kernel/load-kernel.mjs';
import {splitUnityDocuments,extractReferences} from '../shared/ft/unity-text.mjs';
import {parseExpression} from './lib/registration.mjs';
import {digest,inspect,analyze,generate} from './lib/generate.mjs';
import {scanUnityPackage,selectUnityPackage,PACKAGE_LIMITS} from './lib/package-selection.mjs';
import {diagnosticFileRecords,preflightDiagnosticFiles,copyDiagnosticFiles} from './lib/shared-diagnostics.mjs';

let packages=[], scanned=[], kernel=null, busy=false;
let diagnosticOutput=null;
// Only object identities are cached; selected bodies are released on re-selection.
const knownObjects=new Map(), encoder=new TextEncoder();
const send=(id,type,data={})=>self.postMessage({id,type,...data});
async function getKernel(){
  if(kernel)return kernel;
  const r=await fetch(new URL('../shared/ft/kernel/ft-kernel.wasm',import.meta.url));
  if(!r.ok)throw new Error('Hike/WASMを読み込めませんでした。再読込みしてください。');
  kernel=await instantiateFtKernel(await r.arrayBuffer());return kernel;
}
function checkFiles(files){
  if(!Array.isArray(files)||!files.length||files.length>24)throw new Error('素材を1〜24ファイル選択してください。');
  for(const file of files)if(!(file instanceof File)||file.size===0||file.size>MAX_UNITY_PACKAGE_BYTES)throw new Error('空または128 MiBを超えるファイルは読み込めません。');
}
async function fileBytes(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(bytes.length!==file.size)throw new Error(`ファイルの読込みが不完全です: ${file.name}`);
  return bytes;
}
function standaloneExpression(file,bytes,hash){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);parseExpression(text);
  const expression=splitUnityDocuments(text).documents.find(d=>d.classId==='114'&&extractReferences(d.text).some(r=>r.guid==='67cc4cb7839cd3741b63733d5adf0442'&&r.fileId==='-1506855854'));
  const guid=hash.slice(0,32),safeName=file.name.replace(/[^A-Za-z0-9_.-]/g,'_');
  return {guid,path:`Assets/AttachedExpression/${guid}/${safeName}`,asset:bytes,
    meta:`fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${expression.fileId}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
}
function packageList(source){
  return source.map(p=>({name:p.name,hash:p.hash,compressedBytes:p.compressedBytes,expandedBytes:p.expandedBytes,
    assets:p.inventory.map(({guid,path,size,folder,selectable,referenceOnly,extension})=>({guid,path,size,folder,selectable,referenceOnly,extension}))}));
}
function inventoryWithObjects(inventory,hash){
  const known=knownObjects.get(hash);
  return inventory.map(a=>({...a,...(known?.has(a.guid)?{objects:known.get(a.guid)}:{})}));
}
async function scanFiles(files,id){
  checkFiles(files);const result=[],seen=new Set();let metadataTotal=0;
  for(const [n,file] of files.entries()){
    send(id,'progress',{message:`読込み対象の一覧を調べています (${n+1}/${files.length})：${file.name}`});
    const bytes=await fileBytes(file),hash=await digest(bytes);if(seen.has(hash))continue;seen.add(hash);
    let inventory,expandedBytes,metadataBytes;
    const standalone=file.name.toLowerCase().endsWith('.asset');
    if(standalone){
      const {asset,...a}=standaloneExpression(file,bytes,hash);
      inventory=[{...a,size:asset.length,folder:false,selectable:true,referenceOnly:false,extension:'.asset'}];
      expandedBytes=bytes.length;metadataBytes=encoder.encode(a.meta).length+encoder.encode(a.path).length;
      if(encoder.encode(a.path).length>PACKAGE_LIMITS.pathname)throw new Error('Expression のファイル名が長すぎます（pathname 上限 64 KiB）。');
    }else{
      let scan;
      try{scan=scanUnityPackage(bytes,{maxMetadataBytes:Math.min(PACKAGE_LIMITS.metadata,64*1024*1024-metadataTotal)});}
      catch(error){if(error.message?.includes('remaining multi-package budget'))throw new Error('一覧情報のmetadata合計が64 MiBを超えます。読み込むpackageを減らしてください。');throw error;}
      inventory=scan.assets;expandedBytes=scan.expandedBytes;metadataBytes=scan.metadataBytes;
    }
    metadataTotal+=metadataBytes;
    if(metadataTotal>64*1024*1024)throw new Error('一覧情報のmetadata合計が64 MiBを超えます。読み込むpackageを減らしてください。');
    result.push({file,name:file.name,hash,standalone,compressedBytes:bytes.length,expandedBytes,inventory:inventoryWithObjects(inventory,hash)});
  }
  return result;
}
function checkedSelection(selection){
  if(!selection||selection.version!==1||selection.preserveResources!==true||!Array.isArray(selection.packages)
    ||selection.packages.length!==scanned.length)throw new Error('読込み範囲の形式またはpackage一覧が一致しません。');
  const byHash=new Map(scanned.map(p=>[p.hash,p])),seen=new Set(),entries=[];let count=0,total=0;
  for(const entry of selection.packages){
    const pkg=byHash.get(entry?.hash);
    if(!pkg||seen.has(entry.hash)||!Array.isArray(entry.guids))throw new Error('読込み範囲のpackage hashが不明または重複しています。');
    seen.add(entry.hash);const records=new Map(pkg.inventory.map(a=>[a.guid,a])),guids=new Set();
    for(const guid of entry.guids){
      const asset=records.get(guid);
      if(typeof guid!=='string'||!/^[a-f0-9]{32}$/.test(guid)||guids.has(guid)||!asset?.selectable)throw new Error('選択GUIDが不明・重複・または読込対象外です。');
      if(asset.size>PACKAGE_LIMITS.asset)throw new Error('選択した単一Assetが128 MiBを超えます。');
      guids.add(guid);count++;total+=asset.size+encoder.encode(asset.meta).length;
    }
    entries.push({hash:entry.hash,guids:[...guids].sort()});
  }
  if(!count)throw new Error('読込み可能な設定を1件以上選択してください。');
  if(total>PACKAGE_LIMITS.selected)throw new Error('選択した本文とmetaの合計が256 MiBを超えます。読込み対象を減らしてください。');
  return {version:1,packages:entries.sort((a,b)=>a.hash.localeCompare(b.hash)),preserveResources:true};
}
async function selectFiles(selection,assetChoices,id){
  const canonical=checkedSelection(selection),result=[];let total=0;
  for(const [n,pkg] of scanned.entries()){
    send(id,'progress',{message:`選択した設定を読み込んでいます (${n+1}/${scanned.length})：${pkg.name}`});
    const bytes=await fileBytes(pkg.file);
    if(await digest(bytes)!==pkg.hash)throw new Error(`一覧取得後に素材が変わりました。再度一覧を取得してください: ${pkg.name}`);
    const guids=canonical.packages.find(p=>p.hash===pkg.hash).guids;
    let assets,inventory;
    if(pkg.standalone){
      assets=guids.length?[standaloneExpression(pkg.file,bytes,pkg.hash)]:[];inventory=pkg.inventory;
      total+=assets.reduce((s,a)=>s+a.asset.length+encoder.encode(a.meta).length,0);
    }else{
      const selected=selectUnityPackage(bytes,guids,{maxSelectedBytes:PACKAGE_LIMITS.selected-total});
      assets=selected.assets;inventory=selected.inventory;total+=selected.selectedBytes;
    }
    if(total>PACKAGE_LIMITS.selected)throw new Error('選択した本文とmetaの合計が256 MiBを超えます。');
    result.push({hash:pkg.hash,name:pkg.name,assets,inventory:inventoryWithObjects(inventory,pkg.hash),selectedGuids:guids,preserveResources:true});
  }
  const indexed=inspect(result,assetChoices??{}),updates=[];
  for(const pkg of result){
    // Conflicting sources must retain their own object identities, irrespective
    // of the currently chosen source. Inspect that package alone when needed.
    const missing=pkg.assets.some(a=>indexed.assets.get(a.guid)?.packageHash!==pkg.hash);
    const own=missing?inspect([pkg]):indexed,known=new Map(knownObjects.get(pkg.hash)??[]);
    for(const a of pkg.inventory){
      const documents=own.assets.get(a.guid)?.documents;
      if(documents?.length){const objects=documents.map(({fileId,classId})=>({fileId,classId}));known.set(a.guid,objects);a.objects=objects;}
    }
    updates.push([pkg.hash,known]);
  }
  // Commit only after extraction and inspection of every package have succeeded.
  for(const [hash,known] of updates)knownObjects.set(hash,known);
  return {packages:result,indexed,selection:canonical};
}
async function readFiles(files,id){
  checkFiles(files);
  const result=[],seen=new Set();let total=0;
  for(const [n,file] of files.entries()){
    send(id,'progress',{message:`素材を読み込んでいます (${n+1}/${files.length})：${file.name}`});
    const bytes=await fileBytes(file);
    const hash=await digest(bytes);if(seen.has(hash))continue;seen.add(hash);
    let assets;
    if(file.name.toLowerCase().endsWith('.asset')){
      assets=[standaloneExpression(file,bytes,hash)];
    }else assets=[...readUnityPackage(bytes).values()];
    total+=assets.reduce((sum,a)=>sum+(a.asset?.length??0)+a.meta.length,0);
    if(total>256*1024*1024)throw new Error('読込み素材の展開後サイズが合計256 MiBを超えます。使用する素材を含むpackageに絞ってください。');
    result.push({name:file.name,hash,assets});
  }
  return result;
}
function diagnosticSource(target,plan,context){
  return {target,context:structuredClone(context??{}),packageHashes:packages.map(p=>p.hash),
    selection:structuredClone(plan?.importSelection??null),assetChoices:structuredClone(plan?.assetChoices??{}),plan:structuredClone(plan??null),
    representation:'existing selected Asset bytes and UTF-8 encoded retained meta',archiveReexpanded:false};
}
function diagnosticLinks(index,plan){
  const expressions=new Set(index.catalog.expressions.map(e=>e.id)),controllers=new Set(index.catalog.controllers.map(c=>c.id)),links=new Map();
  for(const output of plan?.outputs??[])for(const block of [output.base,...(output.additions??[])]){
    const expressionId=plan?.globalExpressionId||block?.expressionId,controllerId=block?.controllerId;
    if(!expressions.has(expressionId)||!controllers.has(controllerId))continue;
    const [eg,ef]=expressionId.split(':'),[cg,cf]=controllerId.split(':');
    links.set(expressionId+'|'+controllerId,{expression:{assetId:eg,fileId:ef},controller:{assetId:cg,fileId:cf}});
  }
  return [...links.values()];
}
function inputDiagnostics(plan,choices,context){
  const index=inspect(packages,choices??plan?.assetChoices??{}),source=diagnosticSource('input',plan,context);
  const unresolved=index.catalog.conflicts.filter(c=>!index.assets.has(c.guid)&&!index.referenceAssets.has(c.guid));
  const coverage={scope:'selected-input',inventoryKnown:packages.every(p=>Array.isArray(p.inventory)),
    selectedAssetCount:index.assets.size,unselected:[],referenceOnly:[],unadopted:[],conflicts:unresolved,
    fullOriginalMaterialsDiagnosis:'not-claimed',note:'選択外・参照のみの本文は診断入力に含みません。SDKの不明な外部参照を確定した欠落へ読み替えません。'};
  for(const pkg of packages)for(const asset of pkg.inventory??pkg.assets){
    const guid=asset.guid.toLowerCase(),selected=index.assets.get(guid),omitted=index.referenceAssets.get(guid);
    const item={guid,path:asset.path,packageHash:pkg.hash};
    if(selected?.packageHash===pkg.hash)continue;
    if(omitted?.packageHash===pkg.hash)(asset.referenceOnly?coverage.referenceOnly:coverage.unselected).push(item);
    else coverage.unadopted.push(item);
  }
  if(unresolved.length)return {notRunReason:{code:'GUID_CHOICE_REQUIRED',message:'同じGUIDの採用元を決めてから共有診断を実行してください。'},source,coverage};
  const assets=[...index.assets.values()],files=diagnosticFileRecords(assets);
  if(!files.length)return {notRunReason:{code:'NO_DIAGNOSTIC_INPUT',message:'診断できる選択済みAssetがありません。'},source,coverage};
  const ownedFiles=copyDiagnosticFiles(files);
  coverage.preflight={fileCount:ownedFiles.length,totalBytes:ownedFiles.reduce((sum,f)=>sum+f.bytes.byteLength,0)};
  return {files:ownedFiles,parameterLinks:diagnosticLinks(index,plan),source,coverage,
    mapping:assets.map(a=>({guid:a.guid,path:a.path,packageHash:a.packageHash,objects:a.documents.map(d=>({fileId:d.fileId,classId:d.classId}))}))};
}
function retainOutputDiagnostics(result,plan,context){
  const source=diagnosticSource('output',plan,context),coverage={scope:'generated-output',generatedAssetCount:result.diagnosticAssets.length,
    fullOriginalMaterialsDiagnosis:'not-claimed',externalReferences:result.report.preservedReferences??[],
    note:'生成packageへ同梱した全Asset/metaが対象です。外部Assetの本文やUnity上の動作は診断しません。'};
  try{
    const files=diagnosticFileRecords(result.diagnosticAssets);coverage.preflight=preflightDiagnosticFiles(files);
    const expression=result.diagnosticAssets.find(a=>a.path===result.report.outputRoot+'/Parameters/ExpressionParameters.asset');
    diagnosticOutput={assets:result.diagnosticAssets,source,coverage,mapping:result.report.composition?.objectMapping??[],
      parameterLinks:expression?result.report.controllers.map(c=>({expression:{assetId:expression.guid,fileId:'11400000'},controller:{assetId:c.guid,fileId:c.fileId}})):[]};
  }catch(error){diagnosticOutput={notRunReason:{code:'OUTPUT_DIAGNOSTIC_LIMIT',message:error.message},source,coverage};}
}
function outputDiagnostics(context){
  if(!diagnosticOutput)return {notRunReason:{code:'OUTPUT_NOT_AVAILABLE',message:'現在の設定で生成を完了してから出力診断を実行してください。'},source:{target:'output',context:structuredClone(context??{})},coverage:{scope:'generated-output',fullOriginalMaterialsDiagnosis:'not-claimed'}};
  const {assets,...payload}=diagnosticOutput;
  if(!assets)return payload;
  return {...payload,files:copyDiagnosticFiles(diagnosticFileRecords(assets))};
}
self.addEventListener('message',async({data})=>{
  const {id,type,files,plan,assetChoices,selection}=data??{};
  const diagnosticId=type==='diagnostic-export'&&typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(id);
  if(!(Number.isSafeInteger(id)||diagnosticId)||!['load','scan','select','catalog','analyze','generate','diagnostic-export'].includes(type))return;
  if(busy){send(id,type==='diagnostic-export'?'diagnostic-error':'error',{message:'前の処理が終わるまでお待ちください。'});return;}
  busy=true;
  try{
    if(type==='diagnostic-export'){
      if(!['input','output'].includes(data.target))throw new Error('診断対象が不正です。');
      const payload=data.target==='input'?inputDiagnostics(plan,assetChoices,data.diagnosticContext):outputDiagnostics(data.diagnosticContext);
      self.postMessage({id,type:'diagnostic-exported',payload},payload.files?.map(f=>f.bytes.buffer)??[]);return;
    }
    // Any source/selection/Plan operation makes the previous output obsolete.
    diagnosticOutput=null;
    if(type==='scan'){
      packages=[];scanned=[];
      scanned=await scanFiles(files,id);
      send(id,'scanned',{packages:packageList(scanned),selection:{version:1,preserveResources:true,
        packages:scanned.map(p=>({hash:p.hash,guids:p.inventory.filter(a=>a.selectable).map(a=>a.guid).sort()}))}});
    }else if(type==='select'){
      packages=[];
      if(!scanned.length)throw new Error('先に素材の一覧を取得してください。');
      const selected=await selectFiles(selection,assetChoices,id);packages=selected.packages;
      send(id,'loaded',{catalog:selected.indexed.catalog,selection:selected.selection,importPackages:packageList(scanned),
        inputs:packages.map(p=>({name:p.name,hash:p.hash,assetCount:p.assets.length}))});
    }else if(type==='load'){
      packages=[];scanned=[];
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
        try{retainOutputDiagnostics(result,plan,data.diagnosticContext);}
        catch(error){diagnosticOutput={notRunReason:{code:'OUTPUT_DIAGNOSTIC_UNAVAILABLE',message:String(error?.message??error)},source:{target:'output'},coverage:{scope:'generated-output',fullOriginalMaterialsDiagnosis:'not-claimed'}};}
        const archiveBuffer=a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength);
        self.postMessage({id,type:'complete',archiveBuffer,report:result.report,plan:result.plan,readme:result.readme,
          assetCount:result.assetCount,archiveBytes:a.byteLength},[archiveBuffer]);
      }
    }
  }catch(error){send(id,type==='diagnostic-export'?'diagnostic-error':'error',{message:error?.message??'処理に失敗しました。',code:type==='diagnostic-export'?'DIAGNOSTIC_EXPORT_FAILED':undefined,issues:error?.issues??[]});}
  finally{busy=false;}
});
