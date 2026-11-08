// Form choices only. The existing SDK owns mapping, rank/alpha and F32 math.
export function readLoraSelections(root,readStrength){
 const mode=root.getElementById('lora-mode').value;
 if(!['selected','light','detail','none'].includes(mode))throw Object.assign(Error('LoRAの利用する組を選択してください。'),{code:'LORA_SELECTION_INVALID'});
 if(mode==='none')return {};
 const result={};
 for(const pairId of mode==='selected'?['light','detail']:[mode]){
  for(const side of ['HIGH','LOW']){
   const id='lora-'+pairId+'-'+side.toLowerCase(),file=root.getElementById(id).files[0];
   if(file)(result[pairId]??={})[side]={file,strength:readStrength(id+'-strength')};
  }
 }
 if(mode!=='selected'&&!result[mode])throw Object.assign(Error(mode+'の使用するsideのFileを選択してください。'),{code:'LORA_FILE_REQUIRED'});
 return result;
}
