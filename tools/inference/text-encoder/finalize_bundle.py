"""Finalize exact UMT5 source/row-integrity/tokenizer contracts without large copies."""
import hashlib,json,struct,sys
from pathlib import Path
MODEL_SHA='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  while b:=f.read(16*1024*1024):h.update(b)
 return h.hexdigest()
def finalize(model,out,compact_proof=None):
 model=Path(model);out=Path(out);manifest=json.loads((out/'manifest.json').read_text());manifest['complete']=False;(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
 if sha(model)!=MODEL_SHA:raise ValueError('Original UMT5 whole-file SHA256 mismatch')
 with model.open('rb') as f:
  n=struct.unpack('<Q',f.read(8))[0];header=json.loads(f.read(n));entry=header['shared.weight'];assert entry['dtype']=='F16' and entry['shape']==[256384,4096]
  f.seek(8+n+entry['data_offsets'][0]);row_path=out/'embedding-row-sha256.bin'
  with row_path.open('wb') as hashes:
   for i in range(256384):
    row=f.read(8192)
    if len(row)!=8192:raise ValueError('Truncated original embedding row')
    hashes.write(hashlib.sha256(row).digest())
  sp=header['spiece_model'];assert sp['dtype']=='U8';a,b=sp['data_offsets'];f.seek(8+n+a);raw=f.read(b-a);tokenizer=out/'spiece.model';tokenizer.write_bytes(raw)
 def rec(p):return {'path':p.name,'bytes':p.stat().st_size,'sha256':sha(p)}
 manifest['embedding']['rowHashes']=rec(row_path);manifest['tokenizer']={**rec(tokenizer),'algorithm':'sentencepiece','addBos':False,'addEos':True,'eosId':1,'padId':0,'referenceMinTokens':512,'plainTextOnly':True,'emphasisCompatibility':'not claimed'}
 if manifest['tokenizer']['sha256']!='e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458':raise ValueError('Embedded tokenizer mismatch')
 manifest['originalSourceHashVerified']=True
 if compact_proof:
  proof=json.loads(Path(compact_proof).read_text())
  if not proof.get('pass') or proof['sourceSha256']!=manifest['sourceSha256']:raise ValueError('Invalid compaction evidence')
  manifest['trailingMaskCompaction']={'pass':True,'rule':'crop trailing mask0 only; preserve internal positions; final zero-pad to originallength','proof':proof}
 manifest['complete']=len(manifest['blocks'])==24 and all(b['nativePass'] for b in manifest['blocks']) and manifest.get('sourceKeysCovered')==412 and manifest.get('nativeFinalMaxAbsError',1)<=.001
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2));print('FINALIZED',manifest['complete'],flush=True)
 return manifest
if __name__=='__main__':finalize(sys.argv[1],sys.argv[2],sys.argv[3] if len(sys.argv)>3 else None)
