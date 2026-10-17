"""Producer contract tests only: no native browser or large media generation."""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('long_probe',ROOT/'development/vr180/p5-long-prototype/probe-long.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
IDENTITY={'repository':'Kushyameln01/kushyameln-works','commit':'1'*40,'ref':'refs/heads/codex/vr180-plan-1-2','runId':'123','runAttempt':1,'job':'long'}

class LongProbeTests(unittest.TestCase):
    def test_js_sources_parse_and_every_relative_import_is_in_served_closure(self):
        for text in [probe.PAGE,probe.TRANSFER,probe.CLEANUP]:
            subprocess.run(['node','--input-type=module','--check'],input='('+text+')',text=True,check=True,capture_output=True)
        paths=set(probe.SOURCE_FILES)
        for relative in paths:
            path=ROOT/relative
            for match in re.finditer(r"^import[^\n]+from ['\"]([^'\"]+)['\"]",path.read_text(),re.M):
                target=match.group(1)
                if target=='/fork.mjs':continue
                resolved=(path.parent/target).resolve().relative_to(ROOT).as_posix()
                self.assertIn(resolved,paths,relative+' imports '+resolved)
        output=subprocess.check_output(['node','--input-type=module','-e',"import {LONG_PROFILES} from './development/vr180/p5-long-prototype/profile.mjs';console.log(JSON.stringify(LONG_PROFILES))"],cwd=ROOT)
        js=json.loads(output)
        for name,profile in probe.PROFILES.items():self.assertEqual(js[name],{'id':name,**profile})
    def test_quality_complete_failure_is_transportable_and_same_raw_bytes_are_in_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            meta=Path(temp)/'evidence';media=Path(temp)/'media';meta.mkdir();media.mkdir()
            names=['browser-observations.json','browser-lifecycle.json','runner-transfer.json','private-source-inventory.json',
              'fork-build-result.json','oracle-toolchain.json','independent-verification.json','packet-statistics.json','source-provenance.json']
            for name in names:(meta/name).write_text('{}\n')
            (meta/'oracle-logs').mkdir();(meta/'oracle-logs'/'input-frames.stderr.log').write_text('a bounded diagnostic')
            files=[{'id':s,'name':s+'.mp4','bytes':2,'sha256':'1'*64} for s in ['input','output']]
            manifest=probe.write_transport_manifests(meta,media,IDENTITY,'p5-5gb',files,300,{'completeScan':True,'mediaVerdict':'FAIL'},'2'*64)
            raw=(meta/'quality-evidence.json').read_bytes();self.assertEqual(raw,(media/'quality-evidence.json').read_bytes())
            quality=json.loads(raw);self.assertEqual(quality['mediaVerdict'],'FAIL');self.assertEqual(manifest['status'],'GENERATED_AND_REREAD')
            self.assertEqual(manifest['qualityEvidence']['sha256'],hashlib.sha256(raw).hexdigest())
            self.assertEqual(manifest['sourceSHA256'],quality['sourceSHA256']);self.assertEqual(len(quality['evidence']),11)
            self.assertIn('producer-record.json',{ref['path'] for ref in quality['evidence']})
            self.assertEqual(manifest['evidenceBundle']['sha256'],hashlib.sha256((media/'producer-evidence.tar.gz').read_bytes()).hexdigest())
            for ref in quality['evidence']:
                actual=(meta/ref['path']).read_bytes();self.assertEqual(ref['bytes'],len(actual));self.assertEqual(ref['sha256'],hashlib.sha256(actual).hexdigest())
    def test_partial_scan_or_symlink_reference_never_produces_source_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            meta=Path(temp)/'meta';media=Path(temp)/'media';meta.mkdir();media.mkdir()
            with self.assertRaisesRegex(Exception,'COMPLETE_QUALITY'):
                probe.write_transport_manifests(meta,media,IDENTITY,'p5-5gb',[],1,{'completeScan':False,'mediaVerdict':'FAIL'},'2'*64)
            (meta/'browser-observations.json').symlink_to(Path(temp)/'outside')
            with self.assertRaisesRegex(Exception,'SYMLINK'):
                probe.write_transport_manifests(meta,media,IDENTITY,'p5-5gb',[],1,{'completeScan':True,'mediaVerdict':'FAIL'},'2'*64)
            self.assertFalse((media/'source-manifest.json').exists())
    def test_preflight_failure_emits_real_complete_bounded_archive_without_media(self):
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'run';log=io.StringIO()
            with patch.dict(os.environ,{'GITHUB_RUN_ID':'contract','GITHUB_RUN_ATTEMPT':'3'}),contextlib.redirect_stdout(log):
                code=probe.main(['--bundle',str(Path(temp)/'missing.mjs'),'--output',str(out),'--profile','p5-5gb',
                  '--oracle-toolchain',str(Path(temp)/'missing.json')])
            self.assertEqual(code,1);report=json.loads((out/'evidence/run.json').read_text())
            self.assertEqual(report['runId'],'contract-p5-5gb-3');self.assertFalse(report['mediaArtifactReady']);self.assertFalse(report['completeScan'])
            self.assertEqual(list((out/'media').iterdir()),[])
            lines=log.getvalue().splitlines();begin=json.loads(next(l.split(' ',1)[1] for l in lines if l.startswith('VR180_EVIDENCE_BEGIN ')))
            payload=base64.b64decode(''.join(l.split(' ',2)[2] for l in lines if l.startswith('VR180_EVIDENCE_CHUNK ')),validate=True)
            self.assertTrue(begin['complete']);self.assertEqual(begin['sha256'],hashlib.sha256(payload).hexdigest())
            with tarfile.open(fileobj=io.BytesIO(payload),mode='r:gz') as archive:
                manifest=json.load(archive.extractfile('manifest.json'));self.assertEqual(manifest['runId'],report['runId'])
                for entry in manifest['files']:
                    raw=archive.extractfile(entry['name']).read();self.assertEqual(len(raw),entry['bytes']);self.assertEqual(hashlib.sha256(raw).hexdigest(),entry['sha256'])
                self.assertEqual(json.load(archive.extractfile('run.json')),report)
    def test_whole_producer_deadline_is_failure_without_a_source_manifest(self):
        with tempfile.TemporaryDirectory() as temp:
            out=Path(temp)/'run';log=io.StringIO()
            with patch.object(probe.calibration,'require_toolchain',side_effect=probe.cloud.Deadline('whole producer deadline')), \
                 patch.object(probe.signal,'alarm') as alarm,contextlib.redirect_stdout(log):
                code=probe.main(['--bundle',str(Path(temp)/'missing.mjs'),'--output',str(out),'--profile','p5-10gb',
                  '--oracle-toolchain',str(Path(temp)/'missing.json')])
            self.assertEqual(code,1);self.assertEqual([call.args[0] for call in alarm.call_args_list],[5100,0])
            report=json.loads((out/'evidence/run.json').read_text());self.assertEqual(report['status'],'FAIL')
            self.assertFalse((out/'media/source-manifest.json').exists());self.assertFalse(report['completeScan'])

    def test_cleanup_deadline_cannot_be_swallowed_into_ready_browser_result(self):
        for expiry in ['alarm','monotonic']:
            with self.subTest(expiry=expiry),tempfile.TemporaryDirectory() as temp:
                owned=probe.persistent.create_owned_profile(temp);report={'pageErrors':[],'workers':[]};calls=0;expired=False;now=probe.time.monotonic()
                class Browser:
                    version='mock-contract-only';connected=True
                    def is_connected(self):return self.connected
                browser=Browser()
                class Page:
                    def set_default_timeout(self,*_):pass
                    def on(self,name,callback):
                        if name=='worker':callback(types.SimpleNamespace(url='http://127.0.0.1:1'+probe.WORKER_ROUTE))
                    def goto(self,*_,**__):pass
                    def wait_for_function(self,*_,**__):pass
                    def evaluate(self,text,_arg=None):
                        if text==probe.CLEANUP:return {'status':'REMOVED'}
                        if text=='globalThis.__long.transfer':return {'status':'PASS'}
                class Context:
                    def __init__(self):self.browser=browser
                    def route(self,*_):pass
                    def new_page(self):return Page()
                    def close(self):browser.connected=False
                def snapshot(_):
                    nonlocal calls,expired
                    calls+=1
                    if calls==2:
                        if expiry=='alarm':raise probe.cloud.Deadline('REVIEW_GLOBAL_DEADLINE')
                        expired=True
                    return {}
                playwright=types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=lambda **kw:Context()))
                receiver=types.SimpleNamespace(prepare=lambda rows:None,receipts=lambda:[])
                sampler=types.SimpleNamespace(start=lambda:None,stop=lambda:{'status':'MOCK'})
                with patch.object(probe,'wait_native',return_value={'status':'READY_FOR_RUNNER_TRANSFER','files':[]}), \
                     patch.object(probe.persistent,'profile_snapshot',side_effect=snapshot), \
                     patch.object(probe.calibration,'ChromeRssSampler',return_value=sampler), \
                     patch.object(probe.time,'monotonic',side_effect=lambda:now+61 if expired else now):
                    with self.assertRaises((probe.cloud.Deadline,TimeoutError)):
                        probe.browser_trial(playwright,owned,'http://127.0.0.1:1','p5-5gb',receiver,'a'*32,Path(temp),report,now+60)
                self.assertEqual(report['profileCleanup']['status'],'REMOVED');self.assertTrue(owned['browserClosed'])
    def test_manifest_written_at_expiry_is_removed_only_when_owned(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'source-manifest.json';publications=[];now=probe.time.monotonic();expired=False
            def fsync(_):
                nonlocal expired
                expired=True
            with patch.object(probe.os,'fsync',side_effect=fsync),patch.object(probe.time,'monotonic',side_effect=lambda:now+2 if expired else now):
                with self.assertRaises(TimeoutError):probe.write_owned_publication(path,b'{}',publications,now+1)
            self.assertTrue(path.exists());self.assertEqual(probe.cleanup_publications(publications)['status'],'REMOVED');self.assertFalse(path.exists())
            publications=[];probe.write_owned_publication(path,b'ours',publications,float('inf'));path.rename(Path(temp)/'old');path.write_bytes(b'unknown')
            self.assertEqual(probe.cleanup_publications(publications)['status'],'HOLD');self.assertEqual(path.read_bytes(),b'unknown')

    def test_actual_page_cleanup_rejects_unknown_namespace_and_unknown_entries_without_deletion(self):
        code='''const cleanup=FUNCTION;let removed=0;Object.defineProperty(globalThis,'navigator',{value:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>({async *entries(){yield ['foreign',{kind:'file'}]},removeEntry:async()=>removed++}),removeEntry:async()=>removed++})},locks:{request:async(n,o,f)=>f({}),query:async()=>({held:[]})}},configurable:true});
for(const error of [{message:'NAMESPACE_EXISTS'},{name:'TypeMismatchError'}]){globalThis.__long={worker:{terminate(){}},result:{namespaceOwned:false,error},namespaceOwned:false};let failed=false;try{await cleanup()}catch{failed=true}if(!failed||removed)throw Error('UNKNOWN_ADOPTED')}
globalThis.__long={namespace:'v-test',worker:{terminate(){}},namespaceOwned:true,ownedMediaFiles:['input.mp4'],result:{ownerRecordsRemoved:true,indexDirectoriesRemoved:true,heldLocks:0,indexReservedAfterCleanup:0}};let failed=false;try{await cleanup()}catch(e){failed=e.message==='UNKNOWN_NAMESPACE_ENTRY'}if(!failed||removed)throw Error('FOREIGN_DELETED');'''.replace('FUNCTION','('+probe.CLEANUP+')')
        subprocess.run(['node','--input-type=module'],input=code,text=True,check=True,capture_output=True)
    def test_browser_trial_cleanup_failure_retains_real_owned_profile_after_normal_close(self):
        with tempfile.TemporaryDirectory() as temp:
            owned=probe.persistent.create_owned_profile(temp);foreign=owned['path']/'foreign';foreign.write_text('keep')
            class Browser:
                version='mock-contract-only'
                connected=True
                def is_connected(self):return self.connected
            class Page:
                def set_default_timeout(self,*_):pass
                def on(self,*_):pass
                def goto(self,*_,**__):pass
                def evaluate(self,text,_arg=None):
                    if text==probe.CLEANUP:raise RuntimeError('UNKNOWN_NAMESPACE_ENTRY')
            browser=Browser()
            class Context:
                def __init__(self):self.browser=browser
                def route(self,*_):pass
                def new_page(self):return Page()
                def close(self):browser.connected=False
            playwright=types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=lambda **kw:Context()))
            report={'pageErrors':[],'workers':[]};observed={'status':'FAIL','files':[],'error':{'message':'UNKNOWN_NAMESPACE_ENTRY'}}
            with patch.object(probe,'wait_native',return_value=observed):
                with self.assertRaises(Exception):probe.browser_trial(playwright,owned,'http://127.0.0.1:1','p5-5gb',None,None,Path(temp),report)
            self.assertTrue(owned['browserClosed']);self.assertTrue(owned['unknownContent']);self.assertEqual(report['profileCleanup']['status'],'HOLD')
            self.assertEqual(foreign.read_text(),'keep')

if __name__=='__main__':unittest.main()
