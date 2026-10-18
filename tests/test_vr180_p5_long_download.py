"""Long caller integration with real small files/receiver and injected browser APIs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import signal
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('download_fixtures',ROOT/'tests/test_vr180_browser_download.py')
fixtures=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixtures)
probe,stream=fixtures.probe,fixtures.stream
ORIGIN='http://127.0.0.1:12345'


class LongCallerDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.meta=self.root/'evidence';self.meta.mkdir();media=self.root/'media';media.mkdir()
        self.owned=probe.persistent.create_owned_profile(self.root)
        self.values={'input':b'a'*(stream.CHUNK_BYTES+17),'output':b'b'*37}
        self.entries=[{'id':name,'name':name+'.mp4','bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()} for name,value in self.values.items()]
        self.receiver=stream.MediaReceiver(media,{name:len(value) for name,value in self.values.items()},time.monotonic()+1200)
        self.report={'pageErrors':[],'workers':[]};self.signals=probe.ProducerSignals(self.report);self.signals.install(30)
        self.observed={'status':'READY_FOR_RUNNER_TRANSFER','files':self.entries}
        self.calls=[];self.options={};self.routes=[];self.page=None;test=self
        self.browser=types.SimpleNamespace(version='injected-contract-only',connected=True)
        self.browser.is_connected=lambda:self.browser.connected

        class Page(fixtures.FakePage):
            def set_default_timeout(self,*_):pass
            def on(self,name,callback):
                if name=='worker':callback(types.SimpleNamespace(url=ORIGIN+probe.WORKER_ROUTE))
                elif name=='download':super().on(name,callback)
            def goto(self,*_,**__):pass
            def evaluate(self,script,value=None):
                if script==probe.PAGE:return None
                if script==probe.CLEANUP:test.calls.append('namespace');return {'status':'REMOVED'}
                if script.startswith('({result:globalThis.__long?.transfer'):
                    if test.mode=='cancel':raise RuntimeError('INJECTED_SNAPSHOT_FAILURE')
                    return {'result':None,'progress':None}
                result=super().evaluate(script,value)
                if script==probe.DOWNLOAD_CLICK:
                    if test.mode=='cancel':self.block_path=self.entry['id']=='output'
                    if test.mode=='stop-unverified':
                        def stop_failed():raise RuntimeError('INJECTED_STOP_UNVERIFIED')
                        def cancel_failed():raise RuntimeError('INJECTED_CANCEL_FAILURE')
                        self.active.failure=stop_failed;self.active.cancel=cancel_failed
                return result

        class Context:
            def __init__(self,downloads):self.browser=test.browser;self.downloads=downloads
            def route(self,pattern,handler):test.routes.append((pattern,handler))
            def new_page(self):test.page=Page(self.downloads,test.values);return test.page
            def close(self):test.calls.append('close');test.browser.connected=False

        def launch(**options):
            test.options=options
            # This is the real OwnedDownloads created by browser_trial, not an
            # alternate owner for the same path.
            return Context(test.downloads)

        self.playwright=types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=launch))
        self.sampler=types.SimpleNamespace(start=lambda:None,stop=lambda:self.calls.append('sampler') or {})
        self.mode='success';self.downloads=None

    def tearDown(self):
        self.signals.restore();self.receiver.abort();self.temp.cleanup()

    def run_caller(self,*,native_error=None,deadline=None):
        original=stream.OwnedDownloads
        def create(parent):self.downloads=original(parent);return self.downloads
        with patch.object(probe.streaming,'OwnedDownloads',side_effect=create), \
             patch.object(probe,'wait_native',side_effect=native_error,return_value=self.observed), \
             patch.object(probe.calibration,'ChromeRssSampler',return_value=self.sampler):
            return probe.browser_trial(self.playwright,self.owned,ORIGIN,'p5-5gb',self.receiver,'a'*32,
              self.meta,self.report,deadline or time.monotonic()+1200,signals=self.signals)

    def test_actual_helper_success_keeps_guard_deadline_and_full_receipts_in_existing_records(self):
        before=time.monotonic();result=self.run_caller();after=time.monotonic()
        self.assertIs(result,self.observed);self.assertTrue(self.options['accept_downloads']);self.assertTrue(self.options['chromium_sandbox'])
        self.assertEqual(Path(self.options['downloads_path']).parent,self.owned['container'].parent)
        self.assertEqual(self.options['downloads_path'],str(self.downloads.path))
        self.assertLessEqual(before+600,self.receiver.deadline);self.assertLessEqual(self.receiver.deadline,after+600)
        self.assertEqual([pattern for pattern,_ in self.routes],['**/*'])
        allowed=[]
        for url in [ORIGIN+'/worker.mjs','https://example.invalid/external']:
            self.routes[0][1](types.SimpleNamespace(request=types.SimpleNamespace(url=url),continue_=lambda:allowed.append('continue'),abort=lambda:allowed.append('abort')))
        self.assertEqual(allowed,['continue','abort'])
        record=json.loads((self.meta/'runner-transfer.json').read_text());self.assertEqual(record['method'],'browser-download')
        self.assertEqual([r['rereadSHA256'] for r in record['files']],[e['sha256'] for e in self.entries])
        self.assertTrue(all(r['fsynced'] and r['closed'] for r in record['files']));self.assertTrue(self.report['completeCloudMedia'])
        self.assertEqual(self.page.deleted,2);self.assertEqual(self.page.revoked,2);self.assertEqual(self.calls,['namespace','close','sampler'])
        self.assertEqual(self.report['downloadDirectoryCleanup']['status'],'REMOVED');self.assertFalse(self.downloads.path.exists())
        self.assertEqual(self.report['profileCleanup']['status'],'REMOVED')
        lifecycle=json.loads((self.meta/'browser-lifecycle.json').read_text())
        self.assertEqual(lifecycle['browserDownload']['status'],'PASS');self.assertEqual(lifecycle['runnerTransferObservation']['server']['files'][0]['receipt']['sha256'],self.entries[0]['sha256'])
        self.assertTrue(lifecycle['downloadLifecycleAfterBrowserClose']['apiStopConfirmedBeforeClose'])

    def test_generation_failure_is_not_started_with_no_active_download_and_normal_cleanup(self):
        with self.assertRaisesRegex(RuntimeError,'GENERATION_FAILED'):self.run_caller(native_error=RuntimeError('GENERATION_FAILED'))
        self.assertEqual(self.report['browserDownload']['status'],'NOT_STARTED');self.assertEqual(self.page.created,[])
        self.assertEqual(self.receiver.files,{});self.assertTrue(self.report['downloadsStoppedBeforeBrowserClose'])
        self.assertEqual(self.calls,['namespace','close','sampler']);self.assertEqual(self.report['namespaceCleanup']['status'],'REMOVED')
        self.assertTrue(self.report['downloadLifecycleAfterBrowserClose']['noDownloadStarted'])
        self.assertFalse(self.report['downloadLifecycleAfterBrowserClose']['apiStopConfirmedBeforeClose'])
        self.assertEqual(self.report['downloadDirectoryCleanup']['status'],'REMOVED');self.assertEqual(self.report['profileCleanup']['status'],'REMOVED')
        self.assertFalse((self.meta/'runner-transfer.json').exists())

    def test_stop_unconfirmed_skips_opfs_cleanup_retains_unknown_download_and_profile_after_close(self):
        self.mode='stop-unverified'
        with self.assertRaisesRegex(RuntimeError,'INJECTED_STOP_UNVERIFIED'):self.run_caller()
        self.assertFalse(self.report['downloadsStoppedBeforeBrowserClose']);self.assertEqual(self.calls,['close','sampler'])
        self.assertEqual(self.report['namespaceCleanup']['status'],'HOLD');self.assertTrue(self.owned['unknownContent'])
        self.assertTrue(self.report['browserClosed']);self.assertFalse(self.report['downloadLifecycleAfterBrowserClose']['apiStopConfirmedBeforeClose'])
        self.assertEqual(self.report['downloadDirectoryCleanup']['status'],'HOLD');self.assertEqual(self.report['profileCleanup']['status'],'HOLD')
        self.assertTrue(self.downloads.path.exists());self.assertEqual(self.downloads.names(),['artifact-1'])
        self.assertEqual(self.report['downloadDirectoryAfterClose']['remainingNames'],['artifact-1'])
        self.assertEqual(self.page.revoked,1);self.assertFalse(self.report.get('completeCloudMedia',False))

    def test_transfer_cancel_retains_completed_receipt_if_browser_snapshot_fails_and_keeps_grace(self):
        self.mode='cancel'
        with self.assertRaises(probe.ProducerInterrupted):self.run_caller(deadline=time.monotonic()+.08)
        self.assertEqual(self.page.canceled,1);self.assertEqual(self.page.deleted,1);self.assertEqual(self.page.revoked,2)
        self.assertTrue(self.report['downloadsStoppedBeforeBrowserClose']);self.assertEqual(self.calls,['namespace','close','sampler'])
        lifecycle=json.loads((self.meta/'browser-lifecycle.json').read_text())
        self.assertEqual(lifecycle['runnerTransferObservationError'],'INJECTED_SNAPSHOT_FAILURE')
        self.assertIsNone(lifecycle['runnerTransferObservation']['browser'])
        files=lifecycle['runnerTransferObservation']['server']['files']
        self.assertEqual(files[0]['receipt']['rereadSHA256'],self.entries[0]['sha256']);self.assertTrue(files[0]['complete'])
        self.assertFalse(files[1]['complete']);self.assertEqual(files[1]['receivedBytes'],0)
        self.assertEqual(lifecycle['downloadDirectoryCleanup']['status'],'REMOVED');self.assertEqual(lifecycle['profileCleanup']['status'],'REMOVED')
        self.assertFalse((self.meta/'runner-transfer.json').exists());self.assertFalse(self.report.get('completeCloudMedia',False))
        self.assertEqual(self.report['status'],'FAIL');left=signal.getitimer(signal.ITIMER_REAL)[0]
        self.assertGreater(left,28);self.assertLessEqual(left,30)


if __name__=='__main__':unittest.main()
