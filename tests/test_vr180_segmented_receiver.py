import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1]/'tools/vr180/receive-segmented-artifact.py')
r = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(r)


class ReceiverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.out = self.root/'received'; self.part_size = 512*1024
        self.profile = patch.dict(r.PROFILES, {'service-8mib': {'part': self.part_size,
            'files': [('payload-a','payload-a.bin',r.MIB), ('payload-b','payload-b.bin',r.MIB)]}})
        self.profile.start(); self.addCleanup(self.profile.stop); self.addCleanup(self.tmp.cleanup)
        self.identity = {'repository':'Kushyameln01/kushyameln-works','commit':'a'*40,
            'ref':'refs/heads/codex/vr180-plan-1-2','runId':'42','runAttempt':1,'job':'transfer'}
        self.manifest = {'schema':'vr180-segmented-transfer-v1','status':'COMPLETE','identity':self.identity,
            'profile':'service-8mib','partBytes':self.part_size,'totalBytes':2*r.MIB,'partCount':4,
            'sourceManifestSHA256':'d'*64,'files':[], 'generator':{'seed':'vr180-public-segmented-transfer-2026-10-17',
            'algorithm':'SHAKE256(seed+NUL+fileId+NUL+decimal-byte-offset)-1MiB-blocks-v1','blockBytes':r.MIB}}
        self.parts = []; self.counter = 1
        for fid in ('payload-a','payload-b'):
            raw = hashlib.shake_256(('vr180-public-segmented-transfer-2026-10-17\0'+fid+'\0'+'0').encode()).digest(r.MIB)
            file = {'id':fid,'name':fid+'.bin','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'partCount':2,'parts':[]}
            for index in range(2):
                block = raw[index*self.part_size:(index+1)*self.part_size]
                name = f'{r.prefix(self.manifest)}-{fid}-{index:05d}'
                path, metadata, artifact = self.archive(name, 'chunk.bin', block)
                file['parts'].append({'index':index,'offset':index*self.part_size,'length':len(block),
                                      'sha256':hashlib.sha256(block).hexdigest(),'artifact':artifact})
                self.parts.append((fid,index,path,metadata))
            self.manifest['files'].append(file)

    def archive(self, name, entry, raw, extra=None):
        path = self.root/f'{self.counter}.zip'
        with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_STORED) as z:
            z.writestr(entry,raw)
            if extra: z.writestr(*extra)
        size,sha = r.hash_file(path)
        artifact = {'id':self.counter,'name':name,'sizeBytes':size,'digest':'sha256:'+sha}
        metadata = {'id':self.counter,'name':name,'size_in_bytes':size,'digest':'sha256:'+sha,'expired':False,
            'workflow_run':{'id':42,'head_sha':'a'*40,'head_branch':'codex/vr180-plan-1-2'}}
        self.counter += 1
        return path,metadata,artifact

    def initialize(self, manifest=None):
        m = manifest or self.manifest; raw = json.dumps(m).encode()
        path,metadata,artifact = self.archive(r.prefix(m)+'-complete','completion.json',raw)
        receipt = {'schema':'vr180-segmented-transfer-v1','status':'COMPLETE_MANIFEST_UPLOADED',
                   'identity':self.identity,'profile':'service-8mib','totalBytes':m['totalBytes'],'partCount':m['partCount'],
                   'completion':{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'artifact':artifact}}
        return r.initialize(path,metadata,self.identity,receipt,self.out)

    def test_complete_bytes_and_independent_formula(self):
        self.initialize()
        for fid,index,path,metadata in self.parts: r.receive_part(self.out,path,metadata,fid,index)
        result = r.finalize(self.out)
        self.assertEqual(result['status'],'PASS')
        self.assertEqual(sum(x['independentGeneratorComparedBytes'] for x in result['wholeFiles']),2*r.MIB)

    def test_missing_part_cannot_finalize(self):
        self.initialize()
        with self.assertRaisesRegex(ValueError,'INCOMPLETE_FILE'): r.finalize(self.out)
        self.assertEqual(r.read_json(self.out/'recovery.json')['status'],'PARTIAL')

    def test_wrong_order_rejected_without_write(self):
        self.initialize(); fid,index,path,metadata = self.parts[1]
        with self.assertRaisesRegex(ValueError,'SEQUENTIAL_PART'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)

    def test_wrong_run_rejected_without_write(self):
        self.initialize(); fid,index,path,metadata = self.parts[0]; metadata = copy.deepcopy(metadata)
        metadata['workflow_run']['id'] = 43
        with self.assertRaisesRegex(ValueError,'ARTIFACT_IDENTITY'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)

    def test_manifest_gap_rejected(self):
        bad = copy.deepcopy(self.manifest); bad['files'][0]['parts'][1]['offset'] += 1
        with self.assertRaisesRegex(ValueError,'PART_CONTIGUITY'): self.initialize(bad)
        self.assertFalse(self.out.exists())

    def test_archive_corruption_rejected_before_append(self):
        self.initialize(); fid,index,path,metadata = self.parts[0]
        raw = bytearray(path.read_bytes()); raw[100] ^= 1; path.write_bytes(raw)
        with self.assertRaisesRegex(ValueError,'ARCHIVE_DIGEST'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)

    def test_raw_part_sha_mismatch_rejected(self):
        bad = copy.deepcopy(self.manifest); bad['files'][0]['parts'][0]['sha256'] = '0'*64
        self.initialize(bad); fid,index,path,metadata = self.parts[0]
        with self.assertRaisesRegex(ValueError,'PART_RAW_SHA256'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)

    def test_whole_file_readback_detects_after_append_corruption(self):
        self.initialize()
        for fid,index,path,metadata in self.parts: r.receive_part(self.out,path,metadata,fid,index)
        with (self.out/'payload-a.bin').open('r+b') as stream: stream.write(b'bad')
        with self.assertRaisesRegex(ValueError,'WHOLE_FILE_READBACK'): r.finalize(self.out)

    def test_extra_zip_entry_and_existing_output_are_rejected(self):
        p,metadata,_ = self.archive('untrusted','chunk.bin',b'x',('../outside',b'y'))
        with self.assertRaisesRegex(ValueError,'CENTRAL_DIRECTORY_BOUND'): r.verified_archive(p,metadata,'chunk.bin',1)
        self.out.mkdir()
        with self.assertRaisesRegex(ValueError,'OUTPUT_MUST_BE_NEW'): self.initialize()

    def test_partial_append_and_state_write_failure_can_retry_same_part(self):
        self.initialize(); fid,index,path,metadata = self.parts[0]
        def partial(source,dest,length):
            dest.write(source.read(37)); raise OSError('injected interrupted append')
        with patch.object(r,'copy_payload',partial):
            with self.assertRaisesRegex(OSError,'interrupted'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)
        original = r.os.replace
        with patch.object(r.os,'replace',side_effect=OSError('state commit failed')):
            with self.assertRaisesRegex(OSError,'state commit'): r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,0)
        self.assertFalse((self.out/'recovery.json.new').exists())
        r.receive_part(self.out,path,metadata,fid,index)
        self.assertEqual((self.out/'payload-a.bin').stat().st_size,self.part_size)

    def test_init_failure_cleans_only_new_owned_files(self):
        with patch.object(r,'write_json',side_effect=OSError('init state write')):
            with self.assertRaisesRegex(OSError,'init state'): self.initialize()
        self.assertFalse(self.out.exists())

    def test_large_profile_is_reserved_and_rejected(self):
        m = copy.deepcopy(self.manifest); m['profile'] = 'p5-5gb'
        with self.assertRaisesRegex(ValueError,'PROFILE'): r.validate_manifest(m,self.identity)

    def test_deadline_during_finalization_never_commits_pass(self):
        self.initialize()
        for fid,index,path,metadata in self.parts: r.receive_part(self.out,path,metadata,fid,index)
        deadline = r.read_json(self.out/'recovery.json')['deadlineUnix']
        with patch.object(r.time,'time',side_effect=[deadline-1,deadline+1]):
            with self.assertRaisesRegex(ValueError,'RECEIVER_DEADLINE'): r.finalize(self.out)
        self.assertEqual(r.read_json(self.out/'recovery.json')['status'],'PARTIAL')


if __name__ == '__main__': unittest.main()
