import {validateTarget} from './core.mjs';

const form=document.querySelector('#generator');
const input=document.querySelector('#parameter');
const generate=document.querySelector('#generate');
const cancel=document.querySelector('#cancel');
const status=document.querySelector('#status');
const result=document.querySelector('#result');
const summary=document.querySelector('#summary');
const download=document.querySelector('#download');
let worker=null,timer=null,job=0,url=null;

function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function clearDownload(){
  if(url)URL.revokeObjectURL(url);
  url=null;download.removeAttribute('href');download.removeAttribute('download');result.hidden=true;summary.textContent='';
}
function stop(){
  ++job;worker?.terminate();worker=null;clearTimeout(timer);timer=null;
  generate.disabled=false;cancel.hidden=true;form.setAttribute('aria-busy','false');
}
input.addEventListener('input',()=>{stop();clearDownload();input.removeAttribute('aria-invalid');message('入力した名前で生成してください。');});
cancel.addEventListener('click',()=>{stop();clearDownload();message('生成を取り消しました。');});
form.addEventListener('submit',event=>{
  event.preventDefault();stop();clearDownload();
  const target=input.value;
  try{validateTarget(target);}catch(error){input.setAttribute('aria-invalid','true');message(error.message,true);input.focus();return;}
  input.removeAttribute('aria-invalid');
  const id=job;
  try{
    worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
    generate.disabled=true;cancel.hidden=false;form.setAttribute('aria-busy','true');message('BlendTreeとClipを生成しています…');
    const fail=text=>{if(id!==job)return;stop();clearDownload();message(text,true);};
    worker.onerror=()=>fail('生成処理を開始できませんでした。ページを再読み込みして、もう一度お試しください。');
    worker.onmessageerror=()=>fail('生成結果を取得できませんでした。もう一度お試しください。');
    worker.onmessage=({data})=>{
      if(id!==job||data.id!==id)return;
      if(!data.ok){fail(data.error);return;}
      try{
        if(!(data.bytes instanceof Uint8Array)||data.treeCount!==16||data.clipCount!==30)throw new Error('生成結果の構成が一致しません。');
        stop();url=URL.createObjectURL(new Blob([data.bytes],{type:'application/octet-stream'}));
        download.href=url;download.download=data.fileName;
        summary.textContent=`Assets/${data.folderName} ／ BlendTree ${data.treeCount}個・内包Clip ${data.clipCount}個`;
        result.hidden=false;message(`${target} の生成が完了しました。`);
      }catch(error){stop();clearDownload();message(error.message,true);}
    };
    timer=setTimeout(()=>fail('生成が時間内に完了しませんでした。もう一度お試しください。'),30000);
    worker.postMessage({id,target});
  }catch(error){stop();clearDownload();message('このブラウザでは生成処理を開始できません。Web Worker対応のブラウザでお試しください。',true);}
});
window.addEventListener('pagehide',()=>{stop();clearDownload();});
