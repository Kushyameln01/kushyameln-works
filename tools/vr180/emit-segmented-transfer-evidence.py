#!/usr/bin/env python3
"""Export only bounded, credential-free protocol records from a private trial."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil

spec = importlib.util.spec_from_file_location('cloud',Path(__file__).with_name('cloud-validate.py'))
c = importlib.util.module_from_spec(spec); spec.loader.exec_module(c)
p = argparse.ArgumentParser(description=__doc__)
for name in ('source','upload','output'): p.add_argument('--'+name,type=Path,required=True)
a = p.parse_args(); c.require(not a.output.exists(),'Evidence directory must be new'); a.output.mkdir()
report = {'schema':'vr180-segmented-service-evidence-v1','runId':os.environ['GITHUB_RUN_ID']+'-segmented-'+os.environ['GITHUB_RUN_ATTEMPT'],
          'checkoutCommit':os.environ['GITHUB_SHA'],'status':'BLOCKED','prototypeOnly':True,
          'fullHostRecovery':'PENDING','independentHostValidation':'PENDING','recordErrors':[]}
records = {}
for directory,names in [(a.source,['source-manifest.json']),
        (a.upload,['upload-result.json','completion.json','cleanup-result.json','incomplete.json'])]:
    for name in names:
        path = directory/name
        if path.exists():
            try:
                c.require(path.is_file() and not path.is_symlink() and path.stat().st_size<=256*1024,'Protocol record size/type')
                raw = path.read_bytes(); parsed = json.loads(raw)
                c.require(isinstance(parsed,dict),'Protocol record must be an object')
                (a.output/name).write_bytes(raw); records[name] = parsed
            except Exception as error:
                report['recordErrors'].append({'file':name,'errorType':type(error).__name__})
result = records.get('upload-result.json'); cleanup = records.get('cleanup-result.json')
try:
    if result and cleanup and not report['recordErrors'] and result['status']=='COMPLETE_MANIFEST_UPLOADED' and cleanup['status']=='STAGE_REMOVED':
        report.update(status='READY_FOR_ARTIFACT_RECOVERY',profile=result['profile'],partCount=result['partCount'],
                      totalBytes=result['totalBytes'],uploadElapsedSeconds=result['elapsedSeconds'])
    else:
        report['reason']='Missing, incomplete or failed transfer/cleanup record; successful media recovery is not established.'
except (KeyError,TypeError) as error:
    report['recordErrors'].append({'file':'transfer/cleanup contract','errorType':type(error).__name__})
    report['status']='BLOCKED'
c.write(a.output/'run.json',report)
raise SystemExit(0 if c.emit_evidence(a.output,report) else 1)
