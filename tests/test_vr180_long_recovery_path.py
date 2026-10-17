"""Real tiny ZIP/bundle integration; codec/original semantic verdicts are injected.

This checks long-profile routing, not 5GB capacity or real-media quality.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT/relative)
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value); return value
r = load('long_path_receiver', 'tools/vr180/receive-in-actions.py')
common = load('long_path_common', 'tools/vr180/receive-media-evidence.py')
long = load('long_path_helper', 'tools/vr180/receive-long-media-evidence.py')
fixture = load('long_path_fixture', 'tests/test_vr180_p5_long_bundle.py')

class LongRecoveryPathTests(unittest.TestCase):
    def run_case(self, profile, verdict, error=None):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); source = root/'source'; source.mkdir()
            meta, media, files = fixture.fixture(source)
            identity = dict(fixture.IDENTITY, job='p5-long-producer')
            producer_sha = hashlib.sha256((ROOT/long.PRODUCER).read_bytes()).hexdigest()
            manifest = fixture.probe.write_transport_manifests(meta, media, identity, profile, files, 300,
                {'mediaVerdict': 'PASS', 'completeScan': True}, producer_sha,
                run_id=f"{identity['runId']}-{profile}-{identity['runAttempt']}")
            raw_source = (media/'source-manifest.json').read_bytes()
            manifest.update(schema='vr180-segmented-transfer-v1', status='COMPLETE', partCount=2,
                sourceManifestSHA256=hashlib.sha256(raw_source).hexdigest(), metadataArtifactCount=1)
            hashes = lambda names, commit: {n: hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in names}
            paths = ['development/vr180/artifact-transfer-action/'+n for n in r.SENDER_FILES]+[long.PRODUCER]
            manifest['provenance'] = {'sourceHashes': hashes(paths, identity['commit']),
                'generatorScriptPath': long.PRODUCER, 'generatorScriptSHA256': producer_sha}
            archives = {}; rows = []; prefix = r.r.prefix(manifest)
            def archive(name, entry, raw):
                aid = len(archives)+1; path = root/f'{aid}.zip'
                with zipfile.ZipFile(path, 'w') as z: z.writestr(entry, raw)
                size, sha = r.r.hash_file(path); archives[aid] = path
                a = {'id':aid, 'name':name, 'sizeBytes':size, 'digest':'sha256:'+sha}
                rows.append({'id':aid,'name':name,'size_in_bytes':size,'digest':a['digest'],'expired':False,
                    'workflow_run':{'id':int(identity['runId']),'head_sha':identity['commit'],
                                    'head_branch':identity['ref'].removeprefix('refs/heads/')}})
                return a
            for f in manifest['files']:
                a = archive(prefix+'-'+f['id']+'-00000','chunk.bin',(media/f['name']).read_bytes())
                f.update(partCount=1,parts=[{'index':0,'offset':0,'length':f['bytes'],'sha256':f['sha256'],'artifact':a}])
            b = manifest['evidenceBundle']; b['artifact'] = archive(prefix+'-evidence','evidence.bin',(media/b['name']).read_bytes())
            raw = json.dumps(manifest).encode(); a = archive(prefix+'-complete','completion.json',raw)
            receipt = {'schema':'vr180-segmented-transfer-v1','status':'COMPLETE_MANIFEST_UPLOADED',
                'identity':identity,'profile':profile,'totalBytes':manifest['totalBytes'],'partCount':2,
                'metadataArtifactCount':1,'artifactCount':4,
                'completion':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'artifact':a}}
            env = {'GITHUB_REPOSITORY':identity['repository'],'GITHUB_SHA':identity['commit'],'GITHUB_REF':identity['ref'],
                   'GITHUB_RUN_ID':identity['runId'],'GITHUB_RUN_ATTEMPT':str(identity['runAttempt']),
                   'GITHUB_JOB':'p5-long-receiver','RUNNER_TEMP':str(root)}
            def download(a, stage, deadline):
                p=stage/'part.zip'; shutil.copyfile(archives[a['id']],p); return p, {'testInjectedTransport':True}
            def choose(name, path): return long if name == 'long_media_receiver' else common
            with patch.object(r,'load',side_effect=choose), patch.object(r,'exact_sources',side_effect=hashes), \
                 patch.object(r,'public_metadata',return_value={'artifacts':rows}), patch.object(r,'download',side_effect=download), \
                 patch.object(common,'prepare_oracle',return_value=(None,None,{})), \
                 patch.object(long,'validate_original_records',return_value={'status':'PASS','testInjectedOriginalVerdict':True}), \
                 patch.object(long,'verify_media',return_value={'status':verdict,'completeScan':True},side_effect=error) as verify, \
                 patch.object(r.c,'emit_evidence',return_value=True):
                result = r.recover(receipt,profile,root/'received',env)[0]
            self.assertEqual(len(verify.call_args.args),7)
            self.assertEqual(verify.call_args.args[-1]['profile'],profile)
            state=json.loads((root/'received/media/recovery.json').read_text())
            self.assertEqual(state['status'],'PASS')
            for f in files: self.assertEqual((root/'received/media'/f['name']).read_bytes(),(media/f['name']).read_bytes())
            return result

    def test_long_profiles_route_all_four_archives_and_manifest_to_long_oracle(self):
        for profile in ('p5-5gb','p5-10gb'):
            with self.subTest(profile=profile):
                result=self.run_case(profile,'PASS')
                self.assertEqual(result['status'],'PASS_COMPLETE_MEDIA'); self.assertEqual(result['downloadArtifacts'],4)

    def test_complete_negative_quality_is_preserved(self):
        self.assertEqual(self.run_case('p5-5gb','FAIL')['status'],'COMPLETE_MEDIA_FAIL')

    def test_cancellation_after_bytes_never_becomes_complete_quality_failure(self):
        result=self.run_case('p5-5gb','PASS',r.ReceiverCancelled('RECEIVER_CANCELLED'))
        self.assertEqual(result['status'],'FAIL'); self.assertEqual(result['reason'],'RECEIVER_CANCELLED')

if __name__ == '__main__': unittest.main()
