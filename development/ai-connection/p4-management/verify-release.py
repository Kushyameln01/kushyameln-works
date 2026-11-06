#!/usr/bin/env python3
"""Read-only delivery integrity check. No imported project module or inference."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    repo = args.repo.resolve()
    folder = repo / 'development/ai-connection/p4-management'
    manifest = json.loads((folder / 'MANIFEST.json').read_text())
    handoff = json.loads((folder / 'MANAGEMENT-HANDOFF.json').read_text())
    source = handoff['fixedManagementSourceCommit']

    def checked_file(record):
        path = record['path']
        parts = Path(path).parts
        assert not Path(path).is_absolute() and '..' not in parts, path
        data = (repo / path).read_bytes()
        assert len(data) == record['byteLength'] and digest(data) == record['sha256'], path
        return data

    def git_blob(commit, path):
        assert len(commit) == 40 and all(c in '0123456789abcdef' for c in commit)
        return subprocess.check_output(['git', '-C', str(repo), 'show', commit + ':' + path])

    for record in manifest['files']:
        checked_file(record)
    for record in handoff['managementFiles']:
        assert checked_file(record) == git_blob(source, record['path']), record['path']
    for record in handoff['nativeFiles']:
        ref = record['sourceRef']
        data = git_blob(ref['commit'], ref['path'])
        assert len(data) == record['byteLength'] and digest(data) == record['sha256'], ref
    preserved = json.loads((folder / 'ORIGINAL-SCOPE-PRESERVATION.json').read_text())
    for record in preserved['files']:
        assert checked_file(record) == git_blob(record['unchangedFrom'], record['path'])
    result = json.loads((folder / 'ROOT-VERIFICATION.json').read_text())
    assert result['tests'] == {'count': 516, 'pass': 516, 'fail': 0, 'skip': 0,
                               'elapsedMs': 35636.260269,
                               'scope': 'Node contracts/lifecycle/storage/source-byte regression with explicit retained native roots; not private actualText joint native execution'}
    receipt = json.loads((folder / 'verification/FIXED-SOURCE-PREFLIGHT.json').read_text())
    assert receipt['managerCommit'] == source
    assert receipt['managementCommitProof']['allSourceBytesAtRequestedCommit'] is True
    assert receipt['compatibilityAuthority'] == 'existing evaluateEdge'
    assert receipt['status'] == 'BLOCKED' and receipt['compatibility'] == 'COMPATIBLE'
    assert receipt['nativeCalls'] == 0 and receipt['browserLaunched'] is False
    assert receipt['privateInputIOStarted'] is False
    assert receipt['generationReady'] is False
    admission = json.loads((folder / 'ADMISSION.json').read_text())
    candidates = admission['newIndependentOwnerCandidates']
    assert len(candidates) == 2
    assert candidates[0]['managementP4Adopted'] is False
    assert candidates[1]['activeF76P4InputChanged'] is False
    assert candidates[1]['managementNativeAdoption'] is False
    actual_readback = admission['p3']['newPublicPayloadReadback']
    assert actual_readback['actualPackageFiles'] == 8
    assert actual_readback['actualPackageBytes'] == 32171
    assert actual_readback['readback']['status'] == 'complete'
    assert actual_readback['livePublicationBrandRecreated'] is False
    assert admission['generationReady'] is False
    print(json.dumps({'status': 'PASS', 'managementExecutionSourceCommit': source,
                      'publicDeliveryFiles': len(manifest['files']),
                      'managementSourceFiles': len(handoff['managementFiles']),
                      'nativePublicSourceFiles': len(handoff['nativeFiles']),
                      'preservedPriorFiles': len(preserved['files']),
                      'newInferenceOrExport': False,
                      'recordedP3AcquisitionChecks': 186,
                      'newLoRAOwnerReceiptChecks': 224,
                      'newActualP3PackageFilesReceived': 8,
                      'newSeparateOwnerCandidates': 2,
                      'recordedNodeRegressionPass': 516,
                      'actualTextJointNumericAcceptance': 'NOT_VERIFIED'}, indent=2))


if __name__ == '__main__':
    main()
