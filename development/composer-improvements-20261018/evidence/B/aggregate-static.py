#!/usr/bin/env python3
"""Read saved A/B evidence only. Never import or execute Composer product code."""
import copy
import hashlib
import io
import json
from pathlib import Path
import re
import statistics
import tarfile

EVIDENCE = Path(__file__).resolve().parents[1]
SOURCE = Path('/workspace/scratch/a12324e000fc/composer-measurements/B.json')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def strict_json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON key: ' + key)
            result[key] = value
        return result
    def nonfinite(value):
        raise ValueError('non-finite JSON number: ' + value)
    return json.loads(data, object_pairs_hook=pairs, parse_constant=nonfinite)


def summary(values):
    return {'n': len(values), 'medianMs': statistics.median(values), 'minMs': min(values), 'maxMs': max(values)}


def package(data):
    members = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for entry in archive:
            if entry.isdir():
                continue
            if not entry.isfile() or entry.name in members:
                raise ValueError('nonregular or duplicate package member: ' + entry.name)
            members[entry.name] = archive.extractfile(entry).read()
    assets = {name: value for name, value in members.items() if name.endswith('/asset')}
    metas = {name: value for name, value in members.items() if name.endswith('/asset.meta')}
    if not assets or not metas:
        raise ValueError('missing asset/meta members')
    for name in assets:
        if name + '.meta' not in metas or name.removesuffix('/asset') + '/pathname' not in members:
            raise ValueError('missing associated meta/pathname: ' + name)
    for name, meta in metas.items():
        if name.removesuffix('.meta') not in assets and not re.search(rb'^folderAsset:\s*yes\s*$', meta, re.M):
            raise ValueError('non-folder meta has no asset: ' + name)
        if name.removesuffix('/asset.meta') + '/pathname' not in members:
            raise ValueError('meta missing pathname: ' + name)
    return members


EXCLUDED = set()
JOB_PATHS = {'/sdkReport/jobs', '/sdkReport/ingestion/jobs'}


def normalize_report(value, path=''):
    """Only explicit operation identity, revisions and measured time are omitted.

    SDK jobs are completion-ordered telemetry. Match by numeric job suffix before
    removing operation IDs; never sort report findings or other functional arrays.
    Non-time metrics, statuses, build IDs, inputs, values and every record remain.
    """
    if isinstance(value, list):
        source = sorted(value, key=lambda job: int(job['jobId'].rsplit('.', 1)[1])) if path in JOB_PATHS else value
        return [normalize_report(item, path + '/*') for item in source]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, child in value.items():
        full = path + '/' + key
        operation = full in {'/operationId', '/sdkReport/sessionId'}
        revision = path in {'/context', '/source/context'} and key in {'inputRevision', 'selectionRevision', 'planRevision'}
        revision |= full == '/sdkReport/inputRevision'
        isjob = path in {p + '/*' for p in JOB_PATHS}
        operation |= isjob and key in {'jobId', 'workerId', 'instanceId', 'generation'}
        revision |= isjob and key == 'inputRevision'
        time = path == '/timings' and key.endswith('Ms')
        time |= path in {'/sdkReport/metrics', '/sdkReport/metrics/stages'} and key.endswith('Ms')
        time |= (isjob or path in {p + '/*/metrics' for p in JOB_PATHS}) and key.endswith('Ms')
        if operation or revision or time:
            EXCLUDED.add(full)
        else:
            result[key] = normalize_report(child, full)
    return result


def report_info(data):
    report = strict_json(data)
    sdk = report['sdkReport']
    before = sdk['before']
    coverage = report['inputCoverage']
    checks = {
        'envelopeSucceeded': report['status'] == 'succeeded',
        'sdkSucceeded': sdk['status'] == 'succeeded',
        'envelopeAllRecords': report['exportCompleteness'] == {'allAvailableReportRecordsIncluded': True, 'sdkReportIncluded': True, 'truncated': False},
        'allSuppliedFilesAccountedFor': coverage['sdk']['allSuppliedFilesAccountedFor'] is True,
        'coverageFileCounts': coverage['preflight']['fileCount'] == coverage['sdk']['fileCount'] == coverage['sdk']['expectedFileCount'] == len(before['files']),
        'selectedAssetMappingCount': coverage['selectedAssetCount'] == len(report['mapping']),
        'ingestionFileCounts': len(sdk['ingestion']['before']['files']) == len(sdk['ingestion']['before']['selected']) == len(before['files']),
        'sdkCompleteness': sdk['completeness']['totalCount'] == sdk['completeness']['returnedCount'] == len(before['findings']) and sdk['completeness']['truncated'] is False,
        'snapshotCompleteness': before['completeness']['totalCount'] == before['completeness']['returnedCount'] == len(before['findings']) and before['completeness']['truncated'] is False,
        'snapshotCounts': all(before['counts'][key] == len(before[key]) for key in ('files', 'objects', 'references', 'shared', 'cycles', 'findings')),
        'completeProgress': report['progress']['stage'] == 'complete',
        'allJobStatuses': all(j['status'] == 'succeeded' for j in sdk['jobs'] + sdk['ingestion']['jobs']),
    }
    semantic = normalize_report(report)
    return report, semantic, {
        'jsonValid': True,
        'complete': all(checks.values()),
        'checks': checks,
        'semanticSha256': sha(canonical(semantic)),
        'coverageSha256': sha(canonical(coverage)),
        'sdkBeforeSha256': sha(canonical(before)),
        'sourceInputAndPlanSha256': sha(canonical({k: v for k, v in report['source'].items() if k != 'context'})),
        'counts': before['counts'],
        'selectedAssetCount': coverage['selectedAssetCount'],
        'coverage': coverage['sdk'],
    }


def differences(left, right, path=''):
    result = []
    if isinstance(left, dict) and isinstance(right, dict):
        for key in sorted(left.keys() | right.keys()):
            if key not in left or key not in right:
                result.append(path + '/' + key)
            else:
                result.extend(differences(left[key], right[key], path + '/' + key))
    elif isinstance(left, list) and isinstance(right, list):
        if len(left) != len(right):
            result.append(path + '/length')
        for index, (a, b) in enumerate(zip(left, right)):
            result.extend(differences(a, b, path + '/' + str(index)))
    elif left != right:
        result.append(path)
    return result


def condition_results(runs):
    result = {}
    for fixture in ('normal', 'many'):
        for diagnostic in (False, True):
            selected = sorted((r for r in runs if r['fixture'] == fixture and r['diagnostic'] is diagnostic), key=lambda r: r['repeat'])
            if len(selected) != 5 or [r['repeat'] for r in selected] != [1, 2, 3, 4, 5]:
                raise ValueError('Expected five original-cohort repeats per condition')
            samples = []
            for run in selected:
                stages = {}
                for stage in run['stages']:
                    stages[stage['type']] = stages.get(stage['type'], 0) + stage['domUpdatedMs']
                if diagnostic:
                    stages['diagnostic'] = run['diagnosticMetrics']['ui']['operationToResultDomMs']
                samples.append({'repeat': run['repeat'], 'combinedOperationMs': sum(stages.values()), 'stageMs': stages})
            result[f'{fixture}-{diagnostic}'] = {
                'samples': samples,
                'firstMs': samples[0]['combinedOperationMs'],
                'repeat2To5': summary([s['combinedOperationMs'] for s in samples[1:]]),
                'stageRepeat2To5': {key: summary([s['stageMs'][key] for s in samples[1:]]) for key in samples[0]['stageMs']},
            }
    return result


def main():
    a_runs = strict_json((EVIDENCE / 'A/runs.json').read_bytes())
    a_manifest = strict_json((EVIDENCE / 'A/manifest.json').read_bytes())
    b_source_bytes = SOURCE.read_bytes()
    b_runs = strict_json(b_source_bytes)
    a_data = {}
    with tarfile.open(EVIDENCE / 'A-artifacts.tar.xz') as archive:
        for entry in archive:
            if not entry.isfile() or entry.name in a_data:
                raise ValueError('unexpected A archive member')
            a_data[entry.name] = archive.extractfile(entry).read()
    a_integrity = []
    for item in a_manifest:
        data = a_data.get(item['name'])
        present = data is not None
        valid = present and sha(data) == item['sha256'] and len(data) == item['bytes'] if item['status'] == 'recovered' else not present
        recovered = item['status'] == 'recovered'
        a_integrity.append({
            'name': item['name'],
            'recoveryStatus': item['status'],
            'archiveMemberPresent': present,
            'manifestMatchesArchive': valid,
            'manifestAgreementScope': 'byte-length-and-sha256' if recovered else 'absence-only',
            'byteVerification': ('PASS' if valid else 'FAIL') if recovered else 'NOT_PERFORMED_UNAVAILABLE',
            'byteLengthAndSha256Match': valid if recovered else None,
        })
    b_data = {}
    b_manifest = []
    stored_runs = copy.deepcopy(b_runs)
    for run in stored_runs:
        label = f"{run['fixture']}-{'diagnostic' if run['diagnostic'] else 'plain'}-{run['repeat']}"
        for key, kind, ext in [('outputPath', 'output', 'unitypackage'), ('reportPath', 'report', 'json')]:
            original = run.get(key)
            if original is None:
                continue
            name = f'{label}-{kind}.{ext}'
            source_path = Path(original.replace('/home/oai/share/', '/workspace/scratch/', 1))
            item = {'name': name, 'sourcePath': original, 'cohort': 'initial-five-per-condition'}
            run['source' + key[0].upper() + key[1:]] = original
            run[key] = 'evidence/B/' + name
            if not source_path.is_file():
                item.update(status='unavailable', reason='No file at browser-returned path mapped to the workspace; not a successful artifact comparison')
            else:
                data = source_path.read_bytes()
                (EVIDENCE / 'B' / name).write_bytes(data)
                b_data[name] = data
                item.update(status='recovered', bytes=len(data), sha256=sha(data))
                if kind == 'report':
                    try:
                        _, _, info = report_info(data)
                        item.update(jsonValid=True, complete=info['complete'])
                        if not info['complete']:
                            item.update(status='incomplete-report', checks=info['checks'])
                    except (KeyError, ValueError, TypeError) as exc:
                        item.update(status='invalid-report', jsonValid=False, error=str(exc))
            b_manifest.append(item)
    write(EVIDENCE / 'B/runs.json', stored_runs)
    write(EVIDENCE / 'B/manifest.json', b_manifest)

    package_records = []
    package_references = {}
    report_records = []
    report_references = {}
    for version, data_set in [('A', a_data), ('B', b_data)]:
        for name, data in sorted(data_set.items()):
            fixture = name.split('-', 1)[0]
            if name.endswith('.unitypackage'):
                try:
                    members = package(data)
                    package_references.setdefault(fixture, (name, data, members))
                    ref_name, ref_data, ref_members = package_references[fixture]
                    record = {'version': version, 'name': name, 'reference': 'A/' + ref_name, 'wholePackageByteEqual': data == ref_data, 'allMemberBytesEqual': members == ref_members,
                              'assetCount': sum(n.endswith('/asset') for n in members), 'metaCount': sum(n.endswith('/asset.meta') for n in members), 'memberCount': len(members),
                              'members': [{'name': n, 'bytes': len(v), 'sha256': sha(v)} for n, v in sorted(members.items())]}
                except (ValueError, tarfile.TarError) as exc:
                    record = {'version': version, 'name': name, 'error': str(exc), 'wholePackageByteEqual': False, 'allMemberBytesEqual': False}
                package_records.append(record)
            elif name.endswith('-report.json'):
                try:
                    report, semantic, info = report_info(data)
                    report_references.setdefault(fixture, (name, semantic))
                    ref_name, ref_semantic = report_references[fixture]
                    info.update(version=version, name=name, reference='A/' + ref_name, semanticEqual=semantic == ref_semantic, semanticDifferencePaths=differences(ref_semantic, semantic))
                    report_records.append(info)
                except (KeyError, ValueError, TypeError) as exc:
                    report_records.append({'version': version, 'name': name, 'jsonValid': False, 'complete': False, 'semanticEqual': False, 'error': str(exc)})

    pairs = []
    for item in a_manifest:
        name = item['name']
        left, right = a_data.get(name), b_data.get(name)
        pair = {'name': name, 'AAvailable': left is not None, 'BAvailable': right is not None}
        if left is None or right is None:
            pair['status'] = 'UNAVAILABLE'
        elif name.endswith('.unitypackage'):
            try:
                same_members = package(left) == package(right)
                pair.update(status='PASS' if same_members else 'FAIL', wholePackageByteEqual=left == right, allMemberBytesEqual=same_members)
            except (ValueError, tarfile.TarError) as exc:
                pair.update(status='FAIL', error=str(exc))
        else:
            try:
                _, ls, li = report_info(left)
                _, rs, ri = report_info(right)
                ok = li['complete'] and ri['complete'] and ls == rs
                pair.update(status='PASS' if ok else 'FAIL', semanticEqual=ls == rs, complete=li['complete'] and ri['complete'], semanticDifferencePaths=differences(ls, rs))
            except (KeyError, ValueError, TypeError) as exc:
                pair.update(status='FAIL', error=str(exc))
        pairs.append(pair)

    with tarfile.open(EVIDENCE / 'B-artifacts.tar.xz', 'w:xz') as archive:
        for name, data in sorted(b_data.items()):
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mtime = 0
            entry.mode = 0o644
            archive.addfile(entry, io.BytesIO(data))
    archive_bytes = (EVIDENCE / 'B-artifacts.tar.xz').read_bytes()
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:xz') as archive:
        archived_data = {entry.name: archive.extractfile(entry).read() for entry in archive if entry.isfile()}
    archive_verified = archived_data == b_data
    if not archive_verified:
        raise ValueError('B artifact archive does not reproduce recovered source bytes')
    a_conditions, b_conditions = condition_results(a_runs), condition_results(b_runs)
    performance = []
    thresholds = {'normal-False': 339.5, 'normal-True': 677.5, 'many-False': 656.1, 'many-True': 5378.6}
    for key in a_conditions:
        baseline, candidate = a_conditions[key], b_conditions[key]
        performance.append({'condition': key, 'cohort': 'initial-five-per-condition', 'A': baseline, 'B': candidate,
                            'reinvestigationThresholdMs': thresholds[key], 'thresholdExceeded': candidate['repeat2To5']['medianMs'] > thresholds[key]})
    diagnostics = [run for run in b_runs if run['diagnostic']]
    observations = [{'fixture': r['fixture'], 'repeat': r['repeat'], 'status': r['diagnosticMetrics']['status'],
                     'fullJSONCalls': r['diagnosticMetrics']['service']['stages']['fullJSON']['calls'],
                     'rowJSONCalls': r['diagnosticMetrics']['ui']['stages']['rowJSON']['calls'],
                     'coverageJSONCalls': r['diagnosticMetrics']['ui']['stages']['coverageJSON']['calls']} for r in diagnostics]
    comparison = {
        'schemaVersion': 'composer-improvement-static-comparison/1',
        'scope': 'Static aggregation of saved published A/B runs and artifact bytes; product code not executed.',
        'status': 'PARTIAL_EVIDENCE',
        'cohort': 'initial-five-per-condition',
        'sourceBJsonSha256': sha(b_source_bytes),
        'oldC01': 'HOLD; current A/B preservation does not substitute for the missing old generator/input/Plan/revision set.',
        'recovery': {'A': {'expected': 30, 'recovered': len(a_data), 'unavailable': 30-len(a_data)}, 'B': {'expected': 30, 'recovered': len(b_data), 'unavailable': 30-len(b_data)}, 'AArchiveIntegrity': a_integrity},
        'BArtifactArchive': {'file': 'B-artifacts.tar.xz', 'bytes': len(archive_bytes), 'sha256': sha(archive_bytes), 'members': len(b_data), 'allRecoveredBytesVerified': archive_verified},
        'semanticComparisonPolicy': {
            'excludedPaths': sorted(EXCLUDED),
            'operationIdentifiers': 'Operation/session/job/worker/instance IDs and worker generation are run identities. Input/selection/plan revisions are revision counters. Original artifacts retain every original field.',
            'jobOrder': 'Only sdkReport.jobs and sdkReport.ingestion.jobs are sorted by numeric jobId suffix before operation identities are removed; they record completion order. Functional report arrays retain their original order.',
            'retained': 'All input hashes and Plan values, report findings, source positions, coverage, mapping, statuses, completeness, build/wasm identities, non-time metrics including all byte/input/arena counts and settings.',
            'canonicalEncoding': 'UTF-8 JSON with sorted object keys, original array order except explicitly listed SDK job telemetry, compact separators and no non-finite numbers.',
        },
        'packages': package_records,
        'reports': report_records,
        'sameRepeatPairs': pairs,
        'availableComparison': {'allRecoveredPackageMembersEqual': all(p['allMemberBytesEqual'] for p in package_records),
                                'allRecoveredPackagesByteEqual': all(p['wholePackageByteEqual'] for p in package_records),
                                'allRecoveredReportsComplete': all(r['complete'] for r in report_records),
                                'allRecoveredReportsSemanticEqual': all(r['semanticEqual'] for r in report_records),
                                'sameRepeatPass': sum(p['status'] == 'PASS' for p in pairs), 'sameRepeatFail': sum(p['status'] == 'FAIL' for p in pairs), 'sameRepeatUnavailable': sum(p['status'] == 'UNAVAILABLE' for p in pairs)},
        'performance': performance,
        'performanceNotes': 'Sum serial scan/select/analyze/catalog/generate DOM update intervals plus diagnostic UI operation-to-result DOM interval. Not total user wait; excludes initial load, waits, downloads and browser paint. Nested SDK intervals not added. First sample separate; repeat 2-5 median/min/max. Threshold is for reinvestigation, not statistical equivalence.',
        'additionalCohorts': [],
        'additionalCohortNote': 'The separate normal-False follow-up cohort was completed and saved in B-timing-followup.json. Initial values remain intact; no follow-up values have been merged into this initial-cohort comparison.',
        'initialObservation': {'A': a_runs[0].get('initial'), 'B': b_runs[0].get('initial'), 'note': 'One cold observation per version; no general startup speed guarantee.'},
        'diagnosticsUnopenedJSON': observations,
        'memoryPeak': None,
    }
    write(EVIDENCE / 'comparison.json', comparison)
    print(json.dumps({'recovery': {k: v for k, v in comparison['recovery'].items() if k != 'AArchiveIntegrity'}, 'availableComparison': comparison['availableComparison'], 'performance': [{'condition': p['condition'], 'A': p['A']['repeat2To5'], 'B': p['B']['repeat2To5'], 'thresholdExceeded': p['thresholdExceeded']} for p in performance], 'BArchiveBytes': len(archive_bytes)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
