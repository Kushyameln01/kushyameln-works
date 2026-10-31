"""Negative admission runs stop before browser/model construction; anchors must fail closed."""
import argparse,copy,json,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--artifact',type=Path,required=True);p.add_argument('--local',type=Path,required=True);p.add_argument('--composed',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[2];artifact=json.loads(a.artifact.read_text());side=artifact['evidence']['side'];producer=root/('development/ai-connection/qkv-next/hidden-runtime/'+side.lower()+'-comparison.json');receipt=json.loads(producer.read_text());local=json.loads(a.local.read_text());composed=json.loads(a.composed.read_text());cases=[]
with tempfile.TemporaryDirectory(prefix='heads-negative-') as tmp:
 tmp=Path(tmp)
 def run(name,overrides,expected):
  paths={'artifact':a.artifact,'producer-receipt':producer,'local':a.local,'composed':a.composed}
  for key,value in overrides.items():path=tmp/(key+'.json');path.write_text(json.dumps(value));paths[key]=path
  cmd=['python',str(root/'tools/diffusion-models/head-browser.py'),'--model','/unread/not-a-model','--output',str(tmp/'must-not-be-produced.json')]
  for key,path in paths.items():cmd+=['--'+key,str(path)]
  completed=subprocess.run(cmd,cwd=root,text=True,capture_output=True);assert completed.returncode!=0 and expected in completed.stderr,(name,completed.stdout,completed.stderr);assert not (tmp/'must-not-be-produced.json').exists();cases.append({'name':name,'passed':True,'admissionFailure':completed.stderr.strip().splitlines()[-1],'beforeBrowserOrModel':True})
 changed=copy.deepcopy(artifact);changed['hidden'][0]+=1;run('actual artifact bit change',{'artifact':changed},'AssertionError')
 changed=copy.deepcopy(receipt);changed['passed']=False;run('failed producer cannot enter',{'producer-receipt':changed},'AssertionError')
 changed=copy.deepcopy(local);changed['gates']['projection']['abs']=1000;run('private local gate tamper',{'local':changed},'Reference hash mismatch')
 changed=copy.deepcopy(composed);changed['mode']='LOCAL_ACTUAL_HIDDEN';run('composed relabelled as local',{'composed':changed},'AssertionError')
report={'schemaVersion':'bernini-head-anchor-negative/0.1','passed':True,'cases':cases,'scope':'admission only; no original model opened, no browser or numerical proof'};a.out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'passed':True,'cases':len(cases)}))
