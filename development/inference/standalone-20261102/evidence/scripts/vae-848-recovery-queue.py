import json,os,subprocess,time,hashlib,psutil
from pathlib import Path
root=Path('/workspace/work/inference/p0-p2-20261031/worktree');source='dccb88515775ec8aa86dd16f82e8816c9347ed38'
state=Path('/tmp/kw-vae-848-recovery-queue-20261102.json');assert not state.exists()
r={'scope':'Only previously unstarted848-square source reference and actual WASM acceptance; earlier accepted F80 is not rerun. Controller stdout/stderr use durable file, not lost legacy transport.','executionSourceSha':source,'controllerPid':os.getpid(),'controllerCreationTime':psutil.Process().create_time(),'controllerSourceSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'status':'RUNNING','runs':[]}
def save():state.write_text(json.dumps(r,indent=2)+'\n')
save()
oracle='/tmp/kw-vae-ref-reference-f1-848x848-20261102';wasm='/tmp/kw-vae-wasm-reference-f1-848x848-20261102'
jobs=[(oracle,['python','tools/inference/vae/stream_reference.py','--case-id','reference-f1-848x848','--operation','both','--model','/workspace/work/models/vae/wan_2.1_vae.safetensors','--deps','/workspace/work/inference/vae-proof/deps','--memory-reserve-bytes','268435456','--execution-source-sha',source,'--output',oracle],True),(wasm,['python','tools/inference/vae/accept_stream.py','--bundle','/tmp/kw-vae-stream-threads4-20261102','--reference',oracle,'--operation','both','--timeout-seconds','14400','--execution-source-sha',source,'--output',wasm],False)]
try:
 for out,args,is_oracle in jobs:
  assert not Path(out).exists();log=Path(out+'-queue.log');assert not log.exists();item={'output':out,'command':args,'status':'RUNNING','log':str(log)};r['runs'].append(item);save();start=time.monotonic();env=os.environ.copy();env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',OPENBLAS_NUM_THREADS='2'if is_oracle else'1')
  with log.open('w')as f:
   p=subprocess.Popen(args,cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT);item.update(pid=p.pid,creationTime=psutil.Process(p.pid).create_time());save();code=p.wait()
  item.update(exitCode=code,elapsedSeconds=time.monotonic()-start,status='FINISHED'if code==0 else'FAILED');save()
  if code:r['status']='STOPPED_RUN_FAILED';save();raise SystemExit(code)
 r['status']='FINISHED';save()
except BaseException as error:
 if r['status']=='RUNNING':r.update(status='STOPPED_CONTROLLER_ERROR',error={'type':type(error).__name__,'message':str(error)});save()
 raise
