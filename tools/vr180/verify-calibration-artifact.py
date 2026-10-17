#!/usr/bin/env python3
"""Verify one complete, bounded P5 media artifact against GitHub and cloud evidence."""
import argparse,hashlib,importlib.util,json,os,shutil,stat,struct,time,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('transport',Path(__file__).with_name('probe-artifact-transfer.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
MIB=1024**2
NAMES={'input.mp4','output.mp4','media-manifest.json'}

def preflight(path):
    size=path.stat().st_size;t.require(22<=size<=122*MIB,'ARCHIVE_SIZE')
    with path.open('rb') as f:
        n=min(size,22+65535);f.seek(size-n);tail=f.read(n);p=tail.rfind(b'PK\x05\x06')
        t.require(p>=0 and len(tail)-p>=22,'EOCD')
        _,disk,cd_disk,n_disk,count,cd_size,cd_at,comment=struct.unpack_from('<4sHHHHIIH',tail,p)
        t.require(disk==cd_disk==0 and comment<=256 and p+22+comment==len(tail),'EOCD_FIELDS')
        end=size-n+p;boundary=end
        if end>=20:
            f.seek(end-20);locator=f.read(20)
            if locator[:4]==b'PK\x06\x07':
                _,z_disk,z_at,disks=struct.unpack('<4sIQI',locator)
                t.require(z_disk==0 and disks==1 and z_at+56==end-20,'ZIP64_LOCATOR')
                f.seek(z_at);raw=f.read(56);t.require(len(raw)==56,'ZIP64_LENGTH')
                z=struct.unpack('<4sQHHIIQQQQ',raw)
                t.require(z[0]==b'PK\x06\x06' and z[1]==44 and z[3]<=45 and z[4]==z[5]==0,'ZIP64_EOCD')
                t.require(n_disk in (z[6],65535) and count in (z[7],65535) and cd_size in (z[8],0xffffffff) and cd_at in (z[9],0xffffffff),'ZIP64_CONSISTENCY')
                n_disk,count,cd_size,cd_at=z[6:10];boundary=z_at
        t.require(n_disk==count==3 and 138<=cd_size<=8192 and 0<=cd_at and cd_at+cd_size==boundary,'CENTRAL_DIRECTORY_PRELIMIT')
    return {'entries':3,'centralDirectoryBytes':cd_size,'checkedBeforeZipFile':True}

def verify(a):
    deadline=time.monotonic()+300;out=a.output.resolve()
    t.require(a.archive.is_file() and not a.archive.is_symlink() and not out.exists(),'NEW_REGULAR_PATHS')
    t.require(shutil.disk_usage(out.parent).free>=512*MIB,'RECEIVER_FREE_SPACE')
    expected_name=f'vr180-p5-{a.case}-{a.run_id}-{a.attempt}'
    metadata=t.artifact_metadata(t.read_json(a.metadata),expected_name);run=metadata['workflow_run']
    t.require(str(run['id'])==a.run_id and run['head_sha']==a.commit and run['head_branch']=='codex/vr180-plan-1-2','ARTIFACT_RUN_IDENTITY')
    size,digest=t.hash_file(a.archive,deadline)
    t.require(size==metadata['size_in_bytes'] and metadata['digest']=='sha256:'+digest,'ARTIFACT_ARCHIVE_SHA256')
    structure=preflight(a.archive)
    t.require(a.cloud_report.stat().st_size<=4*MIB,'CLOUD_REPORT_BOUND')
    cloud=json.loads(a.cloud_report.read_text());expected_run=f'{a.run_id}-p5-{a.case}-{a.attempt}'
    t.require(cloud['runId']==expected_run and cloud['checkoutCommit']==a.commit and cloud['case']==a.case
      and cloud['status']=='READY_FOR_ARTIFACT_RECOVERY' and cloud['completeCloudMedia'],'CLOUD_RUN_IDENTITY')
    owned=False
    try:
        with zipfile.ZipFile(a.archive) as z:
            entries=z.infolist();t.require(len(entries)==3 and {e.filename for e in entries}==NAMES,'ENTRY_SET')
            for e in entries:
                t.require(not e.is_dir() and not(e.flag_bits&1) and not stat.S_ISLNK(e.external_attr>>16),'ENTRY_KIND')
                # The pinned action's level 0 may use ZIP method 0 or DEFLATE stored
                # blocks. ZIP headers alone cannot attest the selected zlib level.
                t.require(e.compress_type in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED)
                  and e.compress_size<=e.file_size+MIB,'COMPRESSION_CONTRACT')
                t.require(0<e.file_size<=(65536 if e.filename=='media-manifest.json' else 80*MIB),'ENTRY_BYTE_BOUND')
            manifest_bytes=z.read('media-manifest.json');m=json.loads(manifest_bytes)
            t.require(m==cloud['mediaManifest'],'MANIFEST_CLOUD_MISMATCH')
            t.require(m['schema']=='vr180-calibration-media-artifact-v1' and m['runId']==expected_run and m['checkoutCommit']==a.commit and m['case']==a.case,'MANIFEST_IDENTITY')
            t.require(len(m['files'])==2 and {x['name'] for x in m['files']}=={'input.mp4','output.mp4'},'MANIFEST_FILE_SET')
            t.require(sum(x['bytes'] for x in m['files'])<=120*MIB,'PAIR_LIMIT')
            out.mkdir();owned=True;(out/'media-manifest.json').write_bytes(manifest_bytes);files=[]
            for entry in m['files']:
                t.require(z.getinfo(entry['name']).file_size==entry['bytes'],'MANIFEST_SIZE')
                count=0;h=hashlib.sha256();target=out/entry['name']
                with z.open(entry['name']) as source,target.open('xb') as dest:
                    while True:
                        t.check_time(deadline);block=source.read(MIB)
                        if not block:break
                        count+=len(block);t.require(count<=entry['bytes'],'EXPANDED_SIZE');h.update(block);dest.write(block)
                    dest.flush();os.fsync(dest.fileno())
                t.require(count==entry['bytes'] and h.hexdigest()==entry['sha256'],'EXTRACTED_SHA256')
                reread_size,reread_hash=t.hash_file(target,deadline)
                t.require(reread_size==count and reread_hash==h.hexdigest(),'RECEIVER_REREAD_SHA256')
                files.append({**entry,'crcCheckedByFullRead':True,'receiverRereadSHA256':reread_hash})
        report={'schema':'vr180-calibration-artifact-recovery-v1','status':'PASS','scope':'Full media-byte recovery only; calibration quality verdict remains separate',
          'calibrationVerdict':cloud['calibrationVerdict'],'sourceCommit':a.commit,'workflowRun':a.run_id,'runAttempt':a.attempt,
          'artifactId':metadata['id'],'artifactName':expected_name,'archiveBytes':size,'archiveSHA256':digest,'zipStructure':structure,'files':files,
          'mediaManifestSHA256':hashlib.sha256(manifest_bytes).hexdigest(),'hostIndependentVerification':'PENDING'}
        (out/'recovery.json').write_text(json.dumps(report,indent=2)+'\n');return report
    except BaseException as error:
        if owned:
            try:shutil.rmtree(out)
            except Exception as cleanup:error.add_note(f'Owned partial cleanup failed: {out}: {cleanup}')
        raise

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('archive','metadata','cloud-report','output'):p.add_argument('--'+name,type=Path,required=True)
    for name in ('run-id','attempt','commit'):p.add_argument('--'+name,required=True)
    p.add_argument('--case',choices=['32-32','48-24'],required=True);r=verify(p.parse_args());print(json.dumps(r))
if __name__=='__main__':main()
