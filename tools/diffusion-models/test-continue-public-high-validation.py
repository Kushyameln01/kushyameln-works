"""Small continuation guard fixtures; no model, browser or numerical reference."""
import copy
import builtins
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('continue_public_high',Path(__file__).with_name('continue-public-high-validation.py'))
W=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(W)


def identity(raw):return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def encode(value):return (json.dumps(value,sort_keys=True)+'\n').encode()


class Fixture:
    def __init__(self,root):
        self.root=root
        frozen=root/'frozen';frozen.mkdir()
        self.paths=W.Paths(state_dir=root/'state',root=frozen,native=root/'native.json',native_resources=root/'native-resources.json',manifest=root/'inputs.json',native_private=root/'native-private',models=root/'models',claim=root/'launch-claim.json')
        self.paths.native_private.mkdir();self.paths.models.mkdir()
        self.sources={name:('fixed source '+name).encode() for name in W.SOURCE_HASHES}
        for name in [W.REFERENCE,W.COMPARATOR,W.OBSERVER]:self.sources.setdefault(name,('fixed tool '+name).encode())
        for name,raw in self.sources.items():p=frozen/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        self.payload=b'\0'*512;self.canonical=b'canonical fixture'
        (self.paths.native_private/'tensor.f32').write_bytes(self.payload)
        (self.paths.native_private/'tensor.wktensor').write_bytes(self.canonical)
        self.tensor_ids=[];tensors=[]
        for index,requirement in enumerate(['target.latent','source.latent','context:0:0.latent','context:1:0.latent','context:2:0.latent']):
            p=root/('input'+str(index)+'.f32');p.write_bytes(b'\0'*4);self.tensor_ids.append(identity(p.read_bytes()))
            tensors.append({'requirementId':requirement,'path':str(p),'shape':[1,16,1,2,4] if index==0 else [1,16,1,2,2],'dtype':'float32','layout':'NCTHW','bytes':4,'sha256':identity(p.read_bytes())['sha256']})
        text=root/'text.f32';text.write_bytes(b'text')
        mask=root/'mask.u8';mask.write_bytes(bytes([1,1,1]+[0]*509))
        self.text_id=identity(text.read_bytes());self.mask_id=identity(mask.read_bytes())
        self.manifest={'schemaVersion':'bernini-production-chunk-input/1','profileId':'small-guard-fixture','side':'HIGH','timestep':1000,'tensors':tensors,'initialEmptyTarget':tensors[0],'explicitNoise':tensors[0],'canonicalShape':{'target':{'initialLatentShape':[1,16,1,2,4],'tokenCount':2},'concatenation':{'totalTokens':5,'order':['target','source','context:0:0','context:1:0','context:2:0']}},'conditioning':{'payloadPath':str(text),'maskPath':str(mask),'payloadSHA256':self.text_id['sha256'],'maskSHA256':self.mask_id['sha256'],'metadata':{'shape':[1,512,4096],'modelSha256':W.TEXT_MODEL,'tokenizerSha256':W.TOKENIZER,'normalization':'umt5-final-rmsnorm-f32-v1','attentionMask':[1,1,1]+[0]*509}}}
        self.paths.manifest.write_bytes(encode(self.manifest));self.manifest_id=identity(self.paths.manifest.read_bytes())
        self.contract={'schemaVersion':'bernini-production-independent-contract/1','status':'PRE_EXECUTION_GATE_FIXED','gateMayNotBeRelaxedAfterComparison':True,'profileId':'small-guard-fixture','manifestSHA256':self.manifest_id['sha256'],'totalTokens':5,'textRows':512,'gate':{'abs':.01,'rel':.001},'sourceSHA256':{k:identity(v)['sha256'] for k,v in self.sources.items() if k in W.SOURCE_HASHES},'models':{side:{'fileName':side+'.empty','bytes':0,'previouslyVerifiedSHA256':('a' if side=='HIGH' else 'b')*64,'headerSHA256':('c' if side=='HIGH' else 'd')*64} for side in ['HIGH','LOW']}}
        self.paths.contract.parent.mkdir(parents=True,exist_ok=True);self.paths.contract.write_bytes(encode(self.contract));self.contract_id=identity(self.paths.contract.read_bytes())
        for side in ['HIGH','LOW']:(self.paths.models/self.contract['models'][side]['fileName']).touch()
        owner={'disposed':True,'busy':False,'closing':False,'activeHiddenStores':0,'activeHiddenStoreBytes':0,'stageWeightCacheBytes':0,'lastFailure':None,'head':None,'math':{'disposed':True,'busy':False,'memoryBytes':0},'source':{'disposed':True,'busy':False,'cachedBytes':0},'ops':{'disposed':True,'busy':False,'cleanupPending':False,'pendingTensors':0,'preparedWeights':0,'preparedWeightBytes':0,'attentionQueries':{'cleanupPending':False,'ownedTensors':0,'ownedQueryCount':0,'currentCpuTensorSpanBytes':0},'preparedAttentionKV':{'cleanupPending':False,'ownedPairs':0,'currentBytes':0,'activeLeases':0}}}
        high=copy.deepcopy(owner);high['lastRun']={'blockCount':40,'blocksCompleted':40,'totalTokens':5,'targetTokens':2,'contextTokens':3,'headRows':5,'writtenTargetRows':2,'textRows':512,'timings':{'firstFailure':None,'activeOperator':None}}
        feeds={side:{'disposed':True,'closing':False,'epoch':0,'activePackageHash':None,**{k:0 for k in ['candidates','readLeases','operationLeases','inFlight','cleanupPending']}} for side in ['HIGH','LOW']}
        resources={'disposed':True,'busy':False,'closing':False,'failedOperations':0,'models':{'HIGH':high,'LOW':copy.deepcopy(owner)},'weightFeeds':feeds}
        metadata={'dtype':'float32','shape':[1,16,1,2,4],'layout':'NCTHW','meaning':'bernini-flow-velocity:v1','modelSha256':'a'*64}
        inputs={branch:{**self.text_id,'mask':self.mask_id} for branch in ['positive','negative']}
        inputs.update(tensors=[{'requirementId':x['requirementId'],**declared} for x,declared in zip(tensors,self.tensor_ids)],noise=self.tensor_ids[0],initialEmptyTarget=self.tensor_ids[0])
        public={'mode':'predict','side':'HIGH','timestep':1000,'sourceCommit':W.SOURCE_COMMIT,'profileId':'small-guard-fixture','publicWorkerConnected':True,'outcome':'completed','error':None,'execution':{'operation':'predict','publicWorkerConnected':True,'effectiveWeights':{'HIGH':{'epoch':0,'packageHash':None}}},'callerInputsBitExact':True,'inputIdentitiesBefore':inputs,'inputIdentitiesAfter':copy.deepcopy(inputs),'codecScope':'Actual normal predict output','tensorMetadata':metadata,'outputIdentity':identity(self.payload),'savedPayload':identity(self.payload),'savedCanonical':identity(self.canonical),'codec':{'sha256':identity(self.canonical)['sha256'],'byteLength':len(self.canonical),'metadata':metadata},'readback':{'realDiskFileSelected':True,'allF32BitsExact':True,'payloadElements':128,'payload':identity(self.payload),'sha256':identity(self.canonical)['sha256'],'byteLength':len(self.canonical),'metadata':metadata},'loaded':{'models':{side:{'side':side,'modelSha256':v['previouslyVerifiedSHA256'],'headerSHA256':v['headerSHA256']} for side,v in self.contract['models'].items()}},'unload':{'unloaded':True,'resources':resources},'disposed':True,'afterDisposeCode':'DISPOSED','workerObserverRestored':True,'workerLifetimes':[{'workerEpoch':1,'stage':'constructed'},{'workerEpoch':1,'stage':'terminated'}]}
        self.native={'schemaVersion':'bernini-public-model-worker-host/0.1','passed':True,'sourceCommit':W.SOURCE_COMMIT,'sourceGuardAfter':True,'sourceGuardError':None,'hostError':None,'mode':'predict','side':'HIGH','timestep':1000,'requestedResource':{'wasmThreads':4,'coi':True,'fallback':False},'browser':{'closed':True,'pageErrors':[],'consoleErrors':[]},'deniedPaths':[],'inputReceipt':{'manifestSHA256':self.manifest_id['sha256'],'profileId':'small-guard-fixture','conditioning':{'shape':[1,512,4096],'modelSha256':W.TEXT_MODEL,'tokenizerSha256':W.TOKENIZER,'normalization':'umt5-final-rmsnorm-f32-v1','payloadSHA256':self.text_id['sha256'],'maskSHA256':self.mask_id['sha256']}},'publicResult':public,'privateOutputs':{'tensor.f32':identity(self.payload),'tensor.wktensor':identity(self.canonical)},'sourceInventory':{k:identity(v) for k,v in self.sources.items()},'modelStatBefore':{side:W.file_stat(self.paths.models/v['fileName']) for side,v in self.contract['models'].items()}}
        self.resource={'schemaVersion':'bernini-gated-process-tree-observation/1','monitorSourceSHA256':identity(self.sources[W.OBSERVER])['sha256'],'childExitCode':0,'error':None,'signalReceived':None,'gateInstalledBeforeCommandExec':True,'postCleanupObservationSeconds':3,'totalSamples':2,'observedPeakPssSumBytes':1234,'observations':[{'phase':'post-command-cleanup-observation','rootPresent':False,'processes':[{'state':'Z','rssBytes':0,'pssBytes':None}]}]}
        self.write_native();self.write_resource()
    def write_native(self):self.paths.native.write_bytes(encode(self.native))
    def write_resource(self):self.paths.native_resources.write_bytes(encode(self.resource))
    def complete_reference(self,*,tail=True):
        self.paths.reference_dir.mkdir(mode=0o700,exist_ok=True)
        output=self.paths.reference_dir/'velocity.f32';output.write_bytes(self.payload)
        coverage=[{'block':b,'name':'blockOutput','rows':5,'intervals':[[0,5]]} for b in range(40)]+[{'block':None,'name':'headAll','rows':5,'intervals':[[0,5]]},{'block':None,'name':'prediction','rows':32,'intervals':[[0,32 if tail else 29]]}]
        value={'schemaVersion':'bernini-production-independent-reference/1','operation':'predict','actualNativeOutputsUsedAsNumericInput':False,'manifestSHA256':self.manifest_id['sha256'],'contractSHA256':self.contract_id['sha256'],'profileId':'small-guard-fixture','gate':{'abs':.01,'rel':.001},'allTextRows':512,'metrics':[{'side':'HIGH','totalTokens':5,'coverage':coverage,'closed':False}],'arrays':{'velocity':{'shape':[1,16,1,2,4],'path':str(output),**identity(self.payload)}}}
        (self.paths.reference_dir/'reference.json').write_bytes(encode(value))
        (self.paths.state_dir/'reference-resources.json').write_bytes(encode(self.resource))
        for name in ['blas-before.json','blas-after.json']:(self.paths.state_dir/name).write_bytes(encode({'requestedThreads':1,'numpyVersion':'fixture','threadpoolctlVersion':'fixture','blasPools':[{'num_threads':1}],'numericOperatorChange':False,'fallback':False}))
    def complete_comparison(self,*,passed=True):
        value={'schemaVersion':'bernini-public-model-independent-comparison/1','passed':passed,'sourceCommit':W.SOURCE_COMMIT,'mode':'predict','array':'velocity','manifestSHA256':self.manifest_id['sha256'],'shape':[1,16,1,2,4],'referenceExecution':{'sourceCommit':W.SOURCE_COMMIT},'comparison':{'failedElements':0 if passed else 1,'allElementsCompared':True,'elements':128,'gate':{'abs':.01,'rel':.001}},'identities':{'referenceManifest':self.manifest_id,'contract':self.contract_id}}
        value.update(actual=identity(self.payload),expected=identity(self.payload))
        value['identities'].update(nativeReceipt=identity(self.paths.native.read_bytes()),reference=identity((self.paths.reference_dir/'reference.json').read_bytes()))
        (self.paths.state_dir/'comparison.json').write_bytes(encode(value))
    def git(self,root,*args):
        if args==('rev-parse','HEAD'):return (W.SOURCE_COMMIT+'\n').encode()
        if args==('diff','--quiet','HEAD','--'):return b''
        if args[0]=='show':
            name=args[1].split(':',1)[1]
            return self.paths.contract.read_bytes() if name==W.CONTRACT else self.sources[name]
        raise AssertionError(args)


class WatcherTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        self.output=io.StringIO();capture=redirect_stdout(self.output);capture.__enter__();self.addCleanup(capture.__exit__,None,None,None)
        self.f=Fixture(Path(self.temporary.name))
        for name,value in {'CONTRACT_ID':self.f.contract_id,'MANIFEST_ID':self.f.manifest_id,'SOURCE_HASHES':self.f.contract['sourceSHA256'],'SHAPE':[1,16,1,2,4],'TOTAL':5,'TARGET':2,'CONTEXT':3,'ELEMENTS':128,'PREDICTION_ROWS':32,'PROFILE':'small-guard-fixture','TEXT_BYTES':4,'TEXT_PAYLOAD_SHA':self.f.text_id['sha256'],'git_bytes':self.f.git}.items():
            p=patch.object(W,name,value);p.start();self.addCleanup(p.stop)
    def assess(self):return W.assess(self.f.paths)
    def test_complete_native_all40_cleanup_and_zombies_are_ready(self):self.assertEqual(self.assess()['status'],'READY')
    def test_in_progress_missing_empty_and_partial_receipts_wait_without_runner(self):
        for path in [self.f.paths.native,self.f.paths.native_resources]:
            old=path.read_bytes()
            for raw in [None,b'',b'{"passed":']:
                with self.subTest(path=path,raw=raw):
                    path.unlink(missing_ok=True)
                    if raw is not None:path.write_bytes(raw)
                    self.assertEqual(self.assess()['status'],'WAIT')
            path.write_bytes(old)
    def test_failed_or_partial_native_never_becomes_ready(self):
        for mutate in [lambda j:j.update(passed=False),lambda j:j['publicResult']['unload']['resources']['models']['HIGH']['lastRun'].update(blocksCompleted=39),lambda j:j['publicResult']['unload']['resources']['models']['HIGH']['lastRun'].update(headRows=4),lambda j:j['publicResult']['unload']['resources']['models']['HIGH']['lastRun'].update(writtenTargetRows=1)]:
            old=copy.deepcopy(self.f.native);mutate(self.f.native);self.f.write_native()
            self.assertEqual(self.assess()['status'],'BLOCKED');self.f.native=old
        self.f.write_native()
    def test_wrong_source_manifest_contract_and_actual_output_are_blocked(self):
        for path in [self.f.paths.contract,self.f.paths.manifest,self.f.paths.root/W.REFERENCE,self.f.paths.native_private/'tensor.f32']:
            old=path.read_bytes();path.write_bytes(old+b'changed')
            with self.subTest(path=path):self.assertEqual(self.assess()['status'],'BLOCKED')
            path.write_bytes(old)
        self.f.native['sourceCommit']='f'*40;self.f.write_native();self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_cleanup_must_finish_and_explicit_cleanup_failure_blocks(self):
        del self.f.native['publicResult']['unload'];self.f.write_native();self.assertEqual(self.assess()['status'],'WAIT')
        self.f.native['publicResult']['cleanupError']={'message':'failed'};self.f.write_native();self.assertEqual(self.assess()['status'],'BLOCKED')
    def test_named_source_and_math_owners_must_release_their_storage(self):
        for section,key,value in [('source','cachedBytes',4),('math','memoryBytes',65536),('ops','disposed',False)]:
            owner=self.f.native['publicResult']['unload']['resources']['models']['HIGH'];old=copy.deepcopy(owner)
            owner[section][key]=value;self.f.write_native()
            with self.subTest(section=section):self.assertEqual(self.assess()['status'],'BLOCKED')
            self.f.native['publicResult']['unload']['resources']['models']['HIGH']=old
    def test_public_native_latent_identity_chain_and_order_must_match_saved_inputs(self):
        public=self.f.native['publicResult'];before=copy.deepcopy(public['inputIdentitiesBefore'])
        for mutate in [lambda x:x.pop('tensors'),lambda x:x['tensors'].reverse(),lambda x:x['tensors'][0].update(sha256='f'*64),lambda x:x['noise'].update(sha256='f'*64),lambda x:x['initialEmptyTarget'].update(sha256='f'*64)]:
            changed=copy.deepcopy(before);mutate(changed);public['inputIdentitiesBefore']=changed;public['inputIdentitiesAfter']=copy.deepcopy(changed);self.f.write_native()
            self.assertEqual(self.assess()['status'],'BLOCKED')
        public['inputIdentitiesBefore']=before;public['inputIdentitiesAfter']=copy.deepcopy(before)
    def test_outer_failure_or_live_descendant_blocks(self):
        for change in [{'childExitCode':1},{'signalReceived':15},{'error':{'message':'failed'}},{'observations':[{'phase':'post-command-cleanup-observation','rootPresent':False,'processes':[{'state':'S','rssBytes':1}]}]}]:
            old=copy.deepcopy(self.f.resource);self.f.resource.update(change);self.f.write_resource()
            self.assertEqual(self.assess()['status'],'BLOCKED');self.f.resource=old
        self.f.write_resource()
    def test_default_cli_is_check_only_and_does_not_import_numpy(self):
        self.f.paths.native.unlink()
        original_import=builtins.__import__
        def guarded_import(name,*args,**kwargs):
            if name.split('.')[0] in ['numpy','threadpoolctl','playwright']:raise AssertionError('Numerical/browser import forbidden in check-only')
            return original_import(name,*args,**kwargs)
        with patch.object(W,'Paths',lambda **_:self.f.paths),patch.object(W,'execute_ready',side_effect=AssertionError('must not start')),patch.object(builtins,'__import__',guarded_import):
            self.assertEqual(W.main(['--state-dir',str(self.f.paths.state_dir)]),0)
        self.assertEqual(json.loads((self.f.paths.state_dir/'state.json').read_bytes())['status'],'WAIT')
    def test_reference_failure_never_launches_comparator_or_retries(self):
        calls=[]
        def runner(command,**kwargs):calls.append(command);return 1
        self.assertEqual(W.execute_ready(self.f.paths,self.assess(),runner=runner)['status'],'BLOCKED')
        self.assertEqual(len(calls),1)
        self.assertEqual(W.execute_ready(self.f.paths,self.assess(),runner=runner)['status'],'BLOCKED')
        self.assertEqual(len(calls),1)
    def test_existing_reference_output_is_rejected_before_any_subprocess(self):
        self.f.paths.reference_dir.mkdir(mode=0o700,parents=True);(self.f.paths.reference_dir/'velocity.f32').write_bytes(b'old')
        calls=[]
        result=W.execute_ready(self.f.paths,self.assess(),runner=lambda *a,**k:(calls.append(a),1)[1])
        self.assertEqual(result['status'],'BLOCKED');self.assertEqual(calls,[])
    def test_changed_launcher_bytes_are_rejected_before_numerical_import(self):
        self.f.paths.state_dir.mkdir(mode=0o700)
        token='fixture-token';self.f.paths.claim.write_bytes(encode({'stateDir':str(self.f.paths.state_dir),'tokenSHA256':hashlib.sha256(token.encode()).hexdigest(),'watcher':{'bytes':1,'sha256':'f'*64}}))
        original_import=builtins.__import__
        def guarded(name,*args,**kwargs):
            if name in ['numpy','threadpoolctl']:raise AssertionError('numerical import reached before launcher hash guard')
            return original_import(name,*args,**kwargs)
        with patch.dict(os.environ,{'CONTINUE_PUBLIC_HIGH_TOKEN':token}),patch.object(builtins,'__import__',guarded):
            with self.assertRaises(W.Blocked):W.reference_launcher(self.f.paths)
    def test_interrupted_owned_group_is_killed_and_reaped_without_signalling_native(self):
        child=SimpleNamespace(pid=999001,terminate=lambda:None,wait=unittest.mock.Mock(side_effect=[KeyboardInterrupt(),subprocess.TimeoutExpired('owned',30),0]))
        calls=[]
        with patch.object(W.subprocess,'Popen',return_value=child) as popen,patch.object(W.os,'killpg',side_effect=lambda pgid,sig:calls.append((pgid,sig))):
            with self.assertRaises(KeyboardInterrupt):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'owned.log',env={},on_running=lambda _:None)
        self.assertTrue(popen.call_args.kwargs.get('start_new_session'))
        self.assertIn((999001,signal.SIGTERM),calls);self.assertIn((999001,signal.SIGKILL),calls)
        self.assertEqual(child.wait.call_count,3)
    def test_sigterm_is_handled_and_original_handlers_are_restored(self):
        original=signal.getsignal(signal.SIGTERM);count=[0]
        def wait(**_):
            count[0]+=1
            if count[0]==1:signal.getsignal(signal.SIGTERM)(signal.SIGTERM,None)
            return -15
        child=SimpleNamespace(pid=999002,wait=wait)
        with patch.object(W.subprocess,'Popen',return_value=child),patch.object(W.os,'killpg') as kill,patch.object(W,'owned_live_processes',return_value=[]):
            with self.assertRaises(W.InterruptedSignal):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'term.log',env={},on_running=lambda _:None)
        self.assertEqual(signal.getsignal(signal.SIGTERM),original)
        kill.assert_called_once_with(999002,signal.SIGTERM)
    def test_signal_during_spawn_is_deferred_until_owned_child_is_registered(self):
        child=SimpleNamespace(pid=999005,wait=unittest.mock.Mock(return_value=-15))
        def spawn(*args,**kwargs):
            handler=signal.getsignal(signal.SIGTERM)
            self.assertTrue(callable(handler),'cooperative handler must exist before Popen')
            handler(signal.SIGTERM,None)
            return child
        with patch.object(W.subprocess,'Popen',side_effect=spawn),patch.object(W.os,'killpg') as kill,patch.object(W,'owned_live_processes',return_value=[]):
            with self.assertRaises(W.InterruptedSignal):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'spawn-term.log',env={},on_running=lambda _:None)
        kill.assert_called_once_with(999005,signal.SIGTERM);self.assertEqual(child.wait.call_count,1)
    def test_signal_while_installing_handlers_prevents_spawn(self):
        original_signal=signal.signal;first=[True]
        def install(number,handler):
            prior=original_signal(number,handler)
            if first[0]:first[0]=False;handler(signal.SIGTERM,None)
            return prior
        child=SimpleNamespace(pid=999006,wait=lambda **_:0)
        with patch.object(W.signal,'signal',side_effect=install),patch.object(W.subprocess,'Popen',return_value=child) as spawn,patch.object(W.os,'killpg'):
            with self.assertRaises(W.InterruptedSignal):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'install-term.log',env={},on_running=lambda _:None)
        spawn.assert_not_called()
    def test_nonzero_observer_exit_with_live_owned_descendant_still_drains_group(self):
        child=SimpleNamespace(pid=999007,wait=unittest.mock.Mock(side_effect=[1,1]))
        with patch.object(W.subprocess,'Popen',return_value=child),patch.object(W.os,'killpg') as kill,patch.object(W,'owned_live_processes',side_effect=[[{'pid':999008,'state':'S'}],[]]):
            with self.assertRaises(W.Blocked):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'exited-live.log',env={},on_running=lambda _:None)
        kill.assert_called_once_with(999007,signal.SIGTERM)
    def test_signal_during_final_descendant_scan_is_not_discarded(self):
        child=SimpleNamespace(pid=999011,wait=unittest.mock.Mock(return_value=0));scans=[0]
        def scan(_):
            scans[0]+=1
            if scans[0]==1:signal.getsignal(signal.SIGTERM)(signal.SIGTERM,None)
            return []
        with patch.object(W.subprocess,'Popen',return_value=child),patch.object(W.os,'killpg'),patch.object(W,'owned_live_processes',side_effect=scan):
            with self.assertRaises(W.InterruptedSignal):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'scan-term.log',env={},on_running=lambda _:None)
    def test_unresolved_child_obligation_stays_recorded_until_reap(self):
        self.f.paths.state_dir.mkdir(mode=0o700);self.f.paths.claim.write_text('durable one-shot claim')
        child=SimpleNamespace(pid=999003,wait=unittest.mock.Mock(side_effect=[KeyboardInterrupt(),subprocess.TimeoutExpired('owned',30),subprocess.TimeoutExpired('owned',10),0]))
        observations=[]
        def obligation(value):
            observations.append(value)
            if value:
                W.record(self.f.paths,{'status':'BLOCKED_CHILD_CLEANUP_PENDING','heavyWorkStarted':True,'liveChildObligation':value},phase=True)
                self.assertTrue(self.f.paths.claim.exists())
                self.assertEqual(signal.getsignal(signal.SIGTERM),signal.SIG_IGN)
        with patch.object(W.subprocess,'Popen',return_value=child),patch.object(W.os,'killpg'),patch.object(W,'owned_live_processes',side_effect=[[{'pid':999004,'state':'S'}],[{'pid':999004,'state':'S'}],[]]),patch.object(W.time,'sleep') as sleep:
            with self.assertRaises(KeyboardInterrupt):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'pending.log',env={},on_running=lambda _:None,on_cleanup=obligation)
        self.assertEqual(len(observations),2);self.assertIsNone(observations[-1]);sleep.assert_called_once_with(30)
        self.assertTrue(self.f.paths.claim.exists());self.assertEqual(child.wait.call_count,4)
        self.assertEqual(json.loads((self.f.paths.state_dir/'run.json').read_bytes())['liveChildObligation']['ownedProcessGroup'],999003)
    def test_cleanup_log_failure_cannot_release_a_live_child_obligation(self):
        child=SimpleNamespace(pid=999009,wait=unittest.mock.Mock(side_effect=[KeyboardInterrupt(),subprocess.TimeoutExpired('owned',30),subprocess.TimeoutExpired('owned',10),0]))
        def failed_log(value):
            if value:raise OSError('injected state log failure')
        with patch.object(W.subprocess,'Popen',return_value=child),patch.object(W.os,'killpg'),patch.object(W,'owned_live_processes',side_effect=[[{'pid':999010,'state':'S'}],[{'pid':999010,'state':'S'}],[]]),patch.object(W.time,'sleep'),patch.object(W.sys,'stderr',io.StringIO()):
            with self.assertRaises(KeyboardInterrupt):W.run_command(['owned-fixture'],cwd=self.f.paths.root,log=Path(self.temporary.name)/'pending-log-failed.log',env={},on_running=lambda _:None,on_cleanup=failed_log)
        self.assertEqual(child.wait.call_count,4)
    def test_check_only_preserves_existing_running_phase(self):
        self.f.paths.state_dir.mkdir(mode=0o700)
        self.f.paths.claim.write_bytes(encode({'stateDir':str(self.f.paths.state_dir)}))
        W.record(self.f.paths,{'status':'REFERENCE_RUNNING','heavyWorkStarted':True},phase=True)
        W.record(self.f.paths,self.assess())
        state=json.loads((self.f.paths.state_dir/'state.json').read_bytes())
        self.assertEqual(state['status'],'REFERENCE_RUNNING');self.assertTrue(state['heavyWorkStarted']);self.assertEqual(state['assessmentStatus'],'READY')
        self.assertEqual(json.loads((self.f.paths.state_dir/'run.json').read_bytes())['status'],'REFERENCE_RUNNING')
    def test_check_only_preserves_a_failed_continuation_and_exits_one(self):
        self.f.paths.state_dir.mkdir(mode=0o700);self.f.paths.claim.write_bytes(encode({'stateDir':str(self.f.paths.state_dir)}))
        W.record(self.f.paths,{'status':'BLOCKED','heavyWorkStarted':True,'reason':'reference failed'},phase=True)
        with patch.object(W,'Paths',lambda **_:self.f.paths),patch.object(W,'execute_ready',side_effect=AssertionError('must not restart')):
            self.assertEqual(W.main(['--check-only','--state-dir',str(self.f.paths.state_dir)]),1)
        self.assertEqual(json.loads((self.f.paths.state_dir/'run.json').read_bytes())['reason'],'reference failed')
    def test_comparator_command_requires_full_contract_manifest_and_both_actual_commits(self):
        commands=W.command_plan(self.f.paths)
        command=commands['comparison'];W.check_comparison_command(self.f.paths,command)
        self.assertEqual(command[command.index('--contract')+1],str(self.f.paths.contract))
        self.assertEqual(command[command.index('--reference-manifest')+1],str(self.f.paths.manifest))
        for option in ['--contract','--reference-manifest','--source-commit','--reference-source-commit']:
            wrong=list(command);i=wrong.index(option);del wrong[i:i+2]
            with self.subTest(option=option),self.assertRaises(W.Blocked):W.check_comparison_command(self.f.paths,wrong)
    def test_reference_coverage_requires_every_block_head_and_target_tail(self):
        metrics={'side':'HIGH','totalTokens':5,'coverage':[{'block':b,'name':'blockOutput','rows':5,'intervals':[[0,5]]} for b in range(40)]+[{'block':None,'name':'headAll','rows':5,'intervals':[[0,5]]},{'block':None,'name':'prediction','rows':32,'intervals':[[0,32]]}]}
        W.check_reference_coverage([metrics])
        metrics['coverage'][-1]['intervals']=[[0,29]]
        with self.assertRaises(W.Blocked):W.check_reference_coverage([metrics])
    def test_zero_exit_reference_without_target_tail_never_reaches_comparator(self):
        calls=[]
        def runner(command,**kwargs):calls.append(command);self.f.complete_reference(tail=False);return 0
        result=W.execute_ready(self.f.paths,self.assess(),runner=runner)
        self.assertEqual(result['status'],'BLOCKED');self.assertEqual(len(calls),1)
    def test_zero_exit_comparator_with_failed_json_is_blocked(self):
        calls=[]
        def runner(command,**kwargs):
            calls.append(command)
            if len(calls)==1:self.f.complete_reference()
            else:self.f.complete_comparison(passed=False)
            return 0
        self.assertEqual(W.execute_ready(self.f.paths,self.assess(),runner=runner)['status'],'BLOCKED')
        self.assertEqual(len(calls),2)
    def test_comparator_cannot_publish_a_pass_for_another_native_output_identity(self):
        calls=[]
        def runner(command,**kwargs):
            calls.append(command)
            if len(calls)==1:self.f.complete_reference()
            else:
                self.f.complete_comparison();path=self.f.paths.state_dir/'comparison.json';value=json.loads(path.read_bytes());value['actual']={'bytes':512,'sha256':'f'*64};path.write_bytes(encode(value))
            return 0
        self.assertEqual(W.execute_ready(self.f.paths,self.assess(),runner=runner)['status'],'BLOCKED')
    def test_success_is_sequential_and_keeps_unaccepted_scopes_false(self):
        calls=[]
        def runner(command,**kwargs):
            calls.append(command)
            if len(calls)==1:
                self.assertNotIn('--stop-after-block',W.command_plan(self.f.paths)['referenceOriginalScript'])
                self.assertEqual(kwargs['env']['OPENBLAS_NUM_THREADS'],'1');self.f.complete_reference()
            else:
                self.assertTrue((self.f.paths.state_dir/'reference-resources.json').exists())
                W.check_comparison_command(self.f.paths,command);self.f.complete_comparison()
            return 0
        result=W.execute_ready(self.f.paths,self.assess(),runner=runner)
        self.assertEqual(result['status'],'HIGH_PREDICT_COMPARISON_PASSED');self.assertTrue(result['highPredictAccepted'])
        self.assertEqual(len(calls),2)
        for key in W.SCOPES:self.assertIs(result[key],False)


if __name__=='__main__':unittest.main()
