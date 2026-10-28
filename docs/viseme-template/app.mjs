import {createVisemeGenerator} from './client.mjs?registry=viseme-template-1';
import {validateMeshName} from './api.mjs';
const form=document.querySelector('#generator'),mesh=document.querySelector('#mesh');
const start=document.querySelector('#generate'),cancel=document.querySelector('#cancel');
const status=document.querySelector('#status'),result=document.querySelector('#result'),download=document.querySelector('#download');
let generator=null,revision=0,url=null;
function message(text,error=false){status.textContent=text;status.dataset.error=String(error);}
function clear(){if(url)URL.revokeObjectURL(url);url=null;download.removeAttribute('href');download.removeAttribute('download');result.hidden=true;}
function stop(){revision++;generator?.dispose();generator=null;start.disabled=false;cancel.hidden=true;form.setAttribute('aria-busy','false');}
mesh.addEventListener('input',()=>{stop();clear();mesh.removeAttribute('aria-invalid');message('');});
cancel.addEventListener('click',()=>{stop();clear();message('生成を取り消しました。');});
form.addEventListener('submit',async event=>{
  event.preventDefault();stop();clear();const current=revision,name=mesh.value;
  try{validateMeshName(name);}catch(error){mesh.setAttribute('aria-invalid','true');message(error.message,true);mesh.focus();return;}
  mesh.removeAttribute('aria-invalid');
  try{
    generator=createVisemeGenerator();start.disabled=true;cancel.hidden=false;form.setAttribute('aria-busy','true');message('生成しています…');
    const generated=await generator.generate(name,{inputRevision:current});
    if(current!==revision)return;
    stop();url=URL.createObjectURL(new Blob([generated.bytes],{type:'application/octet-stream'}));
    download.href=url;download.download=generated.fileName;result.hidden=false;message('生成しました。');
  }catch(error){if(current!==revision)return;stop();clear();message(error.message,true);}
});
window.addEventListener('pagehide',()=>{stop();clear();});
