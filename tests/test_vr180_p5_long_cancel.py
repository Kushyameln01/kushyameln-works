"""Actual process signals and fixed-oracle boundaries; no native media work."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('long_cancel_probe',ROOT/'development/vr180/p5-long-prototype/probe-long.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)


class CancellationTests(unittest.TestCase):
    def test_real_oracle_sigterm_stops_before_remaining_stages_and_closes_runtime(self):
        oracle=probe.load('long_cancel_real_oracle',ROOT/'tools/vr180/verify-conversion-large.py')
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);files=[root/'input.mp4',root/'output.mp4']
            for path in files:path.write_bytes(b'non-media contract fixture')
            stages=[];closed=[];report={'status':'WORKING','mediaArtifactReady':False}
            guard=probe.ProducerSignals(report);guard.install(10);original_close=oracle.Runtime.close
            def close(runtime):closed.append(True);return original_close(runtime)
            def cancel(*_):os.kill(os.getpid(),signal.SIGTERM)
            try:
                with patch.object(oracle,'tool_version',return_value='mock'), \
                     patch.object(oracle,'stream_info',return_value={'streams':[],'audio':[]}), \
                     patch.object(oracle,'check_metadata',side_effect=cancel), \
                     patch.object(oracle,'scan_frames',side_effect=lambda *_:stages.append('frames')), \
                     patch.object(oracle,'scan_packets',side_effect=lambda *_:stages.append('packets')), \
                     patch.object(oracle.Runtime,'close',close):
                    with self.assertRaisesRegex(probe.ProducerInterrupted,'SIGTERM'):
                        oracle.verify_files(*files,layout='sbs',fov=180,eye_size=512,mode='convert',timeout=5,log_dir=root/'logs')
            finally:guard.restore()
            self.assertEqual(stages,[]);self.assertEqual(closed,[True])
            self.assertEqual(report['status'],'FAIL');self.assertFalse(report['mediaArtifactReady'])

    def test_main_catches_real_sigterm_and_sigalrm_and_emits_failed_evidence(self):
        for number in (signal.SIGTERM,signal.SIGALRM):
            with self.subTest(number=number),tempfile.TemporaryDirectory() as temp:
                out=Path(temp)/'run';captured=io.StringIO()
                def cancel(*_):os.kill(os.getpid(),number)
                with patch.object(probe.calibration,'require_toolchain',side_effect=cancel), \
                     patch.object(probe.cloud,'emit_evidence',return_value=True) as emit,contextlib.redirect_stdout(captured):
                    code=probe.main(['--bundle',str(Path(temp)/'missing.mjs'),'--output',str(out),'--profile','p5-5gb',
                      '--oracle-toolchain',str(Path(temp)/'missing.json')])
                self.assertEqual(code,1);self.assertEqual(emit.call_count,1)
                report=json.loads((out/'evidence/run.json').read_text())
                self.assertEqual(report['status'],'FAIL');self.assertFalse(report['mediaArtifactReady'])
                self.assertEqual(report['interruption']['signal'],signal.Signals(number).name)
                self.assertIn('ProducerInterrupted',report['error'])
                self.assertFalse((out/'media/source-manifest.json').exists())

    def test_first_signal_inside_finish_or_emission_invalidates_all_owned_readiness_files(self):
        for when in ('shutdown','emission'):
            with self.subTest(when=when),tempfile.TemporaryDirectory() as temp:
                out=Path(temp);meta=out/'evidence';media=out/'media';meta.mkdir();media.mkdir();publications=[]
                for path in (media/'source-manifest.json',media/'quality-evidence.json',media/'producer-evidence.tar.gz',meta/'producer-record.json'):
                    probe.write_owned_publication(path,b'owned test bytes',publications,float('inf'))
                report={'runId':'signal-contract','status':'READY_FOR_SEGMENTED_RECOVERY','mediaArtifactReady':True}
                events=[];guard=probe.ProducerSignals(report);guard.install(10)
                def interrupt():
                    os.kill(os.getpid(),signal.SIGTERM);os.kill(os.getpid(),signal.SIGTERM);os.kill(os.getpid(),signal.SIGALRM)
                def shutdown():
                    events.append('shutdown')
                    if when=='shutdown':interrupt()
                def emit(*_):
                    events.append('emit')
                    if when=='emission':interrupt()
                    return True
                receiver=types.SimpleNamespace(deadline=1,abort=lambda:events.append('abort') or {'status':'REMOVED'})
                server=types.SimpleNamespace(shutdown=shutdown,server_close=lambda:events.append('close'))
                try:
                    with patch.object(probe.cloud,'emit_evidence',side_effect=emit),contextlib.redirect_stdout(io.StringIO()):
                        result=probe.finish_run(out,meta,report,guard,owned=None,receiver=receiver,server=server,
                          publications=publications,started=time.monotonic(),producer_deadline=time.monotonic()+10)
                finally:guard.restore()
                self.assertEqual(report['status'],'FAIL');self.assertFalse(report['mediaArtifactReady'])
                self.assertEqual(report['publicationCleanup']['status'],'REMOVED')
                self.assertEqual(report['interruption']['repeatedSignals'],2)
                self.assertIn('abort',events);self.assertIn('close',events)
                self.assertTrue(all(not row['path'].exists() for row in publications))
                final=json.loads((meta/'run.json').read_text());self.assertEqual(final['status'],'FAIL')
                if when=='emission':
                    self.assertFalse(result);self.assertTrue(final['interruption']['evidenceEmissionInvalidated'])

    def test_repeated_signals_do_not_extend_bounded_cleanup_grace_and_exit_124(self):
        # The production grace is 30s; this isolated child uses a 1s test grace.
        code="""import importlib.util,os,signal,time
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path('development/vr180/p5-long-prototype/probe-long.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
g=p.ProducerSignals({},grace_seconds=1);g.install(10)
try:os.kill(os.getpid(),signal.SIGTERM)
except p.ProducerInterrupted:pass
g.begin_cleanup();os.kill(os.getpid(),signal.SIGTERM);os.kill(os.getpid(),signal.SIGALRM)
time.sleep(5)
raise RuntimeError('GRACE_NOT_BOUNDED')
"""
        started=time.monotonic();result=subprocess.run(['python','-c',code],cwd=ROOT,capture_output=True,timeout=4)
        self.assertEqual(result.returncode,124);self.assertLess(time.monotonic()-started,4)
        self.assertEqual(probe.ProducerSignals.CLEANUP_GRACE_SECONDS,30)

    def test_browser_finally_preserves_base_interruption_and_still_closes_and_cleans(self):
        with tempfile.TemporaryDirectory() as temp:
            owned=probe.persistent.create_owned_profile(temp);calls=[];report={'pageErrors':[],'workers':[]}
            class Browser:
                version='mock-contract-only';connected=True
                def is_connected(self):return self.connected
            browser=Browser()
            class Page:
                def set_default_timeout(self,*_):pass
                def on(self,*_):pass
                def goto(self,*_,**__):pass
                def evaluate(self,text,_arg=None):
                    if text==probe.CLEANUP:calls.append('namespace');return {'status':'REMOVED'}
            class Context:
                def __init__(self):self.browser=browser
                def route(self,*_):pass
                def new_page(self):return Page()
                def close(self):calls.append('close');browser.connected=False
            playwright=types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=lambda **kw:Context()))
            sampler=types.SimpleNamespace(start=lambda:None,stop=lambda:calls.append('sampler') or {})
            with patch.object(probe,'wait_native',side_effect=probe.ProducerInterrupted('PRIMARY_INTERRUPTION')), \
                 patch.object(probe.calibration,'ChromeRssSampler',return_value=sampler):
                with self.assertRaisesRegex(probe.ProducerInterrupted,'PRIMARY_INTERRUPTION'):
                    probe.browser_trial(playwright,owned,'http://127.0.0.1:1','p5-5gb',None,None,Path(temp),report)
            self.assertEqual(calls,['namespace','close','sampler']);self.assertEqual(report['profileCleanup']['status'],'REMOVED')


if __name__=='__main__':unittest.main()
