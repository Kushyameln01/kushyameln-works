"""No model inference: exact bounded coverage, identities, source and cleanup."""
import importlib.util
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('production_chunk_browser',Path(__file__).with_name('production-chunk-browser.py'))
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CoverageTests(unittest.TestCase):
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


if __name__=='__main__':unittest.main()
