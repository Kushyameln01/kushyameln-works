#!/usr/bin/env python3
"""Run the normal Text SDK against unchanged independent oracle artifacts.

The selection manifest/graph lowering may change. Oracle inputs, model,
Tokenizer, mask, normalization, reference bytes and the original gate do not.
This diagnostic does not rewrite the old oracle/plan to claim a new execution.
"""
import argparse, copy, hashlib, json, subprocess, sys, threading, time
from pathlib import Path
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from accept_plain import (NODE_SDK_SOURCE_PATHS, verify_node_sdk_sources,
                          validate_text_storage_metadata)
from plain_checks import unpack_tensor, compare_values, validate_gate
sys.path.insert(0, str(HERE.parent / 'vae'))
from process_lifecycle import ProcessOwnership, cleanup_complete
import numpy as np
import psutil

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['selection', 'bundle', 'source', 'output', 'original-manifest']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Fresh private output required')
    args.output.mkdir(parents=True)
    manifest_raw = (args.bundle / 'manifest.json').read_bytes()
    manifest = json.loads(manifest_raw)
    manifest_sha = digest(manifest_raw)
    validate_gate(manifest['numericGate'])
    original_manifest_raw = args.original_manifest.read_bytes()
    original_manifest = json.loads(original_manifest_raw)
    stripped = copy.deepcopy(manifest)
    for block in stripped['blocks']:
        block.pop('attentionLowering',None)
    assert stripped == original_manifest, 'Only explicit block attentionLowering may change'
    selected = json.loads(args.selection.read_text())['cases']
    records, references, provenance = [], {}, []
    for entry in selected:
        oracle_raw = Path(entry['oracleReport']).read_bytes()
        oracle = json.loads(oracle_raw)
        assert oracle['passed'] and oracle['oracleUsesOnnxOrHike'] is False
        if 'cases' in oracle:
            case = next(c for c in oracle['cases'] if c['id'] == entry['id'])
            original = case['input']
        else:
            case, original = oracle, oracle['input']
        reference = Path(entry['referencePath']).read_bytes()
        assert len(reference) == case['reference']['bytes']
        assert digest(reference) == case['reference']['sha256']
        assert original['modelSha256'] == manifest['modelSha256']
        assert original['tokenizerSha256'] == manifest['tokenizer']['sha256']
        assert original['manifestSha256'] == digest(original_manifest_raw)
        assert original['oracleUsesFull512Positions'] is True
        record = copy.deepcopy(original)
        # The older Hello-world oracle predates the suite's nested input field.
        # Preserve its frozen IDs/mask/text and adapt only the request envelope.
        legacy_plain_envelope = 'input' not in original and 'text' in original
        if legacy_plain_envelope:
            record['input'] = {'text':original['text']}
        record['id'] = entry['id']
        record['manifestSha256'] = manifest_sha
        assert {k:v for k,v in record.items() if k not in ['id','manifestSha256'] and not (legacy_plain_envelope and k == 'input')} == {
            k:v for k,v in original.items() if k not in ['id','manifestSha256']}
        records.append(record)
        references[entry['id']] = np.frombuffer(reference, dtype='<f4').reshape(record['shape'])
        provenance.append({'id':entry['id'], 'oracleReport':entry['oracleReport'],
            'oracleReportSha256':digest(oracle_raw), 'originalInput':original,
            'manifestOnlyRemapped':True, 'selectedManifestSha256':manifest_sha,
            'legacyPlainRequestEnvelopeAdded':legacy_plain_envelope,
            'reference':case['reference'], 'referencePath':entry['referencePath'],
            'referenceExecutionSourceSha':oracle['executionSourceSha']})
    closure = verify_node_sdk_sources(ROOT, args.execution_source_sha)
    relative = str(Path(__file__).resolve().relative_to(ROOT))
    raw = Path(__file__).read_bytes()
    assert raw == subprocess.run(['git','show',args.execution_source_sha+':'+relative],
        cwd=ROOT, check=True, capture_output=True).stdout
    closure.append({'path':relative, 'bytes':len(raw), 'sha256':digest(raw),
                    'executionSourceSha':args.execution_source_sha})
    report = {'passed':False, 'scope':'Normal SDK changed-lowering acceptance against unchanged independent references; no browser/management acceptance',
        'executionSourceSha':args.execution_source_sha, 'sourceClosure':closure,
        'oracleProvenance':provenance, 'manifestSha256':manifest_sha,
        'gate':manifest['numericGate'], 'newExports':0, 'comparisons':[]}
    report['manifestMapping'] = {'originalPath':str(args.original_manifest),
        'originalSha256':digest(original_manifest_raw),
        'selectedSha256':manifest_sha,'onlyAddedBlockAttentionLowering':True}
    config = {'root':str(ROOT), 'bundle':str(args.bundle.resolve()),
        'source':str(args.source.resolve()), 'output':str(args.output.resolve()),
        'manifest':manifest, 'manifestSha256':manifest_sha, 'inputs':records,
        'executionSourceSha':args.execution_source_sha, 'diagnostics':False,
        'preflightOnly':args.preflight_only,
        'sourceRecords':[r for r in closure if r['path'] in NODE_SDK_SOURCE_PATHS]}
    (args.output/'config.json').write_text(json.dumps(config, indent=2)+'\n')
    owner = ProcessOwnership().start()
    stop, samples, started = threading.Event(), [], time.monotonic()
    def sample():
        root = psutil.Process()
        while not stop.wait(.25):
            rows = []
            for child in [root, *root.children(recursive=True)]:
                try:
                    rows.append({'pid':child.pid,'ctime':child.create_time(),
                        'rssBytes':child.memory_info().rss,'status':child.status()})
                except psutil.NoSuchProcess:
                    pass
            samples.append({'seconds':time.monotonic()-started,
                'rssSumBytes':sum(r['rssBytes'] for r in rows), 'processes':rows})
    thread = threading.Thread(target=sample, daemon=True)
    thread.start()
    child = None
    try:
        with (args.output/'stdout.log').open('w') as out, (args.output/'stderr.log').open('w') as err:
            child = subprocess.Popen(['node',str(HERE/'node_sdk_host.mjs')],
                stdin=subprocess.PIPE, stdout=out, stderr=err, text=True)
            child.communicate(json.dumps(config))
            report['childReturnCode'] = child.returncode
        native = json.loads((args.output/'node-sdk-results.json').read_text())
        report['native'] = native
        if not args.preflight_only:
            for record in records:
                actual_bytes = (args.output/(record['id']+'.wktensor')).read_bytes()
                meta, actual = unpack_tensor(actual_bytes, shape=record['shape'])
                validate_text_storage_metadata(meta, record, manifest)
                comparison = compare_values(actual, references[record['id']],
                    np.array(record['attentionMask'], dtype=np.uint8), shape=record['shape'])
                report['comparisons'].append({'id':record['id'], **comparison,
                    'artifactBytes':len(actual_bytes),'artifactSha256':digest(actual_bytes),
                    'metadataPreserved':True})
        report['passed'] = child.returncode == 0 and native['passed'] and (
            args.preflight_only or all(c['passed'] for c in report['comparisons']))
    except Exception as error:
        report['error'] = {'name':type(error).__name__,'message':str(error)}
        raise
    finally:
        if child and child.poll() is None:
            child.terminate()
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill(); child.wait()
        stop.set(); thread.join()
        report['wallSeconds'] = time.monotonic()-started
        report['sampledGroupPeakRssBytes'] = max((r['rssSumBytes'] for r in samples),default=0)
        report['processOwnership'] = owner.finish()
        p = report['processOwnership']
        report['cleanupPassed'] = cleanup_complete(p['liveAfterClose'],p['zombiesAfterClose'],p['errors'])
        report['passed'] = report['passed'] and report['cleanupPassed']
        (args.output/'memory.json').write_text(json.dumps(samples)+'\n')
        (args.output/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({k:report.get(k) for k in ['passed','comparisons','sampledGroupPeakRssBytes','wallSeconds','cleanupPassed','error']}),flush=True)
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
