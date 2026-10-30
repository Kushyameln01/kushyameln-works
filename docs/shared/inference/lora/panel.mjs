import {openLoraFolder} from './folder.mjs';
import {createLora} from './sdk.mjs';

export function mountLoraPanel(root,options={}){
 if(!root||typeof root.replaceChildren!=='function')throw Error('LoRA panel root required');
 const doc=root.ownerDocument;
 function el(tag,attrs={},text){const n=doc.createElement(tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
 function field(label,node){const wrapper=el('label');wrapper.append(el('span',{},label),node);return wrapper;}
 const folderInput=el('input',{type:'file',webkitdirectory:'',multiple:'','aria-label':'LoRAフォルダー'});
 const pairSelect=el('select',{'data-role':'pair','aria-label':'LoRAの種類'});
 const noiseSelect=el('select',{'data-role':'noise','aria-label':'ノイズ段階'});noiseSelect.append(el('option',{value:'high'},'High'),el('option',{value:'low'},'Low'));
 const strengthInput=el('input',{type:'number',step:'0.1',value:'1','data-role':'strength','aria-label':'適用強度'});
 const inspectButton=el('button',{type:'button','data-action':'inspect'},'内容を確認');
 const applyButton=el('button',{type:'button','data-action':'apply'},'適用');
 const detachButton=el('button',{type:'button','data-action':'detach'},'解除');
 const cancelButton=el('button',{type:'button','data-action':'cancel'},'取消');
 const connectionLabel=el('p',{'data-role':'connection'});
 const status=el('p',{'role':'status','aria-live':'polite','data-role':'status'},'HighNoiseとLowNoiseを含むフォルダーを選択してください。');
 const result=el('pre',{'data-role':'result'});
 const fields=el('div',{class:'lora-fields'});fields.append(field('フォルダー',folderInput),field('種類',pairSelect),field('ノイズ段階',noiseSelect),field('強度',strengthInput));
 const actions=el('div',{class:'lora-actions'});actions.append(inspectButton,applyButton,detachButton,cancelButton);
 root.replaceChildren(fields,connectionLabel,actions,status,result);
 let sdk=null,folder=null,connection=null,disposed=false,generation=0,active=null,busy=false,lastTarget=null;
 const listeners=[];
 function listen(node,type,fn){node.addEventListener(type,fn);listeners.push(()=>node.removeEventListener(type,fn));}
 function update(){const ready=!!sdk&&!disposed;folderInput.disabled=disposed;pairSelect.disabled=!ready;noiseSelect.disabled=!ready;strengthInput.disabled=!ready;inspectButton.disabled=!ready||busy;applyButton.disabled=!ready||!connection||busy;detachButton.disabled=!ready||!connection||busy;cancelButton.disabled=!busy;connectionLabel.textContent=connection?'推論モジュール接続済み':'推論モジュール未接続';}
 function selection(){if(!folder||!sdk)throw Error('LoRAフォルダーを選択してください。');return {pairId:pairSelect.value,noise:noiseSelect.value};}
 function invalidate(message){generation++;active?.abort();active=null;sdk?.cancel();busy=false;result.textContent='';if(message)status.textContent=message;update();}
 async function operation(run){
  if(disposed)throw Error('LoRA panel disposed');
  const selected=selection(),strength=Number(strengthInput.value);if(strengthInput.value===''||!Number.isFinite(strength))throw Error('適用強度を確認してください。');
  invalidate();const g=generation,owned=sdk,controller=new AbortController();active=controller;busy=true;update();
  const guard=()=>{controller.signal.throwIfAborted();if(disposed||g!==generation||owned!==sdk)throw new DOMException('処理を取り消しました','AbortError');};
  try{return await run({selected,strength,owned,guard,signal:controller.signal});}
  catch(e){if(!disposed&&g===generation)status.textContent=e.name==='AbortError'?'取り消しました。':e.message;throw e;}
  finally{if(g===generation){busy=false;active=null;update();}}
 }
 async function inspect(){return operation(async({selected,owned,guard,signal})=>{status.textContent='内容を確認しています。';const report=await owned.inspect(selected,{signal});guard();result.textContent=`${report.fileName}\ntensor: ${report.tensorCount}\n未対応tensor: ${report.unknownTensors.length}\nサイズ: ${report.size} bytes`;status.textContent='内容を確認しました。モデルへの適合は未検証です。';return report;});}
 async function apply(){return operation(async({selected,strength,owned,guard})=>{
  const link=connection;if(!link)throw Error('推論モジュール未接続');status.textContent='適用する重みを準備しています。';
  const target=await link.targetResolver(selected);guard();const registry=await target.describe();guard();
  const plan=await owned.plan({selection:selected,strength,target:registry});guard();
  const sink=await link.createSink(plan);guard();let prepared;
  try{prepared=await owned.prepare(plan,{baseProvider:link.baseProvider,sink,blockRows:link.blockRows??16});guard();const applied=await owned.apply(prepared,target);guard();lastTarget=target;result.textContent=`適用状態: ${applied.applicationRevision}`;status.textContent='適用しました。';return applied;}
  finally{if(prepared)await owned.release(prepared);}
 });}
 async function detach(){return operation(async({selected,owned,guard})=>{const link=connection;if(!link)throw Error('推論モジュール未接続');const target=lastTarget??await link.targetResolver(selected);guard();status.textContent='元の重みへ戻しています。';const state=await owned.detach(target);guard();lastTarget=null;result.textContent='';status.textContent='解除しました。';return state;});}
 async function loadFolder(){
  if(disposed)return;invalidate();const g=generation,old=sdk;sdk=null;folder=null;pairSelect.replaceChildren();lastTarget=null;update();
  try{
   await old?.dispose();if(g!==generation||disposed)return;
   const nextFolder=openLoraFolder(folderInput.files);folder=nextFolder;
   for(const pair of folder.pairs)pairSelect.append(el('option',{value:pair.id},pair.label));noiseSelect.value='high';
   status.textContent='計算モジュールを読み込んでいます。';const next=await createLora({folder:nextFolder});
   if(disposed||g!==generation){await next.dispose();return;}sdk=next;status.textContent='フォルダーを読み込みました。';update();
  }catch(e){if(!disposed&&g===generation){folder=null;status.textContent=e.message;update();}}
 }
 function connect(next){if(disposed)throw Error('LoRA panel disposed');if(next!==null&&(!next||typeof next.targetResolver!=='function'||typeof next.baseProvider?.readBlock!=='function'||typeof next.createSink!=='function'))throw Error('推論モジュールの接続APIを確認してください。');invalidate();connection=next;lastTarget=null;update();return api;}
 listen(folderInput,'change',()=>{void loadFolder();});
 for(const node of [pairSelect,noiseSelect,strengthInput])listen(node,'change',()=>invalidate('設定を変更しました。'));
 const launch=fn=>()=>{const before=generation;void fn().catch(e=>{if(!disposed&&generation===before)status.textContent=e.name==='AbortError'?'取り消しました。':e.message;});};
 listen(inspectButton,'click',launch(inspect));listen(applyButton,'click',launch(apply));listen(detachButton,'click',launch(detach));listen(cancelButton,'click',()=>invalidate('取り消しました。'));
 const api=Object.freeze({connect,inspect,async dispose(){if(disposed)return;invalidate();disposed=true;folderInput.value='';for(const remove of listeners)remove();const old=sdk;sdk=null;folder=null;connection=null;lastTarget=null;update();await old?.dispose();}});
 update();if(options.connection)connect(options.connection);return api;
}
