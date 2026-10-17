import hashlib,importlib.util,json,tempfile,unittest,zipfile
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('receive',ROOT/'tools/vr180/verify-calibration-artifact.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class Receiver(unittest.TestCase):
    def prepare(self,root,*,quality='FAIL',extra=False):
        files={'input.mp4':b'input fixture bytes'*4096,'output.mp4':b'output fixture bytes'*4096}
        manifest={'schema':'vr180-calibration-media-artifact-v1','runId':'77-p5-32-32-2','checkoutCommit':'a'*40,'case':'32-32',
          'files':[{'name':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()]}
        cloud={'runId':manifest['runId'],'checkoutCommit':'a'*40,'case':'32-32','status':'READY_FOR_ARTIFACT_RECOVERY',
          'completeCloudMedia':True,'calibrationVerdict':quality,'mediaManifest':manifest}
        archive=root/'archive.zip'
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_STORED) as z:
            for n,b in files.items():z.writestr(n,b)
            z.writestr('media-manifest.json',json.dumps(manifest))
            if extra:z.writestr('unexpected.bin',b'not accepted')
        metadata={'id':12,'name':'vr180-p5-32-32-77-2','expired':False,'created_at':'2026-10-17T00:00:00Z','expires_at':'2026-10-18T00:00:00Z',
          'size_in_bytes':archive.stat().st_size,'digest':'sha256:'+hashlib.sha256(archive.read_bytes()).hexdigest(),
          'workflow_run':{'id':77,'head_sha':'a'*40,'head_branch':'codex/vr180-plan-1-2'}}
        (root/'metadata.json').write_text(json.dumps(metadata));(root/'cloud.json').write_text(json.dumps(cloud))
        return SimpleNamespace(archive=archive,metadata=root/'metadata.json',cloud_report=root/'cloud.json',output=root/'result',case='32-32',run_id='77',attempt='2',commit='a'*40)

    def test_complete_recovery_keeps_quality_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));proof=r.verify(a)
            self.assertEqual(proof['status'],'PASS');self.assertEqual(proof['calibrationVerdict'],'FAIL')
            self.assertEqual(len(proof['files']),2);self.assertTrue(all(f['crcCheckedByFullRead'] for f in proof['files']))

    def test_wrong_attempt_cannot_reuse_a_success(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));a.attempt='1'
            with self.assertRaises(ValueError):r.verify(a)
            self.assertFalse(a.output.exists())

    def test_archive_corruption_fails_external_digest(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));data=bytearray(a.archive.read_bytes());data[100]^=1;a.archive.write_bytes(data)
            with self.assertRaisesRegex(ValueError,'ARCHIVE_SHA256'):r.verify(a)
            self.assertFalse(a.output.exists())

    def test_extra_entry_is_rejected_before_zip_allocation(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d),extra=True)
            with self.assertRaisesRegex(ValueError,'CENTRAL_DIRECTORY_PRELIMIT'):r.verify(a)
            self.assertFalse(a.output.exists())

    def test_manifest_must_match_separately_recovered_cloud_record(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));j=json.loads(a.cloud_report.read_text());j['mediaManifest']['files'][0]['sha256']='b'*64;a.cloud_report.write_text(json.dumps(j))
            with self.assertRaisesRegex(ValueError,'MANIFEST_CLOUD_MISMATCH'):r.verify(a)
            self.assertFalse(a.output.exists())

    def test_run_head_cannot_be_relabelled(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));a.commit='b'*40
            with self.assertRaisesRegex(ValueError,'ARTIFACT_RUN_IDENTITY'):r.verify(a)
            self.assertFalse(a.output.exists())

    def test_failed_second_file_removes_only_owned_partial_and_can_retry(self):
        with tempfile.TemporaryDirectory() as d:
            a=self.prepare(Path(d));good_zip=a.archive.read_bytes();good_cloud=a.cloud_report.read_bytes();good_meta=a.metadata.read_bytes()
            with zipfile.ZipFile(a.archive) as z:entries={n:z.read(n) for n in z.namelist()}
            manifest=json.loads(entries['media-manifest.json']);manifest['files'][1]['sha256']='b'*64
            entries['media-manifest.json']=json.dumps(manifest).encode()
            with zipfile.ZipFile(a.archive,'w',compression=zipfile.ZIP_STORED) as z:
                for n,b in entries.items():z.writestr(n,b)
            cloud=json.loads(good_cloud);cloud['mediaManifest']=manifest;a.cloud_report.write_text(json.dumps(cloud))
            meta=json.loads(good_meta);meta.update(size_in_bytes=a.archive.stat().st_size,digest='sha256:'+hashlib.sha256(a.archive.read_bytes()).hexdigest());a.metadata.write_text(json.dumps(meta))
            with self.assertRaisesRegex(ValueError,'EXTRACTED_SHA256'):r.verify(a)
            self.assertFalse(a.output.exists());self.assertTrue(a.archive.exists())
            a.archive.write_bytes(good_zip);a.cloud_report.write_bytes(good_cloud);a.metadata.write_bytes(good_meta)
            self.assertEqual(r.verify(a)['status'],'PASS')
            with self.assertRaisesRegex(ValueError,'NEW_REGULAR_PATHS'):r.verify(a)
            self.assertTrue((a.output/'recovery.json').exists())

if __name__=='__main__':unittest.main()
