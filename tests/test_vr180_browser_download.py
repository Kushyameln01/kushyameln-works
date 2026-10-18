"""Real small files and signal deadlines; injected Playwright, never native acceptance."""
import hashlib
import importlib.util
import os
from pathlib import Path
import signal
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('download_probe',ROOT/'tools/vr180/probe-loopback-transfer.py')
diag=importlib.util.module_from_spec(spec);spec.loader.exec_module(diag)
probe,stream=diag.probe,diag.streaming


class FakePage:
    def __init__(self,owned,values,*,block_path=False,delete_fails=False):
        self.owned,self.values=owned,values;self.block_path=block_path;self.delete_fails=delete_fails
        self.listener=None;self.active=None;self.url=False;self.created=[];self.canceled=0;self.deleted=0;self.revoked=0;self.timeouts=[]
    def on(self,name,callback):assert name=='download';self.listener=callback
    def remove_listener(self,name,callback):assert self.listener is callback;self.listener=None
    def expect_download(self,timeout):
        self.timeouts.append(timeout);page=self
        class Event:
            @property
            def value(self):return page.active
            def __enter__(self):return self
            def __exit__(self,*_):pass
        return Event()
    def evaluate(self,script,value=None):
        if script==probe.DOWNLOAD_URL:
            assert not self.url;self.url=True;self.entry=value;return {'id':value['id'],'bytes':value['bytes']}
        if script==probe.DOWNLOAD_REVOKE:
            had=self.url;self.url=False;self.revoked+=int(had);return {'status':'REVOKED' if had else 'NOT_CREATED'}
        assert script==probe.DOWNLOAD_CLICK and self.url
        self.owned.require_empty();path=self.owned.path/('artifact-'+str(len(self.created)+1));path.write_bytes(self.values[self.entry['id']])
        self.created.append(path);page=self
        class Download:
            suggested_filename=value;terminal=None
            def path(self):
                if page.block_path:time.sleep(1)
                return str(path)
            def failure(self):return self.terminal
            def cancel(self):
                page.canceled+=1;self.terminal='canceled';path.unlink(missing_ok=True)
            def delete(self):
                if page.delete_fails:raise RuntimeError('INJECTED_DELETE_FAILED')
                path.unlink();page.deleted+=1
        self.active=Download();self.listener(self.active)


class BrowserDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.media=self.root/'media';self.media.mkdir()
        self.owned=stream.OwnedDownloads(self.root);self.deadline=time.monotonic()+10
        self.values={'input':b'a'*(stream.CHUNK_BYTES+17),'output':b'b'*37}
        self.entries=[{'id':name,'name':name+'.mp4','bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()} for name,value in self.values.items()]
        self.receiver=stream.MediaReceiver(self.media,{name:len(value) for name,value in self.values.items()},self.deadline);self.receiver.prepare(self.entries)
        self.signals=probe.ProducerSignals({});self.signals.install(10)
    def tearDown(self):
        self.signals.restore();self.receiver.abort();self.temp.cleanup()
    def test_serial_completed_downloads_use_real_bounded_copy_hash_fsync_reread_and_delete_before_next(self):
        page=FakePage(self.owned,self.values);record={};sizes=[];original=self.receiver.chunk
        def chunk(ident,offset,data):sizes.append(len(data));return original(ident,offset,data)
        with patch.object(self.receiver,'chunk',side_effect=chunk):probe.download_to_receiver(page,self.receiver,self.owned,self.entries,self.deadline,self.signals,record)
        self.assertEqual(record['status'],'PASS');self.assertTrue(record['allStoppedBeforeBrowserClose']);self.assertEqual(page.deleted,2);self.assertEqual(page.revoked,2)
        self.assertEqual(sizes,[stream.CHUNK_BYTES,17,37]);self.assertEqual(self.owned.names(),[]);self.assertLessEqual(page.timeouts[1],page.timeouts[0])
        self.assertEqual([r['rereadSHA256'] for r in self.receiver.receipts()],[r['sha256'] for r in self.entries])
        self.assertTrue(all(row['stoppedBeforeBrowserClose'] and row['cleanup']['delete']['absent'] for row in record['files']))
        self.assertEqual(self.owned.cleanup()['status'],'REMOVED')
    def test_blocking_path_is_interrupted_then_cancel_stopped_revoke_without_resetting_grace(self):
        page=FakePage(self.owned,self.values,block_path=True);record={};deadline=time.monotonic()+.04
        with self.assertRaises(probe.ProducerInterrupted):probe.download_to_receiver(page,self.receiver,self.owned,self.entries,deadline,self.signals,record)
        self.assertEqual(record['status'],'FAIL');self.assertEqual(len(page.created),1);self.assertEqual(page.canceled,1);self.assertEqual(page.revoked,1)
        self.assertTrue(record['files'][0]['stoppedBeforeBrowserClose']);self.assertEqual(record['files'][0]['terminalFailure'],'canceled');self.assertEqual(self.owned.names(),[])
        remaining=signal.getitimer(signal.ITIMER_REAL)[0];self.assertGreater(remaining,29);self.assertLessEqual(remaining,30)
        self.signals.handle(signal.SIGTERM);self.assertLessEqual(signal.getitimer(signal.ITIMER_REAL)[0],remaining)
    def test_hash_failure_stays_primary_when_delete_fails_and_url_cleanup_still_runs(self):
        page=FakePage(self.owned,self.values,delete_fails=True);record={}
        self.receiver.files['input']['entry']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'TRANSFER_WHOLE_HASH'):
            probe.download_to_receiver(page,self.receiver,self.owned,self.entries,self.deadline,self.signals,record)
        self.assertEqual(page.revoked,1);self.assertEqual(len(page.created),1)
        self.assertEqual(record['files'][0]['cleanup']['delete']['status'],'HOLD');self.assertTrue(page.created[0].exists())
        self.assertEqual(record['files'][0]['cleanup']['directoryEmpty']['status'],'HOLD')
    def test_unknown_entry_is_preserved_and_never_adopted_or_downloaded(self):
        sentinel=self.owned.path/'unknown';sentinel.write_bytes(b'keep');page=FakePage(self.owned,self.values);record={}
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_UNKNOWN_ENTRY'):
            probe.download_to_receiver(page,self.receiver,self.owned,self.entries,self.deadline,self.signals,record)
        self.assertEqual(sentinel.read_bytes(),b'keep');self.assertEqual(page.created,[])
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_UNKNOWN_ENTRY'):self.owned.cleanup()
    def test_symlink_wrong_size_and_outside_paths_never_reach_receiver(self):
        outside=self.root/'outside';outside.write_bytes(b'unknown');link=self.owned.path/'link';link.symlink_to(outside)
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_FILE_IDENTITY_OR_SIZE'):self.owned.admit(link,7)
        with self.assertRaisesRegex(ValueError,'OUTSIDE_OWNER'):self.owned.admit(outside,7)
        link.unlink();file=self.owned.path/'owned';file.write_bytes(b'short')
        with self.assertRaisesRegex(ValueError,'DOWNLOAD_FILE_IDENTITY_OR_SIZE'):self.owned.admit(file,100)
        self.assertEqual(self.receiver.files['input']['count'],0)
    def test_copy_detects_path_replacement_and_preserves_the_replacement(self):
        source=self.owned.path/'source';source.write_bytes(self.values['input']);identity=self.owned.admit(source,len(self.values['input']))
        original=self.receiver.chunk;changed=False
        def replace(ident,offset,data):
            nonlocal changed
            value=original(ident,offset,data)
            if not changed:
                source.rename(self.root/'original-retained');source.write_bytes(b'foreign');changed=True
            return value
        with patch.object(self.receiver,'chunk',side_effect=replace):
            with self.assertRaisesRegex(ValueError,'DOWNLOAD_OPEN_CHANGED'):
                self.owned.copy_to_receiver(source,identity,self.receiver,'input',self.deadline)
        self.assertEqual(source.read_bytes(),b'foreign');self.assertFalse(self.receiver.files['input']['complete'])
    def test_copy_requires_eof_after_expected_bytes(self):
        source=self.owned.path/'source';source.write_bytes(self.values['output']);identity=self.owned.admit(source,len(self.values['output']))
        original=self.receiver.chunk
        def append(ident,offset,data):
            result=original(ident,offset,data)
            with source.open('ab') as target:target.write(b'x')
            return result
        with patch.object(self.receiver,'chunk',side_effect=append):
            with self.assertRaisesRegex(ValueError,'DOWNLOAD_SOURCE_EXTRA_BYTES'):
                self.owned.copy_to_receiver(source,identity,self.receiver,'output',self.deadline)
        self.assertFalse(self.receiver.files['output']['complete'])
    def test_stage_restores_only_unelapsed_parent_time_and_sigterm_preserves_grace(self):
        before=signal.getitimer(signal.ITIMER_REAL)[0]
        with self.signals.bounded_stage(time.monotonic()+1,'short-test'):
            self.assertLessEqual(signal.getitimer(signal.ITIMER_REAL)[0],1)
        restored=signal.getitimer(signal.ITIMER_REAL)[0];self.assertLessEqual(restored,before);self.assertGreater(restored,before-1)
        with self.assertRaises(probe.ProducerInterrupted):
            with self.signals.bounded_stage(time.monotonic()+1,'sigterm-test'):os.kill(os.getpid(),signal.SIGTERM)
        self.assertGreater(signal.getitimer(signal.ITIMER_REAL)[0],29);self.assertLessEqual(signal.getitimer(signal.ITIMER_REAL)[0],30)


if __name__=='__main__':unittest.main()
