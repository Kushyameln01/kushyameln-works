import {indexPackages, analyzeComposition, generateComposition, makeGeneratedAsset} from './composition.mjs';
import {parseExpression, resolveRegistration, serializeExpression, serializeInstaller} from './registration.mjs';
import {splitUnityDocuments, extractReferences} from '../../shared/ft/unity-text.mjs';
import {writeUnityPackage, readUnityPackage} from '../../shared/ft/unity-package.mjs';

export const VERSION = 1;
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
const issue = (code,message) => ({severity:'error',code,message});
export async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function checkPlan(plan, packages) {
  const issues=[];
  if (!plan || plan.schemaVersion!==1) return [issue('plan_version','対応する構成ファイルではありません。')];
  const selected=packages.some(p=>p.selectedGuids!==undefined);
  if(selected||plan.importSelection!==undefined){
    try{
      const s=plan.importSelection;
      if(!s||s.version!==1||s.preserveResources!==true||!Array.isArray(s.packages)||s.packages.length!==packages.length)throw Error();
      const seen=new Set();
      for(const entry of s.packages){
        const p=packages.find(p=>p.hash===entry?.hash);
        if(!p||seen.has(entry.hash)||!Array.isArray(entry.guids)||entry.guids.some(g=>typeof g!=='string'||!/^[a-f0-9]{32}$/.test(g))
          ||new Set(entry.guids).size!==entry.guids.length||!Array.isArray(p.selectedGuids)||p.preserveResources!==true
          ||JSON.stringify([...entry.guids].sort())!==JSON.stringify([...p.selectedGuids].sort()))throw Error();
        seen.add(entry.hash);
      }
    }catch{issues.push(issue('import_selection_mismatch','保存された読込み範囲と現在の素材が一致しません。「読込み対象を確定」で選択を適用してください。'));}
  }
  const external=plan.externalReferences;
  if(external!==undefined&&(!Array.isArray(external)||external.some(id=>typeof id!=='string'||!isReferenceId(id))||new Set(external).size!==external.length))
    issues.push(issue('external_references','外部参照の維持設定は、重複のないGUID:fileIDの配列で指定してください。'));
  if (typeof plan.name!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(plan.name))
    issues.push(issue('output_name','出力名は半角英数字・ハイフン・下線で1〜64文字にしてください。'));
  if (!Array.isArray(plan.outputs) || !plan.outputs.length || plan.outputs.length>8)
    issues.push(issue('outputs','出力Controllerを1〜8個指定してください。'));
  const hashes=packages.map(p=>p.hash).sort();
  if (!Array.isArray(plan.inputHashes) || JSON.stringify([...plan.inputHashes].sort())!==JSON.stringify(hashes))
    issues.push(issue('input_mismatch','構成ファイルと読込み素材が一致しません。指定した素材を確認し、現在の素材で再設定してください。'));
  const ids=new Set(), playable=new Set();
  for(const o of plan.outputs??[]) {
    if(!o || typeof o.id!=='string' || ids.has(o.id)) {issues.push(issue('output_id','出力IDが重複または不正です。'));continue;}
    ids.add(o.id);
    if(!['Base','Additive','Gesture','Action','FX','Sitting','TPose','IKPose'].includes(o.playable)) issues.push(issue('playable','出力Playableを選択してください。'));
    if(playable.has(o.playable)) issues.push(issue('playable_duplicate',`${o.playable}の出力は一つにまとめてください。`));
    playable.add(o.playable);
    if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(o.name??'')) issues.push(issue('controller_name','Controller名は半角英数字・ハイフン・下線で1〜64文字にしてください。'));
    if(!o.base?.controllerId) issues.push({...issue('base_missing',`${o.name}のベースControllerを指定してください。素材にControllerがない場合は、ベースに使うControllerを含むpackageを追加してください。`),blockId:o.base?.id});
    for(const b of [o.base,...(o.additions??[])]) {
      if(!b || typeof b.id!=='string' || ids.has(b.id)) issues.push(issue('block_id','ブロックIDが重複または不正です。'));
      else ids.add(b.id);
      if(b && b!==o.base && !b.controllerId) issues.push({...issue('controller_missing','追加ブロックのControllerを指定してください。Clip・BlendTreeだけの素材は「既存Motionの置換」から利用できます。'),blockId:b.id});
    }
  }
  if(!['Absolute','Relative'].includes(plan.installer?.pathMode) || !['Append','Replace'].includes(plan.installer?.mergeMode)
    || typeof plan.installer?.matchWriteDefaults!=='boolean') issues.push(issue('installer_options','Installerの導入設定を確認してください。'));
  return issues;
}

function isReferenceId(id) {
  if(!/^[0-9a-f]{32}:-?[1-9][0-9]*$/.test(id))return false;
  const n=BigInt(id.split(':')[1]);return n>=-9223372036854775808n&&n<=9223372036854775807n;
}

export function inspect(packages, choices={}) {
  return indexPackages(packages,choices);
}

export function analyze(packages,plan,kernel) {
  const index=inspect(packages,plan?.assetChoices??{});
  const issues=checkPlan(plan,packages);
  if(issues.length) return {index,view:{catalog:index.catalog,issues,rows:[],animatorConflicts:[],slots:[],ready:false,bitCost:0,
    analysisComplete:false,usageComplete:false,referenceCandidates:[],preservedReferences:[],dependencyDiagnostics:[],blockStatus:[],expressionScope:null}};
  const expressions=new Map(), invalid=new Map();
  for(const e of index.catalog.expressions??[]) {
    try {
      const node=index.nodes.get(e.id);
      expressions.set(e.id,parseExpression(node.text));
    } catch(error) {invalid.set(e.id,error.message);}
  }
  const selected=[plan.globalExpressionId,...plan.outputs.flatMap(o=>[o.base,...o.additions].map(b=>b.expressionId))].filter(Boolean);
  for(const id of (plan.globalExpressionId?[plan.globalExpressionId]:selected)) {
    if(invalid.has(id)) issues.push(issue('invalid_expression',invalid.get(id)));
    else if(!expressions.has(id)) issues.push(issue('missing_expression',`選択したExpressionがありません: ${id}`));
  }
  let structure,registration;
  try { structure=analyzeComposition(index,plan,kernel); } catch(error) {issues.push(issue('composition',error.message));}
  if(structure) {
    issues.push(...(structure.issues??[]));
    const blockSettings=new Map(plan.outputs.flatMap(o=>[o.base,...o.additions]).map(b=>[b.id,b]));
    const blocks=structure.blocks.map(b=>({...b,expressionId:blockSettings.get(b.id)?.expressionId??null}));
    try { registration=resolveRegistration(blocks,expressions,plan,structure.menuParameters??[]); issues.push(...(registration.issues??[])); }
    catch(error){issues.push(issue('registration',error.message));}
    if(registration){
      const registered=new Set(registration.registrations.map(r=>r.name));
      const missing=new Map((structure.menuParameters??[]).filter(p=>!registered.has(p.name)).map(p=>[p.name,p]));
      for(const p of missing.values()) {
        const row=registration.rows.find(r=>r.name===p.name);
        const help=plan.globalExpressionId?'全体用Expressionの記載を確認するか、全体指定を解除してブロック別の定義へ戻してください。'
          :row?.fixed?'この項目は添付Expressionの範囲で固定されています。該当ブロックの定義と適用範囲を確認してください。'
          :'登録表で外部登録と型を指定してください。';
        issues.push({...issue('menu_parameter_unregistered',`${p.name}: 選択Menuが使うParameterが外部登録されていません（${p.path}）。${help}`),parameterNames:[p.name],action:plan.globalExpressionId?'expression-scope':'parameter'});
      }
    }
  }
  const rows=registration?.rows??[];
  for(const i of issues)if(!i.parameterNames) {
    const names=rows.filter(r=>i.message.startsWith(`${r.name}:`)||plan.outputs.some(o=>i.message.startsWith(`${o.id}/${r.name}:`))).map(r=>r.name);
    if(i.code==='sync_budget')names.push(...rows.filter(r=>r.registered&&r.networkSynced).map(r=>r.name));
    if(i.code==='parameter_count')names.push(...rows.filter(r=>r.registered).map(r=>r.name));
    if(names.length)i.parameterNames=[...new Set(names)];
  }
  const blockStatus=structure?.blockStatus??[];
  const analysisComplete=!!structure&&!!registration&&blockStatus.every(b=>b.status==='complete')
    &&!(structure.dependencyDiagnostics??[]).length
    &&!issues.some(i=>['composition','registration','block_unsupported','output_unsupported','menu_unsupported','resource_unsupported','invalid_expression','missing_expression','kernel_required'].includes(i.code));
  let expressionScope={mode:plan.globalExpressionId?'global':'blocks',globalExpressionId:plan.globalExpressionId??null,
    partial:!analysisComplete,ignoredBlockExpressions:plan.globalExpressionId?plan.outputs.flatMap(o=>[o.base,...o.additions]).filter(b=>b.expressionId).length:0,changes:[]};
  if(plan.globalExpressionId&&structure&&registration) {
    try {
      const blockSettings=new Map(plan.outputs.flatMap(o=>[o.base,...o.additions]).map(b=>[b.id,b]));
      const baseline=resolveRegistration(structure.blocks.map(b=>({...b,expressionId:blockSettings.get(b.id)?.expressionId??null})),expressions,{...plan,globalExpressionId:null},structure.menuParameters??[]);
      const before=new Map(baseline.rows.map(r=>[r.name,r]));
      const after=new Map(rows.map(r=>[r.name,r]));
      const signature=r=>JSON.stringify([r?.registered??null,r?.type??null,r?.defaultValue??null,r?.networkSynced??null,r?.saved??null]);
      const fields=r=>r?{registered:r.registered,type:r.type,defaultValue:r.defaultValue,networkSynced:r.networkSynced,saved:r.saved}:null;
      expressionScope.changes=[...new Set([...before.keys(),...after.keys()])].filter(name=>signature(before.get(name))!==signature(after.get(name))).map(name=>({name,before:fields(before.get(name)),after:fields(after.get(name))}));
    } catch {expressionScope.comparisonUnavailable=true;}
  }
  const view={catalog:index.catalog, issues, rows,analysisComplete,expressionScope,
    usageComplete:analysisComplete&&(structure?.usageComplete??true),
    referenceCandidates:structure?.referenceCandidates??[],preservedReferences:structure?.preservedReferences??[],
    dependencyDiagnostics:structure?.dependencyDiagnostics??[],blockStatus,
    animatorConflicts:registration?.animatorConflicts??[],slots:structure?.slots??[],
    summary:structure?.summary??null,blocks:structure?.blocks??[],missingParameters:structure?.missingParameters??[],
    bitCost:registration?.bitCost??0,registrations:registration?.registrations??[],
    ready:!!structure&&!!registration&&!issues.some(i=>i.severity==='error')};
  return {index,structure,registration,view};
}

function referenceField(text,r){
  const prefix=text.slice(0,r.start),direct=/([A-Za-z_][A-Za-z_0-9]*):[ \t]*(?:\r?\n[ \t]*)?$/.exec(prefix)?.[1];
  if(direct)return direct;
  const lines=prefix.split('\n'),last=lines.pop()??'',indent=/^ */.exec(last)[0].length;
  for(let i=lines.length-1;i>=0;i--){const m=/^( *)([A-Za-z_][A-Za-z_0-9]*):/.exec(lines[i]);if(m&&m[1].length<=indent)return m[2];}
  return '';
}

export function validateAssets(assets,{externalReferences=[]}={}) {
  const byGuid=new Map(),nodes=new Map(),externalScripts=new Set(),allowed=new Map(),used=new Map();
  const refKey=(source,id,field,type)=>JSON.stringify([source,id,field,String(type??'2')]);
  for(const ref of externalReferences){
    if(!ref||!isReferenceId(ref.targetId)||typeof ref.outputSourceId!=='string'||typeof ref.outputPath!=='string'
      ||typeof ref.edgeId!=='string'||!ref.edgeId||typeof ref.field!=='string'||!ref.field||typeof ref.sourceId!=='string'||typeof ref.scope!=='string'
      ||!Number.isInteger(ref.referenceIndex)||ref.referenceIndex<0)throw new Error('外部参照の検証情報が不正です。');
    const k=refKey(ref.outputSourceId,ref.targetId,ref.field,ref.referenceType),entry=allowed.get(k)??{path:ref.outputPath,edges:new Set()};
    if(entry.path!==ref.outputPath)throw new Error('外部参照の出力Pathが一致しません。');
    // Multiple block origins may share one generated Clip/resource edge.
    entry.edges.add(JSON.stringify([ref.sourceId,ref.scope,ref.referenceIndex,ref.scope.startsWith('layer:')?ref.blockId:null]));allowed.set(k,entry);
  }
  for(const asset of assets) {
    if(byGuid.has(asset.guid)) throw new Error(`出力GUIDが重複: ${asset.path}`);
    byGuid.set(asset.guid,asset);
    if(!asset.asset)continue;
    let text;try{text=dec.decode(asset.asset);}catch{continue;}
    if(!/^(?:\uFEFF)?%YAML|^--- !u!/m.test(text))continue;
    const parsed=splitUnityDocuments(text);
    for(const doc of parsed.documents)nodes.set(`${asset.guid}:${doc.fileId}`,{asset,doc});
    const main=/^  mainObjectFileID: (-?\d+)/m.exec(asset.meta);
    if(main&&main[1]!=='0'&&!nodes.has(`${asset.guid}:${main[1]}`))throw new Error(`mainObjectFileIDの参照先がありません: ${asset.path}`);
  }
  const opaque=new Set([...byGuid.keys()].filter(guid=>![...nodes.keys()].some(id=>id.startsWith(guid+':'))));
  const check=(asset,text,sourceId,r)=>{
    if(r.fileId==='0')return;
    const guid=r.guid?.toLowerCase()??asset.guid,id=`${guid}:${r.fileId}`;
    if(nodes.has(id))return;
    const field=referenceField(text,r);
    if(field==='m_Script'&&r.guid){externalScripts.add(id);return;}
    if(/^0{16}[ef]0{15}$/.test(guid))return;
    const target=byGuid.get(guid);
    if(target?.asset&&opaque.has(guid))return;
    const k=refKey(sourceId,id,field,r.type),permitted=allowed.get(k);
    // An exception is bound to a generated source object and exact external
    // GUID/fileID. It cannot excuse broken local or co-packaged references.
    if(!target&&r.guid&&guid!==asset.guid&&permitted?.path===asset.path){
      const count=(used.get(k)??0)+1;if(count>permitted.edges.size)throw new Error(`許可件数を超える外部参照: ${asset.path} → ${id}`);
      used.set(k,count);return;}
    throw new Error(`参照先がありません: ${asset.path} → ${id}`);
  };
  for(const {asset,doc} of nodes.values())for(const r of extractReferences(doc.text))check(asset,doc.text,`${asset.guid}:${doc.fileId}`,r);
  for(const asset of assets){const meta=(asset.meta??'').replace(/^guid:[^\r\n]*(?:\r?\n|$)/m,'');for(const r of extractReferences(meta))check(asset,meta,`${asset.guid}:meta`,r);}
  for(const [k,entry] of allowed)if((used.get(k)??0)!==entry.edges.size)throw new Error(`出力に対応しない外部参照の検証情報: ${k}`);
  return {objectCount:nodes.size,externalScripts:[...externalScripts].sort(),...(used.size?{preservedExternalReferences:[...used.keys()].sort()}:{} )};
}

async function textAsset(root,path,text) {
  const guid=(await digest(enc.encode(`composer-text-1:${root}/${path}`))).slice(0,32);
  return {guid,path:`${root}/${path}`,asset:enc.encode(text),meta:`fileFormatVersion: 2\nguid: ${guid}\nTextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`};
}
async function addFolders(assets) {
  const existing=new Set(assets.map(a=>a.path)),paths=new Set();
  for(const asset of assets) {
    const parts=asset.path.split('/');
    for(let n=2;n<parts.length;n++)paths.add(parts.slice(0,n).join('/'));
  }
  for(const path of [...paths].sort())if(!existing.has(path)){
    const guid=(await digest(enc.encode('composer-folder-1:'+path))).slice(0,32);
    assets.push({guid,path,asset:null,meta:`fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`});
  }
}
export async function generate(packages,plan,kernel) {
  const checked=analyze(packages,plan,kernel);
  if(!checked.view.ready) {const e=new Error('未設定または競合が残っています。');e.issues=checked.view.issues;throw e;}
  const built=await generateComposition(checked.index,plan,checked.structure,checked.registration.animators);
  const root=`Assets/${plan.name}`, assets=[...built.assets];
  const registrations=checked.registration.registrations;
  assets.push(await makeGeneratedAsset(root,'Parameters/ExpressionParameters.asset',serializeExpression(registrations),'11400000'));
  assets.push(await makeGeneratedAsset(root,'Installer.prefab',serializeInstaller({name:plan.name,controllers:built.controllers,
    registrations,options:plan.installer,menu:built.menu??null}),'100000','prefab'));
  const preserved=built.report.preservedReferences??[];
  const verified=validateAssets(assets,{externalReferences:preserved});
  const report={format:'animator-composer-report-1',generatorVersion:VERSION,inputHashes:plan.inputHashes,
    outputRoot:root,controllers:built.controllers,parameters:registrations,bitCost:checked.registration.bitCost,
    composition:built.report,preservedReferences:preserved,staticValidation:{status:preserved.length?'PASS_WITH_EXTERNAL_REFERENCES':'PASS',...verified},
    ...(preserved.length?{sourceCompleteness:'EXTERNAL_ASSETS_REQUIRED',usageComplete:checked.view.usageComplete}:{}),
    verification:{unityImport:'UNVERIFIED',maBuild:'UNVERIFIED',vrchat:'UNVERIFIED'},
    warnings:checked.view.issues.filter(i=>i.severity!=='error')};
  let readme=`# ${plan.name}\n\nAnimator Composerで生成しました。原本を直接変更していません。\n\n## 導入\n\n1. VRChat SDKとModular AvatarがあるUnityプロジェクトへImportします。\n2. Installer.prefabを対象アバターへ配置します。\n3. MAビルドと実動作を確認します。\n\nExpression Parameters未設定のアバターにも、MA Parametersから今回の登録を追加する構成です。付属Expression assetの手動割当は必須ではありません。対象Avatarの既存登録や他Installerとの競合・同期量はMAビルド時にも確認してください。\n\n導入方式: ${plan.installer.mergeMode} / Animation path: ${plan.installer.pathMode}。Replaceは対象Playableの既存Controllerを置換します。\n\n## 確認範囲\n\n生成した構造と登録設定を静的に検査済み。${preserved.length?'維持する外部Assetの内容と導入先での参照解決は未確認です。':''}Unity Import・MAビルド・VRChat実動作は未確認です。Source内のClip/BlendTreeは原本のCurveと設定を保持し、配置と参照を組み替えます。FT専用のBinary/Decode変換やShape生成は行いません。\n\nCompositionPlan.jsonをサイトに読み込み、同じ原本を選ぶと設定を再利用できます。\n`;
  if(preserved.length){
    const unique=[...new Map(preserved.map(r=>[r.targetId,r])).values()];
    readme+=`\n## 同梱しない外部Asset\n\nこのpackageは下記の既存Assetを導入先プロジェクトで参照します。Sourceへ複製していません。元のGUID・fileID・参照typeを保持しています。ファイル名や配置Pathだけが同じ別Assetでは参照を解決できません。\n\n`;
    for(const r of unique)readme+=`- ${r.targetId} (${r.kind})${r.targetPath?' — '+r.targetPath:''}\n`;
    readme+=`\n導入先で各GUID/fileIDのAssetが解決することを確認してください。未取得のAsset内容・下位参照・動作は検証していません。\n`;
    if(!checked.view.usageComplete)readme+='\n外部Motion内部のParameter使用は未解析です。影響するブロックでは元Controller宣言を全保持しました。宣言されていないParameterの有無までは確認できません。外部登録は添付Expressionと明示設定に従います。\n';
  }
  readme+='\nClipの適用先Path・Component型・Property名は保持します。対象AvatarのMesh・Transform・Prefabの添付は構造統合の条件ではなく、適用先との一致は導入時の確認範囲です。\n';
  assets.push(await textAsset(root,'CompositionPlan.json',JSON.stringify(plan,null,2)+'\n'));
  assets.push(await textAsset(root,'GenerationReport.json',JSON.stringify(report,null,2)+'\n'));
  assets.push(await textAsset(root,'README.md',readme));
  await addFolders(assets);
  const archive=writeUnityPackage(assets);
  const roundtrip=readUnityPackage(archive);
  if(roundtrip.size!==assets.length)throw new Error('出力packageの再読込み件数が一致しません。');
  // Worker-local diagnostics may inspect these already generated bytes. They are
  // never serialized into the archive, Plan, or existing generation report.
  return {archive,report,plan,readme,assetCount:assets.length,view:checked.view,diagnosticAssets:assets};
}
