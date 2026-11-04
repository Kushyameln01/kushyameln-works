"""One-shot diagnostic continuation of the frozen public HIGH run.

Default/check-only uses stdlib only. Numerical work is reachable only after an
explicit --watch, complete native/outer cleanup admission and a durable claim.
No ordinary model API receives these receipts, references or error gates.
"""
import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import subprocess
import sys
import tempfile
import time

SOURCE_COMMIT='6cda0a686d30a4bd748909fc56c61c1acece7bfb'
CONTRACT='development/ai-connection/d1-d4-production-20261102/reference/full-declared-preexecution.json'
CONTRACT_ID={'bytes':2615,'sha256':'1943f1a528580ae5f7055342cb1c117131592ca776ed655c3a9a81caadefb8d3'}
MANIFEST_ID={'bytes':82481,'sha256':'7c1545413898de4c18cee2ed19dbec9f8abe61cfed7b48ee0954d33f0206c6b6'}
REFERENCE='tools/diffusion-models/production-reference.py'
COMPARATOR='tools/diffusion-models/compare-public-model.py'
OBSERVER='tools/diffusion-models/observe-process-run.py'
SOURCE_HASHES={
 'tools/diffusion-models/production-reference.py':'9d3faad4db7db710a6341bca24e541d898dd7b0dd4d68b8ed0bccd2df07d1ce8',
 'tools/diffusion-models/standalone-reference.py':'6f81afa662f444d0f207a91a5b3778f77c88e4a99e05748221b1ddbfece35c2f',
 'tools/diffusion-models/standalone-sampler-reference.py':'65c9970d79777875de85d9bd198ca7954a28127aec710f2bdc59448537279bae',
 'development/ai-connection/profile-adoption/p4/core-source/comfy/ldm/wan/model.py':'17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699',
 'docs/shared/ai-connection/workflow-shapes.mjs':'7a78955fd8156e0b3a5b287ad5f712ff04d62dbb6e501952bc52f9696e9dd821',
}
SHAPE=[1,16,21,60,104]
TOTAL,TARGET,CONTEXT,ELEMENTS,PREDICTION_ROWS=73947,32760,41187,2096640,20160
PROFILE='bernini-declared-target81-source81-ref3-848-l512-f32-chunks-v1'
TEXT_MODEL='c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
TOKENIZER='e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'
TEXT_BYTES=8388608
TEXT_PAYLOAD_SHA='107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7'
MASK_SHA='19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62'
GATE={'abs':.01,'rel':.001}
SCOPES={'lowPredictAccepted':False,'sixUpdatesAccepted':False,'rawGeneratedSampleSaveAccepted':False,'originalSizeOneThreadAccepted':False,'generationReady':False,'wholeOperationAccepted':False,'counterpartACK':False,'originalWorkflowAccepted':False,'originalMxfp8EquivalenceAccepted':False}
MAX_JSON=128*1024*1024


@dataclass(frozen=True)
class Paths:
    state_dir:Path
    root:Path=Path('/tmp/diffusion-public-execution-20261104')
    native:Path=Path('/tmp/diffusion-original-high-public-20261104.json')
    native_resources:Path=Path('/tmp/diffusion-original-high-public-resources-20261104.json')
    manifest:Path=Path('/tmp/d1-d4-production-73947-inputs/inputs.json')
    native_private:Path=Path('/tmp/diffusion-original-high-public-20261104/private')
    models:Path=Path('/workspace/work/retained/bernini')
    claim:Path=Path('/tmp/diffusion-original-high-public-20261104/validation-continuation-claim.json')
    @property
    def contract(self):return self.root/CONTRACT
    @property
    def reference_dir(self):return self.state_dir/'reference'


class Blocked(ValueError):pass
class Waiting(ValueError):pass
class InterruptedSignal(KeyboardInterrupt):pass
def require(condition,message):
    if not condition:raise Blocked(message)
def utc():return datetime.now(timezone.utc).isoformat()
def digest(raw):return hashlib.sha256(raw).hexdigest()
def identity(raw):return {'bytes':len(raw),'sha256':digest(raw)}
def file_stat(path):
    value=Path(path).stat()
    return {key:getattr(value,key) for key in ['st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns']}
def file_identity(path):
    path=Path(path)
    require(path.is_file() and not path.is_symlink(),'Regular unchanged file required: '+str(path))
    before=file_stat(path);value=hashlib.sha256();count=0
    with path.open('rb') as stream:
        while raw:=stream.read(1048576):value.update(raw);count+=len(raw)
    require(file_stat(path)==before,'File changed during identity check: '+str(path))
    return {'bytes':count,'sha256':value.hexdigest()}
def unique(pairs):
    result={}
    for key,value in pairs:
        require(key not in result,'Duplicate JSON field: '+key);result[key]=value
    return result
def decode(raw):
    return json.loads(raw,object_pairs_hook=unique,parse_constant=lambda _:(_ for _ in ()).throw(Blocked('Nonfinite JSON constant')))
def read_json(path,*,pending=False):
    try:
        require(not Path(path).is_symlink(),'Receipt symlink rejected: '+str(path))
        with Path(path).open('rb') as stream:raw=stream.read(MAX_JSON+1)
    except FileNotFoundError:
        if pending:raise Waiting('Receipt not created: '+str(path))
        raise Blocked('Required file missing: '+str(path))
    require(len(raw)<=MAX_JSON,'Receipt exceeds bounded JSON size: '+str(path))
    if not raw and pending:raise Waiting('Receipt reserved but empty: '+str(path))
    try:value=decode(raw)
    except (json.JSONDecodeError,UnicodeDecodeError) as error:
        if pending:raise Waiting('Receipt JSON is incomplete: '+str(path)) from error
        raise Blocked('Invalid JSON: '+str(path)) from error
    require(isinstance(value,dict),'JSON object required: '+str(path))
    return value,identity(raw)
def declared(value):
    require(isinstance(value,dict) and type(value.get('bytes')) is int and value['bytes']>0 and isinstance(value.get('sha256'),str) and re.fullmatch('[0-9a-f]{64}',value['sha256']),'Complete byte/SHA256 identity required')
    return {'bytes':value['bytes'],'sha256':value['sha256']}
def git_bytes(root,*args):return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL)
def fixed_file(paths,name,expected=None):
    require(isinstance(name,str) and not name.startswith('/') and '..' not in Path(name).parts,'Unsafe fixed source path')
    raw=(paths.root/name).read_bytes()
    require(raw==git_bytes(paths.root,'show',SOURCE_COMMIT+':'+name),'Dirty frozen source: '+name)
    if expected is not None:require(identity(raw)==expected,'Frozen source identity differs: '+name)
    return identity(raw)


def check_static(paths):
    require(git_bytes(paths.root,'rev-parse','HEAD').decode().strip()==SOURCE_COMMIT,'Frozen HEAD differs from6cda source')
    git_bytes(paths.root,'diff','--quiet','HEAD','--')
    contract_raw=paths.contract.read_bytes();manifest_raw=paths.manifest.read_bytes()
    require(identity(contract_raw)==CONTRACT_ID,'Full pre-execution contract bytes/SHA256 differ')
    require(identity(manifest_raw)==MANIFEST_ID,'Full native input manifest bytes/SHA256 differ')
    fixed_file(paths,CONTRACT,CONTRACT_ID)
    contract,manifest=decode(contract_raw),decode(manifest_raw)
    require(contract.get('sourceSHA256')==SOURCE_HASHES and contract.get('manifestSHA256')==MANIFEST_ID['sha256'] and contract.get('gate')==GATE and contract.get('status')=='PRE_EXECUTION_GATE_FIXED' and contract.get('gateMayNotBeRelaxedAfterComparison') is True,'Fixed contract source/input/gate admission differs')
    require(contract.get('totalTokens')==TOTAL and contract.get('textRows')==512 and contract.get('profileId')==PROFILE,'Full reference contract population differs')
    require(manifest.get('profileId')==PROFILE and manifest.get('side')=='HIGH' and type(manifest.get('timestep')) in [int,float] and manifest['timestep']==1000,'Exact HIGH timestep1000 manifest required')
    require(manifest['tensors'][0]['shape']==SHAPE and manifest['canonicalShape']['target']['initialLatentShape']==SHAPE and manifest['canonicalShape']['concatenation']['totalTokens']==TOTAL,'Full target/context shape differs')
    require(manifest['canonicalShape']['concatenation']['order']==['target','source','context:0:0','context:1:0','context:2:0'],'Full target/source/three-slot order differs')
    sources={name:fixed_file(paths,name,{'bytes':(paths.root/name).stat().st_size,'sha256':sha}) for name,sha in SOURCE_HASHES.items()}
    for name in [REFERENCE,COMPARATOR,OBSERVER]:sources[name]=fixed_file(paths,name)
    return {'sourceCommit':SOURCE_COMMIT,'contract':CONTRACT_ID,'manifest':MANIFEST_ID,'sources':sources},manifest,contract


def check_outer(resource,observer_sha):
    require(resource.get('schemaVersion')=='bernini-gated-process-tree-observation/1','Outer observer schema differs')
    require(resource.get('monitorSourceSHA256')==observer_sha,'Outer observer source differs')
    for key in ['childExitCode','error','signalReceived']:
        if key not in resource:raise Waiting('Outer terminal field not yet present: '+key)
    require(type(resource['childExitCode']) is int and resource['childExitCode']==0 and resource['error'] is None and resource['signalReceived'] is None,'Outer process failed or was signalled')
    require(resource.get('gateInstalledBeforeCommandExec') is True and resource.get('totalSamples',0)>0 and isinstance(resource.get('observedPeakPssSumBytes'),(int,float)),'Before-exec/PSS observation missing')
    rows=resource.get('observations',[])
    if not rows or rows[-1].get('phase')!='post-command-cleanup-observation':raise Waiting('Outer post-command cleanup observation not complete')
    end=rows[-1]
    require(resource.get('postCleanupObservationSeconds',0)>0 and end.get('rootPresent') is False,'Outer command root did not finish cleanup')
    require(isinstance(end.get('processes'),list),'Outer final process population missing')
    require(all(p.get('state') in ['Z','X'] and p.get('rssBytes')==0 and p.get('pssBytes') in [None,0] for p in end['processes']),'Live descendant remains after outer cleanup')
    before=resource.get('sharedCgroupBeforeChildLaunch',{}).get('memory.events',{})
    after=end.get('sharedCgroup',{}).get('memory.events',{})
    for key in ['oom','oom_kill']:
        if key in before and key in after:require(after[key]==before[key],'New cgroup '+key+' during execution')


def check_owner(owner):
    require(owner.get('disposed') is True and owner.get('busy') is False and owner.get('closing') is False,'Native model owner is not disposed')
    for key in ['activeHiddenStores','activeHiddenStoreBytes','stageWeightCacheBytes']:require(owner.get(key)==0,'Native owner still holds '+key)
    require(owner.get('lastFailure') is None,'Native owner recorded failure')
    require(owner.get('head') is None,'Native head cache remains')
    math=owner['math'];source=owner['source']
    require(math.get('disposed') is True and math.get('busy') is False and math.get('memoryBytes')==0,'Native math owner still holds storage')
    require(source.get('disposed') is True and source.get('busy') is False and source.get('cachedBytes')==0,'Native weight source still holds storage')
    ops=owner['ops']
    require(ops.get('disposed') is True and ops.get('busy') is False and ops.get('cleanupPending') is False,'Native operator cleanup pending')
    for key in ['pendingTensors','preparedWeights','preparedWeightBytes']:require(ops.get(key)==0,'Native operator still holds '+key)
    for name,keys in [('attentionQueries',['ownedTensors','ownedQueryCount','currentCpuTensorSpanBytes']),('preparedAttentionKV',['ownedPairs','currentBytes','activeLeases'])]:
        require(ops[name].get('cleanupPending') is False and all(ops[name].get(key)==0 for key in keys),'Native '+name+' cleanup incomplete')


def check_native(native,manifest,contract):
    require(native.get('schemaVersion')=='bernini-public-model-worker-host/0.1','Native terminal receipt schema differs')
    if 'passed' not in native:raise Waiting('Native terminal passed field not present')
    require(native['passed'] is True,'Native prediction failed')
    require(native.get('sourceCommit')==SOURCE_COMMIT and native.get('sourceGuardAfter') is True and native.get('sourceGuardError') is None and native.get('hostError') is None,'Native source/host guard failed')
    require(native.get('mode')=='predict' and native.get('side')=='HIGH' and native.get('timestep')==1000,'Native operation/side/timestep differs')
    resource=native['requestedResource'];require(resource.get('wasmThreads')==4 and resource.get('coi') is True,'Native4/COI profile differs')
    require(native['inputReceipt'].get('manifestSHA256')==MANIFEST_ID['sha256'] and native['inputReceipt'].get('profileId')==PROFILE,'Native full input manifest differs')
    require(native['browser'].get('closed') is True and not native['browser'].get('pageErrors') and not native['browser'].get('consoleErrors') and not native.get('deniedPaths'),'Native browser did not close cleanly')
    public=native['publicResult']
    require(public.get('sourceCommit')==SOURCE_COMMIT and public.get('publicWorkerConnected') is True and public.get('mode')=='predict' and public.get('side')=='HIGH' and public.get('timestep')==1000 and public.get('profileId')==PROFILE,'Public operation/source/profile differs')
    require(public.get('outcome')=='completed' and public.get('error') is None and all(public.get(k) is None for k in ['timeout','statusError','cleanupError']),'Public prediction/cleanup failed')
    require(public.get('callerInputsBitExact') is True and public.get('inputIdentitiesBefore')==public.get('inputIdentitiesAfter'),'Caller input bits changed')
    execution=public['execution'];require(execution.get('operation')=='predict' and execution.get('publicWorkerConnected') is True,'Normal public execution evidence missing')
    require(execution.get('effectiveWeights',{}).get('HIGH')=={'epoch':0,'packageHash':None},'Native run is not the declared base-only HIGH case')
    if 'unload' not in public or 'disposed' not in public:raise Waiting('Native unload/dispose terminal evidence not present')
    unload=public['unload'];require(unload.get('unloaded') is True and public.get('disposed') is True and public.get('afterDisposeCode')=='DISPOSED' and public.get('workerObserverRestored') is True,'Native unload/dispose failed')
    lifetimes=public.get('workerLifetimes',[])
    constructed={x.get('workerEpoch') for x in lifetimes if x.get('stage')=='constructed'}
    ended={x.get('workerEpoch') for x in lifetimes if x.get('stage')=='terminated'}
    require(constructed and constructed<=ended,'Native Worker termination not confirmed')
    resources=unload['resources']
    require(resources.get('disposed') is True and resources.get('busy') is False and resources.get('closing') is False and resources.get('failedOperations')==0,'Native shared owner cleanup failed')
    for side in ['HIGH','LOW']:
        check_owner(resources['models'][side]);feed=resources['weightFeeds'][side]
        require(feed.get('disposed') is True and feed.get('closing') is False and feed.get('epoch')==0 and feed.get('activePackageHash') is None and all(feed.get(k)==0 for k in ['candidates','readLeases','operationLeases','inFlight','cleanupPending']),'Native weight-feed ownership remains: '+side)
        model=contract['models'][side];loaded=public['loaded']['models'][side]
        require(loaded.get('side')==side and loaded.get('modelSha256')==model['previouslyVerifiedSHA256'] and loaded.get('headerSHA256')==model['headerSHA256'],'Native retained model/header identity differs: '+side)
    evidence=resources['models']['HIGH']['lastRun']
    for key,value in {'blockCount':40,'blocksCompleted':40,'totalTokens':TOTAL,'headRows':TOTAL,'targetTokens':TARGET,'writtenTargetRows':TARGET,'contextTokens':CONTEXT,'textRows':512}.items():require(evidence.get(key)==value,'Native complete all40/head/target-unpatch evidence missing: '+key)
    require(evidence.get('timings',{}).get('firstFailure') is None,'Native numerical stage failure recorded')
    metadata=public['tensorMetadata'];expected={'dtype':'float32','shape':SHAPE,'layout':'NCTHW','meaning':'bernini-flow-velocity:v1','modelSha256':contract['models']['HIGH']['previouslyVerifiedSHA256']}
    require(metadata==expected and public.get('codecScope')=='Actual normal predict output','Normal velocity tensor semantics differ')
    rb=public['readback'];require(rb.get('realDiskFileSelected') is True and rb.get('allF32BitsExact') is True and rb.get('payloadElements')==ELEMENTS and rb.get('metadata')==metadata and public['codec'].get('metadata')==metadata,'Actual canonical File bit/metadata readback incomplete')
    raw=declared(public['outputIdentity']);canonical={'bytes':public['codec']['byteLength'],'sha256':public['codec']['sha256']}
    require(raw['bytes']==ELEMENTS*4 and declared(public['savedPayload'])==raw and declared(rb['payload'])==raw and declared(native['privateOutputs']['tensor.f32'])==raw,'Native raw velocity identity chain differs')
    require(declared(public['savedCanonical'])==canonical==declared(native['privateOutputs']['tensor.wktensor']) and rb.get('byteLength')==canonical['bytes'] and rb.get('sha256')==canonical['sha256'],'Native canonical file identity chain differs')
    return {'completion':{k:evidence[k] for k in ['blockCount','blocksCompleted','totalTokens','headRows','targetTokens','writtenTargetRows','contextTokens','textRows']},'raw':raw,'canonical':canonical}


def check_payloads(paths,manifest,contract,native,outputs):
    values={}
    for tensor in [*manifest['tensors'],manifest['initialEmptyTarget'],manifest['explicitNoise']]:
        path=Path(tensor['path']);expected=declared(tensor)
        require(file_identity(path)==expected,'Saved latent input identity differs: '+str(path));values[str(path)]=expected
    public_inputs=native['publicResult']['inputIdentitiesBefore']
    expected_tensors=[{'requirementId':value['requirementId'],**declared(value)} for value in manifest['tensors']]
    actual_tensors=[{'requirementId':value['requirementId'],**declared(value)} for value in public_inputs.get('tensors',[])]
    require(actual_tensors==expected_tensors,'Native ordered latent payload identities differ from manifest')
    require(declared(public_inputs.get('noise'))==declared(manifest['explicitNoise']) and declared(public_inputs.get('initialEmptyTarget'))==declared(manifest['initialEmptyTarget']),'Native noise/initial-empty-target identities differ from manifest')
    text=manifest['conditioning'];meta=text['metadata']
    require(meta.get('shape')==[1,512,4096] and meta.get('modelSha256')==TEXT_MODEL and meta.get('tokenizerSha256')==TOKENIZER and meta.get('normalization')=='umt5-final-rmsnorm-f32-v1','Full512 Text semantics differ')
    expected_text={'bytes':TEXT_BYTES,'sha256':TEXT_PAYLOAD_SHA};expected_mask={'bytes':512,'sha256':MASK_SHA}
    require(text.get('payloadSHA256')==TEXT_PAYLOAD_SHA and text.get('maskSHA256')==MASK_SHA and file_identity(text['payloadPath'])==expected_text and file_identity(text['maskPath'])==expected_mask,'Retained Text payload/mask identity differs')
    require(list(Path(text['maskPath']).read_bytes())==meta['attentionMask'],'Text mask metadata differs')
    native_text=native['inputReceipt']['conditioning']
    for key,value in {'shape':[1,512,4096],'modelSha256':TEXT_MODEL,'tokenizerSha256':TOKENIZER,'normalization':'umt5-final-rmsnorm-f32-v1','payloadSHA256':TEXT_PAYLOAD_SHA,'maskSHA256':MASK_SHA}.items():require(native_text.get(key)==value,'Native input Text identity differs: '+key)
    for branch in ['positive','negative']:
        value=native['publicResult']['inputIdentitiesBefore'][branch]
        require(declared(value)==expected_text and declared(value['mask'])==expected_mask,'Public full512 Text/mask identity differs: '+branch)
    for side in ['HIGH','LOW']:
        model=contract['models'][side];path=paths.models/model['fileName']
        require(file_stat(path)==native['modelStatBefore'][side] and path.stat().st_size==model['bytes'],'Retained original model stat changed: '+side)
    for name,expected in [('tensor.f32',outputs['raw']),('tensor.wktensor',outputs['canonical'])]:require(file_identity(paths.native_private/name)==expected,'Actual persisted output identity differs: '+name)
    inventory=native.get('sourceInventory');require(isinstance(inventory,dict) and inventory,'Native frozen source inventory missing')
    for name,expected in inventory.items():fixed_file(paths,name,declared(expected))
    return {'latents':values,'text':expected_text,'mask':expected_mask,'raw':outputs['raw'],'canonical':outputs['canonical']}


def assess(paths):
    report={'schemaVersion':'diffusion-public-high-continuation/1','observedAtUTC':utc(),'status':'WAIT','heavyWorkStarted':False,'sourceCommit':SOURCE_COMMIT,'watcher':file_identity(__file__),'scope':'Declared original-size HIGH4/COI predict only',**SCOPES}
    try:
        sources,manifest,contract=check_static(paths);report['fixed']=sources
        native,native_id=read_json(paths.native,pending=True)
        outputs=check_native(native,manifest,contract)
        resource,resource_id=read_json(paths.native_resources,pending=True)
        check_outer(resource,sources['sources'][OBSERVER]['sha256'])
        seal=check_payloads(paths,manifest,contract,native,outputs)
        report.update(status='READY',reason='Complete native terminal, File identities and outer cleanup admitted; check-only launches nothing',nativeReceipt=native_id,nativeResourceReceipt=resource_id,completion=outputs['completion'],identitySeal=seal)
    except Waiting as error:report.update(status='WAIT',reason=str(error))
    except (Blocked,OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as error:report.update(status='BLOCKED',reason=str(error),errorType=type(error).__name__)
    return report


def private_dir(path):
    path=Path(path).absolute()
    require(path.is_relative_to(Path('/tmp')) or path.is_relative_to(Path(tempfile.gettempdir()).absolute()),'State must use private temporary storage outside Git')
    for parent in [path,*path.parents]:
        marker=parent/'.git'
        require(not parent.is_symlink() and not (marker.is_file() or marker.is_dir() and (marker/'HEAD').exists()),'State path inside Git or through symlink')
    path.mkdir(mode=0o700,parents=True,exist_ok=True)
    require(stat.S_IMODE(path.stat().st_mode)==0o700 and path.stat().st_uid==os.getuid(),'Private state directory must be owned and mode0700')
    return path
def atomic_json(path,value):
    path=Path(path);private_dir(path.parent)
    require(not path.is_symlink(),'State symlink rejected')
    with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False,encoding='utf8') as stream:
        temporary=Path(stream.name);json.dump(value,stream,indent=2,allow_nan=False);stream.write('\n');stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)
def record(paths,event,*,phase=False):
    value={'observedAtUTC':utc(),**SCOPES,**event}
    if phase:atomic_json(paths.state_dir/'run.json',value)
    elif paths.claim.exists():
        claim,_=read_json(paths.claim)
        run_path=Path(claim['stateDir'])/'run.json'
        run,_=read_json(run_path,pending=True) if run_path.exists() else ({'status':'CLAIMED_REVIEW_REQUIRED','heavyWorkStarted':True},None)
        value.update(assessmentStatus=value.get('status'),status=run['status'],heavyWorkStarted=True,existingContinuation={'stateDir':claim['stateDir'],'status':run['status'],'liveChildObligation':run.get('liveChildObligation')})
    atomic_json(paths.state_dir/'state.json',value)
    descriptor=os.open(paths.state_dir/'events.jsonl',os.O_WRONLY|os.O_APPEND|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'a') as stream:stream.write(json.dumps(value,sort_keys=True,allow_nan=False)+'\n')
    print(json.dumps({'status':value.get('status'),'reason':value.get('reason'),'observedAtUTC':value['observedAtUTC']},allow_nan=False),flush=True)
    return value


def command_plan(paths):
    reference_args=['execute-reference','--manifest',str(paths.manifest),'--contract',str(paths.contract),'--models',str(paths.models),'--private-dir',str(paths.reference_dir),'--receipt',str(paths.state_dir/'reference-receipt.json'),'--operation','predict','--side','HIGH','--allow-full-shape']
    launcher=[sys.executable,str(Path(__file__).resolve()),'--watch','--_reference-launcher','--state-dir',str(paths.state_dir)]
    reference=[sys.executable,str(paths.root/OBSERVER),'--output',str(paths.state_dir/'reference-resources.json'),'--interval','2','--post-cleanup-seconds','3','--max-observations','1800','--',*launcher]
    comparison=[sys.executable,str(paths.root/COMPARATOR),'--native-receipt',str(paths.native),'--actual-f32',str(paths.native_private/'tensor.f32'),'--reference',str(paths.reference_dir/'reference.json'),'--reference-manifest',str(paths.manifest),'--contract',str(paths.contract),'--source-commit',SOURCE_COMMIT,'--reference-source-commit',SOURCE_COMMIT,'--output',str(paths.state_dir/'comparison.json')]
    return {'reference':reference,'referenceOriginalScript':[str(paths.root/REFERENCE),*reference_args],'comparison':comparison}
def check_comparison_command(paths,command):
    expected=command_plan(paths)['comparison']
    require(command==expected,'Comparator must receive explicit FULL contract, same manifest and actual native/reference source commits')
def check_reference_coverage(metrics):
    require(isinstance(metrics,list) and len(metrics)==1 and metrics[0].get('side')=='HIGH' and metrics[0].get('totalTokens')==TOTAL,'Complete single HIGH independent reference required')
    coverage=metrics[0].get('coverage',[])
    for block,name,rows in [(b,'blockOutput',TOTAL) for b in range(40)]+[(None,'headAll',TOTAL),(None,'prediction',PREDICTION_ROWS)]:
        selected=[v for v in coverage if v.get('block')==block and v.get('name')==name]
        require(len(selected)==1 and selected[0].get('rows')==rows and selected[0].get('intervals')==[[0,rows]],'Independent all40/head/target-tail coverage missing: '+str(block)+':'+name)
def check_reference(paths):
    ref,ref_id=read_json(paths.reference_dir/'reference.json')
    require(ref.get('schemaVersion')=='bernini-production-independent-reference/1' and ref.get('operation')=='predict' and ref.get('actualNativeOutputsUsedAsNumericInput') is False and ref.get('manifestSHA256')==MANIFEST_ID['sha256'] and ref.get('contractSHA256')==CONTRACT_ID['sha256'] and ref.get('profileId')==PROFILE and ref.get('gate')==GATE and ref.get('allTextRows')==512,'Independent reference identity/scope/gate differs')
    check_reference_coverage(ref.get('metrics'))
    require(set(ref.get('arrays',{}))=={'velocity'},'Only complete independent velocity output is expected')
    output=ref['arrays']['velocity'];require(output.get('shape')==SHAPE and declared(output)['bytes']==ELEMENTS*4,'Independent velocity output extent differs')
    require(Path(output['path']).resolve()==(paths.reference_dir/'velocity.f32').resolve() and file_identity(output['path'])==declared(output),'Independent velocity file identity differs')
    for name in ['reference-x.f32','reference-k.f32','reference-v.f32']:require(not (paths.reference_dir/'prediction-0'/name).exists(),'Independent backing file remains after reference exit')
    resources,_=read_json(paths.state_dir/'reference-resources.json');check_outer(resources,file_identity(paths.root/OBSERVER)['sha256'])
    for name in ['blas-before.json','blas-after.json']:
        blas,_=read_json(paths.state_dir/name)
        require(blas.get('requestedThreads')==1 and blas.get('blasPools') and all(p.get('num_threads')==1 for p in blas['blasPools']),'Actual independent BLAS1 observation missing')
    return ref_id
def check_comparison(paths,admission,reference_id):
    value,value_id=read_json(paths.state_dir/'comparison.json');comparison=value.get('comparison',{})
    require(value.get('schemaVersion')=='bernini-public-model-independent-comparison/1' and value.get('passed') is True and value.get('sourceCommit')==SOURCE_COMMIT and value.get('mode')=='predict' and value.get('array')=='velocity' and value.get('manifestSHA256')==MANIFEST_ID['sha256'] and value.get('shape')==SHAPE and value.get('referenceExecution',{}).get('sourceCommit')==SOURCE_COMMIT,'Comparator did not admit exact HIGH prediction')
    require(comparison.get('failedElements')==0 and comparison.get('allElementsCompared') is True and comparison.get('elements')==ELEMENTS and comparison.get('gate')==GATE,'Comparator did not pass every target value under the fixed gate')
    require(value.get('identities',{}).get('referenceManifest')==MANIFEST_ID and value.get('identities',{}).get('contract')==CONTRACT_ID,'Comparator full manifest/contract receipt differs')
    require(value.get('identities',{}).get('nativeReceipt')==admission['nativeReceipt'] and value.get('identities',{}).get('reference')==reference_id,'Comparator used different native/reference receipt bytes')
    reference,_=read_json(paths.reference_dir/'reference.json')
    require(value.get('actual')==admission['identitySeal']['raw'] and value.get('expected')==declared(reference['arrays']['velocity']),'Comparator output identity differs from admitted files')
    return value_id


def owned_live_processes(group):
    values=[]
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():continue
        try:
            fields=(path/'stat').read_text().rsplit(')',1)[1].split()
            if int(fields[2])==group and int(fields[3])==group and fields[0] not in ['Z','X']:values.append({'pid':int(path.name),'state':fields[0]})
        except (OSError,ValueError,IndexError):continue
    return values


def stop_owned_group(child):
    """Only Popen(start_new_session=True)'s new session/group is signalled."""
    errors=[];reaped=False
    def send(number):
        try:os.killpg(child.pid,number)
        except ProcessLookupError:pass
        except OSError as error:errors.append({'signal':number,'error':str(error)})
    send(signal.SIGTERM)
    try:child.wait(timeout=30);reaped=True
    except subprocess.TimeoutExpired:pass
    live=owned_live_processes(child.pid)
    if not reaped or live:
        send(signal.SIGKILL)
        try:child.wait(timeout=10);reaped=True
        except subprocess.TimeoutExpired:pass
        live=owned_live_processes(child.pid)
    if not reaped or live:return {'rootPid':child.pid,'ownedProcessGroup':child.pid,'ownedGroupCreatedByWatcher':True,'rootReaped':reaped,'liveProcesses':live,'errors':errors}
    return None


def run_command(command,*,cwd,log,env,on_running,on_cleanup=lambda _:None):
    descriptor=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'w') as stream:
        child=None;pending_signal=None
        previous={number:signal.getsignal(number) for number in [signal.SIGTERM,signal.SIGINT]}
        def interrupt(number,_frame):
            nonlocal pending_signal
            pending_signal=number  # Never raise while Popen is registering its child.
        def interrupted():
            if pending_signal is not None:raise InterruptedSignal('Watcher interrupted by signal '+str(pending_signal))
        try:
            for number in previous:signal.signal(number,interrupt)
            interrupted()
            child=subprocess.Popen(command,cwd=cwd,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
            interrupted()
            while True:
                interrupted()
                try:
                    code=child.wait(timeout=30)
                    interrupted()
                    require(not owned_live_processes(child.pid),'Owned observer exited with a live descendant; cleanup required')
                    interrupted()
                    return code
                except subprocess.TimeoutExpired:
                    interrupted();on_running(child.pid)
        except BaseException:
            # Keep the watcher/instance lock alive while an owned child remains.
            # The durable claim additionally survives a hard kill of this watcher.
            if child is not None:
                for number in previous:signal.signal(number,signal.SIG_IGN)
                obligation=stop_owned_group(child)
                while obligation is not None:
                    try:on_cleanup(obligation)
                    except Exception as error:
                        # A full/broken log must not release a still-live child.
                        try:
                            sys.stderr.write(json.dumps({'status':'BLOCKED_CHILD_CLEANUP_PENDING','liveChildObligation':obligation,'stateWriteError':str(error)})+'\n');sys.stderr.flush()
                        except Exception:pass
                    time.sleep(30)
                    obligation=stop_owned_group(child)
                on_cleanup(None)
            raise
        finally:
            for number,handler in previous.items():signal.signal(number,handler)


def execute_ready(paths,admission,*,runner=run_command,watcher_identity=None):
    private_dir(paths.state_dir)
    result={'schemaVersion':'diffusion-public-high-continuation/1','status':'BLOCKED','heavyWorkStarted':False,'sourceCommit':SOURCE_COMMIT,**SCOPES}
    try:
        current=assess(paths);require(current['status']=='READY' and current=={**admission,'observedAtUTC':current['observedAtUTC']},'Readiness changed before one-shot continuation')
        current_watcher=file_identity(__file__)
        require(watcher_identity is None or current_watcher==watcher_identity,'Watcher bytes changed after arming')
        private_dir(paths.claim.parent)
        require(not paths.claim.exists(),'A continuation was already claimed; never auto-retry heavy reference')
        for name in ['reference-resources.json','reference-receipt.json','reference.log','comparison.json','comparison.log','blas-before.json','blas-after.json']:require(not (paths.state_dir/name).exists(),'Old continuation output footprint exists: '+name)
        paths.reference_dir.mkdir(mode=0o700)  # Exclusive fresh reservation before NN.
        token=secrets.token_hex(32)
        claim={'startedAtUTC':utc(),'stateDir':str(paths.state_dir),'sourceCommit':SOURCE_COMMIT,'tokenSHA256':digest(token.encode()),'watcher':current_watcher,'admission':admission}
        try:descriptor=os.open(paths.claim,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        except FileExistsError:raise Blocked('A continuation was already claimed; never auto-retry heavy reference')
        with os.fdopen(descriptor,'w') as stream:json.dump(claim,stream,indent=2);stream.flush();os.fsync(stream.fileno())
        commands=command_plan(paths);check_comparison_command(paths,commands['comparison'])
        atomic_json(paths.state_dir/'commands.json',{'cwd':str(paths.root),'commands':commands,'watcher':claim['watcher'],'sourceCommit':SOURCE_COMMIT,'admission':admission,**SCOPES})
        result['heavyWorkStarted']=True
        record(paths,{**result,'status':'REFERENCE_RUNNING','reason':'Native and outer cleanup passed; one-shot BLAS1 reference started'},phase=True)
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1','CONTINUE_PUBLIC_HIGH_TOKEN':token}
        def cleanup(obligation):record(paths,{**result,'status':'BLOCKED_CHILD_CLEANUP_PENDING' if obligation else 'BLOCKED_CHILD_CLEANUP_FINISHED','reason':'Interrupted owned process group cleanup; launch claim retained','liveChildObligation':obligation},phase=True)
        code=runner(commands['reference'],cwd=paths.root,log=paths.state_dir/'reference.log',env=env,on_running=lambda pid:record(paths,{**result,'status':'REFERENCE_RUNNING','reason':'Original reference process remains active','observerPid':pid},phase=True),on_cleanup=cleanup)
        require(code==0,'Independent reference/outer process failed; comparator not started')
        reference_id=check_reference(paths)
        after=assess(paths);require(after['status']=='READY' and after['identitySeal']==admission['identitySeal'] and after['fixed']==admission['fixed'] and after['nativeReceipt']==admission['nativeReceipt'] and after['nativeResourceReceipt']==admission['nativeResourceReceipt'],'Frozen source/native/input identities changed during reference')
        require(file_identity(__file__)==claim['watcher'],'Watcher bytes changed during reference')
        check_comparison_command(paths,commands['comparison'])
        record(paths,{**result,'status':'COMPARISON_RUNNING','reason':'Complete independent reference and cleanup passed','referenceReceipt':reference_id},phase=True)
        code=runner(commands['comparison'],cwd=paths.root,log=paths.state_dir/'comparison.log',env=env,on_running=lambda pid:record(paths,{**result,'status':'COMPARISON_RUNNING','reason':'Bounded offline comparison active','comparisonPid':pid},phase=True),on_cleanup=cleanup)
        require(code==0,'Offline comparator process failed')
        comparison_id=check_comparison(paths,admission,reference_id)
        final=assess(paths)
        require(final['status']=='READY' and final['identitySeal']==admission['identitySeal'] and final['fixed']==admission['fixed'] and final['nativeReceipt']==admission['nativeReceipt'] and final['nativeResourceReceipt']==admission['nativeResourceReceipt'] and file_identity(__file__)==claim['watcher'],'Frozen source/input/output changed during comparison')
        result.update(status='HIGH_PREDICT_COMPARISON_PASSED',reason='Only the declared HIGH4/COI complete prediction passed independent comparison',highPredictAccepted=True,referenceReceipt=reference_id,comparisonReceipt=comparison_id)
    except (Blocked,Waiting,OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError,KeyboardInterrupt) as error:result.update(status='BLOCKED',reason=str(error),errorType=type(error).__name__)
    record(paths,result,phase=True)
    return result


def reference_launcher(paths):
    """Internal child of --watch; never imported by default/check-only."""
    claim,_=read_json(paths.claim);token=os.environ.get('CONTINUE_PUBLIC_HIGH_TOKEN','')
    require(token and digest(token.encode())==claim.get('tokenSHA256') and claim.get('stateDir')==str(paths.state_dir),'Internal launcher needs the one-shot watcher claim/token')
    require(file_identity(__file__)==claim.get('watcher'),'Reference launcher bytes differ from the armed watcher')
    require(assess(paths)['status']=='READY','Native/source admission changed before launcher import')
    private_dir(paths.reference_dir)
    require(not any(paths.reference_dir.iterdir()),'Reserved reference directory is not empty before numerical import')
    # Numerical source is untouched. Only its external BLAS resource scope is set.
    import numpy
    import threadpoolctl
    import runpy
    def observe(name):
        pools=[value for value in threadpoolctl.threadpool_info() if value.get('user_api')=='blas']
        require(pools and all(value.get('num_threads')==1 for value in pools),'Observed BLAS profile differs from explicit1')
        atomic_json(paths.state_dir/name,{'requestedThreads':1,'numpyVersion':numpy.__version__,'threadpoolctlVersion':threadpoolctl.__version__,'blasPools':pools,'numericOperatorChange':False,'fallback':False})
    with threadpoolctl.threadpool_limits(limits=1,user_api='blas'):
        observe('blas-before.json')
        sys.argv=command_plan(paths)['referenceOriginalScript']
        runpy.run_path(str(paths.root/REFERENCE),run_name='__main__')
        observe('blas-after.json')
    return 0


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group();mode.add_argument('--check-only',action='store_true');mode.add_argument('--watch',action='store_true')
    parser.add_argument('--state-dir',type=Path,required=True)
    parser.add_argument('--_reference-launcher',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args(argv);paths=Paths(state_dir=args.state_dir.absolute());watcher_identity=file_identity(__file__)
    try:
        private_dir(paths.state_dir)
        if args._reference_launcher:
            require(args.watch,'Internal reference launch requires explicit --watch')
            return reference_launcher(paths)
        if not args.watch:
            value=record(paths,assess(paths));return 1 if value['status'].startswith('BLOCKED') else 0
        private_dir(paths.claim.parent)
        descriptor=os.open(str(paths.claim)+'.lock',os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
        with os.fdopen(descriptor,'w') as lock:
            try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError:raise Blocked('Another watcher owns this fixed native continuation')
            if paths.claim.exists():raise Blocked('Continuation already claimed; manual review required, no automatic retry')
            while True:
                value=assess(paths);record(paths,value)
                if value['status']=='BLOCKED':return 1
                if value['status']=='READY':return 0 if execute_ready(paths,value,watcher_identity=watcher_identity)['status']=='HIGH_PREDICT_COMPARISON_PASSED' else 1
                time.sleep(30)
    except (Blocked,OSError,ValueError,KeyboardInterrupt) as error:
        value={'status':'BLOCKED','reason':str(error),'errorType':type(error).__name__,'sourceCommit':SOURCE_COMMIT,**SCOPES}
        try:record(paths,value)
        except (OSError,Blocked):print(json.dumps(value),flush=True)
        return 1


if __name__=='__main__':raise SystemExit(main())
