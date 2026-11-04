"""No model inference: exact bounded coverage, identities, source and cleanup."""
import importlib.util
from contextlib import ExitStack, nullcontext, redirect_stdout
import io
from pathlib import Path
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import json

spec=importlib.util.spec_from_file_location('production_chunk_browser',Path(__file__).with_name('production-chunk-browser.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sample_spec=importlib.util.spec_from_file_location('production_sample_chunks',Path(__file__).with_name('production-sample-chunks.py'))
sample=importlib.util.module_from_spec(sample_spec)
sample_spec.loader.exec_module(sample)


class ExitStatusTests(unittest.TestCase):
    def run_main(self,flags=(),*,reference_passed=True,startup_error=False,worker_completed=True):
        """Exercise real result/receipt branches without model, oracle or browser work."""
        with tempfile.TemporaryDirectory() as directory,ExitStack() as stack:
            root=Path(directory)
            manifest=root/'manifest.json';manifest.write_text(json.dumps({'tensors':[{'shape':[1,16,1,2,4]}]}))
            contract=root/'contract.json';contract.write_text('{}')
            (root/'empty-weight-fixture').touch()  # stat only; no retained model is opened.
            private=root/'private';private.mkdir()
            output=root/'receipt.json'
            def write_json(path,value,**_):Path(path).write_text(json.dumps(value))
            reference=SimpleNamespace(REF=SimpleNamespace(MODELS={'HIGH':('empty-weight-fixture',)},MODEL_BYTES=0),np=SimpleNamespace(__version__='test-only'),GATE={'abs':0.01,'rel':0.001},reference_contract=lambda _: {},file_sha=lambda _: '0'*64,write_json=write_json,private_directory=lambda _: private)
            cleanup={'cleanupErrors':[],'backingFilesRemaining':[],'childStillAlive':False}
            oracle=SimpleNamespace(initial={'kind':'ready'},close=lambda **_:cleanup)
            page=SimpleNamespace(set_default_timeout=lambda _:None,on=lambda *_:None,goto=lambda _:None,locator=lambda _:SimpleNamespace(set_input_files=lambda _:None),evaluate=lambda *_:{'done':True,'result':{'completed':worker_completed},'error':None,'events':[]})
            browser=SimpleNamespace(new_page=lambda:page,close=lambda:None)
            playwright=SimpleNamespace(chromium=SimpleNamespace(launch=lambda **_:browser))
            server=SimpleNamespace(server_port=1,serve_forever=lambda:None,shutdown=lambda:None,server_close=lambda:None)
            replacements={
                'load_reference':lambda:reference,
                'committed_sources':lambda *_:{'fixture.mjs':b'fixed'},
                'verify_reference_threads':lambda *_:{'passed':reference_passed},
                'input_config':lambda *_,**__:({'totalTokens':5,'stages':['k']},{}),
                'Coverage':lambda *_:SimpleNamespace(summary=lambda:{'complete':True}),
                'OracleProcess':lambda *_,**__:oracle,
            }
            if startup_error:
                def reject_startup(*_,**__):raise RuntimeError('injected oracle startup failure')
                replacements['OracleProcess']=reject_startup
            for name,value in replacements.items():stack.enter_context(patch.object(module,name,value))
            stack.enter_context(patch.object(module.http.server,'ThreadingHTTPServer',lambda *_:server))
            stack.enter_context(patch.object(module.threading,'Thread',lambda **_:SimpleNamespace(start=lambda:None)))
            stack.enter_context(patch.dict(sys.modules,{'playwright.sync_api':SimpleNamespace(sync_playwright=lambda:nullcontext(playwright))}))
            stack.enter_context(patch.object(sys,'argv',['production-chunk-browser.py','--manifest',str(manifest),'--contract',str(contract),'--model-dir',str(root),'--source-commit','1'*40,'--private-reference-dir',str(private),'--output',str(output),*flags]))
            printed=stack.enter_context(redirect_stdout(io.StringIO()))
            status=module.main()
            return status,json.loads(printed.getvalue().splitlines()[-1]),json.loads(output.read_text()) if output.exists() else None

    def test_reference_thread_failure_exits_one_and_success_exits_zero(self):
        for passed,want in [(False,1),(True,0)]:
            with self.subTest(passed=passed):
                status,summary,receipt=self.run_main(['--verify-reference-threads'],reference_passed=passed)
                self.assertEqual(summary['passed'],passed)
                self.assertEqual(receipt['passed'],passed)
                self.assertEqual(status,want)

    def test_oracle_startup_failure_exits_one_after_writing_failure_receipt(self):
        status,summary,receipt=self.run_main(startup_error=True)
        self.assertFalse(summary['passed'])
        self.assertEqual(receipt['failures'][0]['stage'],'independent-oracle-startup')
        self.assertEqual(status,1)

    def test_final_worker_comparison_failure_exits_one_and_completion_exits_zero(self):
        for completed,want in [(False,1),(True,0)]:
            with self.subTest(completed=completed):
                status,summary,receipt=self.run_main(worker_completed=completed)
                self.assertEqual(summary['passed'],completed)
                self.assertEqual(receipt['passed'],completed)
                self.assertEqual(status,want)

    def test_validate_only_exits_zero_without_an_oracle(self):
        status,summary,receipt=self.run_main(['--validate-only'],startup_error=True)
        self.assertTrue(summary['passed'])
        self.assertIsNone(receipt)
        self.assertEqual(status,0)

    def test_self_test_exits_zero(self):
        with patch.object(sys,'argv',['production-chunk-browser.py','--self-test']),redirect_stdout(io.StringIO()) as printed:
            self.assertEqual(module.main(),0)
        self.assertTrue(json.loads(printed.getvalue())['passed'])


class CoverageTests(unittest.TestCase):
    def test_prefix_reuse_skips_only_explicit_comparisons_and_keeps_block_and_head(self):
        stages=module.comparison_stages('predict',skip_prefix=True)
        self.assertFalse(set(module.PREFIX_STAGES+['postModulated']) & set(stages))
        self.assertTrue(set(['k','v','q','selfAttention','oProjection','selfResidual','crossK','crossV','crossQ','crossAttention','crossResidual','ffnOutput','blockOutput','headAll','prediction']) <= set(stages))
        coverage=module.Coverage(self.manifest(),stages,39,'predict')
        self.assertFalse(coverage.summary()['complete'])
        with self.assertRaisesRegex(ValueError,'Unexpected'):
            coverage.check({'name':'patchHidden','block':None,'globalRowStart':0,'rowCount':1})
        self.assertEqual(module.comparison_stages('blocks'),module.STAGES)
        with self.assertRaisesRegex(ValueError,'sample'):
            module.comparison_stages('sample',skip_prefix=True)

    def manifest(self):
        return {'canonicalShape':{'concatenation':{'totalTokens':259}},'conditioning':{'metadata':{'shape':[1,512,4096]}},'tensors':[{'shape':[1,16,1,2,4]}]}

    def fill(self,coverage,block,name,*,omit_tail=False):
        extent=coverage.extent(name)
        for start in range(0,extent,128):
            count=min(128,extent-start)
            if omit_tail and count<128:continue
            coverage.check({'name':name,'block':block,'globalRowStart':start,'rowCount':count},commit=True)

    def test_historical_block0_and_exact_three_row_tail(self):
        coverage=module.Coverage(self.manifest(),['k'],0)
        self.fill(coverage,0,'k',omit_tail=True)
        self.assertFalse(coverage.summary()['complete'])
        coverage.check({'name':'k','block':0,'globalRowStart':256,'rowCount':3},commit=True)
        self.assertTrue(coverage.summary()['complete'])
        for event in [dict(name='k',block=0,globalRowStart=256,rowCount=3),dict(name='k',block=1,globalRowStart=0,rowCount=128),dict(name='k',block=0,globalRowStart=259,rowCount=1)]:
            with self.assertRaises(ValueError):coverage.check(event)

    def test_full40_and_head_target_unpatch_are_separate_required_coverages(self):
        stages=['patchHidden','blockOutput','headAll','prediction']
        coverage=module.Coverage(self.manifest(),stages,39,'predict')
        self.fill(coverage,None,'patchHidden')
        for block in range(40):self.fill(coverage,block,'blockOutput')
        self.assertFalse(coverage.summary()['complete'])
        self.fill(coverage,None,'headAll')
        self.assertFalse(coverage.summary()['complete'])
        self.assertEqual(coverage.extent('prediction'),32)
        self.fill(coverage,None,'prediction')
        self.assertTrue(coverage.summary()['complete'])
        rows=coverage.summary()['rows']
        self.assertEqual(len([row for row in rows if row['name']=='blockOutput']),40)
        with self.assertRaises(ValueError):coverage.check(dict(name='headAll',block=39,globalRowStart=0,rowCount=128))
        with self.assertRaises(ValueError):module.Coverage(self.manifest(),stages,0,'predict')
        with self.assertRaises(ValueError):module.Coverage(self.manifest(),['blockOutput'],39,'predict')


class CleanupTests(unittest.TestCase):
    def test_failed_close_still_closes_pipe_terminates_child_and_removes_backings(self):
        with tempfile.TemporaryDirectory() as directory:
            owner=object.__new__(module.OracleProcess)
            owner.closed,owner.stats,owner.directory,owner.lock=False,None,Path(directory),threading.Lock()
            calls=[]
            def fail(_):raise BrokenPipeError('injected')
            owner.connection=SimpleNamespace(send=fail,close=lambda:calls.append('pipe-close'))
            alive=[True]
            owner.process=SimpleNamespace(pid=123,exitcode=-15,join=lambda timeout:calls.append('join'),is_alive=lambda:alive[0],terminate=lambda:(calls.append('terminate'),alive.__setitem__(0,False)))
            for name in ['reference-x.f32','reference-k.f32','reference-v.f32']:(Path(directory)/name).write_bytes(b'private')
            result=owner.close(graceful=True)
            self.assertIn('terminate',calls)
            self.assertIn('pipe-close',calls)
            self.assertEqual(result['cleanupErrors'][0]['phase'],'graceful-close')
            self.assertFalse(result['childStillAlive'])
            self.assertEqual(result['backingFilesRemaining'],[])
            self.assertEqual(len(result['backingFilesRemoved']),3)
            self.assertIs(owner.close(graceful=False),result)

    def test_interrupted_six_prediction_files_are_all_removed_without_unrelated_private_files(self):
        with tempfile.TemporaryDirectory() as directory:
            owner=object.__new__(module.OracleProcess)
            owner.closed,owner.stats,owner.directory,owner.lock=False,None,Path(directory),threading.Lock()
            owner.owned_paths=sample.private_paths(directory)
            owner.connection=SimpleNamespace(close=lambda:None)
            owner.process=SimpleNamespace(pid=123,exitcode=-15,join=lambda timeout:None,is_alive=lambda:False)
            for path in owner.owned_paths:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b'private')
            unrelated=Path(directory)/'not-owned.txt';unrelated.write_text('keep')
            cleanup=owner.close(graceful=False)
            self.assertEqual(len(cleanup['backingFilesRemoved']),33)
            self.assertEqual(cleanup['backingFilesRemaining'],[])
            self.assertEqual(cleanup['cleanupErrors'],[])
            self.assertTrue(unrelated.exists())


class ReferenceResourceTests(unittest.TestCase):
    def test_observed_blas_profile_is_explicit_and_mismatch_never_falls_back(self):
        control=SimpleNamespace(__version__='test-version',threadpool_info=lambda:[{'user_api':'blas','internal_api':'openblas','num_threads':4,'prefix':'test','version':'1'}])
        result=module.reference_resource(control,4)
        self.assertEqual(result['requestedThreads'],4)
        self.assertEqual(result['threadpoolctlVersion'],'test-version')
        self.assertEqual(result['observedBLASPools'][0]['num_threads'],4)
        self.assertFalse(result['numericOperatorChange'])
        self.assertFalse(result['fallback'])
        with self.assertRaises(ValueError):module.reference_resource(control,1)
        control.threadpool_info=lambda:[]
        with self.assertRaises(ValueError):module.reference_resource(control,4)


class SampleTests(unittest.TestCase):
    def test_committed_wan21_literal_source_is_pinned_before_and_after_receipts(self):
        expected=sample.captured_reference_sources()
        self.assertEqual(expected['comfy/latent_formats.py']['sha256'],sample.LATENT_FORMATS_SHA256)
        self.assertEqual(expected['comfy/latent_formats.py']['repositoryPath'],sample.LATENT_FORMATS_RELATIVE)
        provenance=expected['comfy/latent_formats.py']['provenance']
        raw=sample.LATENT_FORMATS.read_bytes()
        self.assertEqual(len(raw),48392)
        self.assertEqual(module.sha(raw[:-1]),provenance['upstreamSHA256'])
        self.assertEqual(raw[-1:],b'\n')
        self.assertFalse(provenance['sourceProfile']['rawUpstreamByteExact'])
        self.assertTrue(provenance['sourceProfile']['allOtherBytesExact'])
        captured=module.source_receipt({'local.mjs':b'fixed'},'sample')
        self.assertEqual(captured['referenceSources'],expected)
        self.assertEqual(captured,module.source_receipt({'local.mjs':b'fixed'},'sample'))
        self.assertNotEqual(captured['inventorySHA256'],module.source_receipt({'local.mjs':b'fixed'})['inventorySHA256'])
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'changed.py';path.write_text('changed literal source')
            with self.assertRaises(ValueError):sample.captured_reference_sources(path)
            path.write_bytes(raw)
            changed=Path(directory)/'changed.json';changed.write_text('{}')
            with self.assertRaises(ValueError):sample.captured_reference_sources(path,changed)

    def test_sampler_source_relocation_reads_committed_bytes_without_old_absolute_path(self):
        reference=module.load_reference()
        spec=importlib.util.spec_from_file_location('test_unchanged_sampler_relocation',Path(reference.__file__).with_name('standalone-sampler-reference.py'))
        sampler=importlib.util.module_from_spec(spec);spec.loader.exec_module(sampler)
        missing=Path('/no-such-provider-path/old-latent_formats.py')
        sampler.SOURCES['comfy/latent_formats.py']=missing
        functions=[sampler.wan_constants,sampler.process_in,sampler.process_out]
        relocation=sample.bind_sampler_source(sampler)
        self.assertEqual(sampler.SOURCES['comfy/latent_formats.py'],sample.LATENT_FORMATS)
        self.assertEqual(relocation['originalPath'],str(missing))
        self.assertEqual(relocation['sha256'],sample.LATENT_FORMATS_SHA256)
        self.assertFalse(relocation['numericFunctionsModified'])
        self.assertEqual(functions,[sampler.wan_constants,sampler.process_in,sampler.process_out])
        mean,std,scale=sampler.wan_constants()
        self.assertEqual(mean.shape,(1,16,1,1,1))
        self.assertEqual(std.shape,(1,16,1,1,1))
        self.assertEqual(float(scale),1)
        self.assertFalse(missing.exists())

    def test_six_update_coverage_requires_all_six_identities_and_final_restore(self):
        coverage=sample.SampleCoverage({'tensors':[{'shape':[1,16,1,2,4]}]})
        for name in sample.TRACE_SEQUENCE:
            with self.assertRaises(ValueError):coverage.check(dict(name='unknown',globalRowStart=0,rowCount=32))
            coverage.check(dict(name=name,globalRowStart=0,rowCount=29),commit=True)
            self.assertFalse(coverage.summary()['complete'])
            coverage.check(dict(name=name,globalRowStart=29,rowCount=3),commit=True)
        self.assertTrue(coverage.summary()['complete'])
        self.assertEqual(coverage.summary()['traceIdentities'],sample.TRACE_SEQUENCE)
        with self.assertRaises(ValueError):coverage.check(dict(name='finalRaw',globalRowStart=0,rowCount=32))

    def test_independent_sampler_state_never_uses_a_native_comparison_operand(self):
        reference=module.load_reference()
        np=reference.np
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary)
            shape=[1,16,1,2,4]
            def saved(name,data):
                path=directory/(name+'.f32');path.write_bytes(data.tobytes())
                return {'path':str(path),'sha256':reference.file_sha(path)}
            noise=np.arange(128,dtype='<f4').reshape(shape)/np.float32(128)
            manifest={'schemaVersion':'bernini-production-chunk-input/1','gate':reference.GATE,'tensors':[{'shape':shape}],'initialEmptyTarget':saved('empty',np.zeros(shape,dtype='<f4')),'explicitNoise':saved('noise',noise)}
            manifest_path=directory/'manifest.json';manifest_path.write_text(json.dumps(manifest))
            owner=sample.SampleOracle(reference,manifest_path,directory,directory)
            calls=[]
            def prediction(step):
                calls.append((step,'HIGH' if step<3 else 'LOW'))
                return np.full(shape,np.float32((step+1)/64),dtype='<f4')
            owner._prediction=prediction
            expected_x=owner.sampler.noise_mix(noise,np.zeros(shape,dtype='<f4'),owner.sigmas[0])
            high=None
            try:
                for name in sample.TRACE_SEQUENCE:
                    metadata={}
                    if name=='initialX':expected=expected_x;metadata={'sigma':float(owner.sigmas[0])}
                    elif name.startswith('velocity'):
                        step=int(name[-2:]);velocity=np.full(shape,np.float32((step+1)/64),dtype='<f4');expected=velocity
                        metadata={'step':step,'side':'HIGH' if step<3 else 'LOW','sigma':float(owner.sigmas[step])}
                    elif name.startswith('step'):
                        step=int(name[4:6]);expected_x=owner.sampler.euler(expected_x,velocity,owner.sigmas[step],owner.sigmas[step+1]);expected=expected_x
                        metadata={'step':step,'side':'HIGH' if step<3 else 'LOW','sigma':float(owner.sigmas[step+1])}
                    elif name=='highPublic':high=owner.sampler.process_out(owner.sampler.inverse(expected_x,owner.sigmas[3]));expected=high;metadata={'sigma':float(owner.sigmas[3]),'handoffProfile':'bernini-high-low-wan21-handoff:v1'}
                    elif name=='lowEntry':expected_x=owner.sampler.noise_mix(np.zeros(shape,dtype='<f4'),owner.sampler.process_in(high,True),owner.sigmas[3]);expected=expected_x;metadata={'sigma':float(owner.sigmas[3])}
                    else:expected=owner.sampler.process_out(owner.sampler.inverse(expected_x,owner.sigmas[6]))
                    metadata['meaning']='bernini-flow-velocity:v1' if name.startswith('velocity') else 'bernini-high-handoff-raw:v1' if name=='highPublic' else 'wan21-raw-generated-sample:v1' if name=='finalRaw' else 'bernini-sampler-state:v1'
                    if name=='finalRaw':metadata['latentContract']={'representation':'generated-sample','space':'raw','normalization':{'id':'wan21-comfy-f32-v1','state':'restored','owner':'diffusion_models'}}
                    for start,count in [(0,29),(29,3)]:
                        event={'schemaVersion':'bernini-sampler-chunk/1','name':name,'block':None,'globalRowStart':start,'rowCount':count,'rowAxis':None,'columns':4,'storageElementOffset':start*4,'shape':[count,4],'fullShape':shape,'dtype':'float32','layout':'NCTHW-contiguous-row-span','axes':['linearNCTHRow','W'],'fullAxes':['N','C','T','H','W'],**metadata}
                        raw=expected.reshape(-1,4)[start:start+count].copy()
                        if name=='velocity00':raw.fill(1000000)
                        comparison=owner.compare(event,raw.tobytes())
                        self.assertEqual(comparison['failed'],count*4 if name=='velocity00' else 0)
                self.assertEqual(calls,[(step,'HIGH' if step<3 else 'LOW') for step in range(6)])
                self.assertTrue(owner.stats()['coverage']['complete'])
                self.assertFalse(owner.stats()['actualNativeOutputsUsedAsNumericInput'])
                self.assertGreater(owner.stats()['failedElements'],0)
            finally:owner.close()
            self.assertTrue(owner.stats()['closed'])
            self.assertIsNone(owner.x)

    def test_known_private_paths_include_interrupted_prediction_backings_only(self):
        paths=sample.private_paths('/private/test')
        self.assertEqual(len(paths),33)
        self.assertIn(Path('/private/test/prediction-5/reference-v.f32'),paths)
        self.assertIn(Path('/private/test/prediction-input-0.json'),paths)
        self.assertTrue(all(path.is_relative_to('/private/test') for path in paths))


if __name__=='__main__':unittest.main()
