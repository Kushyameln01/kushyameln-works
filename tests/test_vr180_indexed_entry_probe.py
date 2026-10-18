"""Boundaries of the independent native-entry evidence checks, without a browser."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1]/'tools/vr180/probe-indexed-entry.py'
spec = importlib.util.spec_from_file_location('entry_probe', path)
probe = importlib.util.module_from_spec(spec); spec.loader.exec_module(probe)

def row():
    result = {'operationId': 'test-operation', 'inputRevision': 7, 'registryEvents': []}
    identity = {'format': 'vr180-indexed-registry', 'schema': 1, 'operationId': result['operationId'],
                'inputRevision': 7, 'namespace': 'test-operation-r7', 'ownerToken': 'a'*32}
    raw = json.dumps(identity, separators=(',', ':'))
    result['registryEvents'].append({'status': 'ready', 'identity': identity.copy(), 'ticketCount': 0,
        'persistedJSON': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'bytes': len(raw),
        'flushed': True, 'closed': True, 'readbackMatched': True, 'writeCalls': 2, 'readCalls': 3})
    for kind in ('input', 'output'):
        ticket = {'format': 'vr180-private-index-owner', 'schema': 1, 'kind': kind,
                  'jobId': result['operationId']+('-in' if kind == 'input' else '-out'), 'ownerToken': 'b'*32}
        raw = json.dumps({'identity': identity, 'ticket': ticket}, separators=(',', ':'))
        result['registryEvents'].append({'status': 'persisted', 'identity': identity.copy(), 'ticket': ticket,
            'persistedJSON': raw, 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'bytes': len(raw),
            'flushed': True, 'closed': True, 'readbackMatched': True, 'writeCalls': 2, 'readCalls': 3})
    return result

class EvidenceChecks(unittest.TestCase):
    def test_complete_small_suite_keeps_old_routes_and_same_handle_retry(self):
        cases = probe.cases()
        self.assertEqual(len(cases), 12)
        self.assertEqual(sum(c['settings']['mode'] != 'inspect' and not c.get('expectCancel') and not c.get('expectedError') for c in cases), 9)
        self.assertEqual([c['name'] for c in cases[:4]], ['inspect', 'copy', 'legacy-prepared', 'legacy-direct'])
        self.assertTrue(all('executionRoute' not in c['settings'] for c in cases[:4]))
        self.assertTrue(all(c['settings']['executionRoute'] == 'indexed' for c in cases[4:]))
        self.assertEqual(cases[-2]['handleKey'], cases[-1]['handleKey'])
        self.assertTrue(any(c['settings']['fov'] == 360 and c['settings']['layout'] == 'tb' for c in cases))

    def test_matching_bytes_accept(self):
        self.assertEqual(probe.verify_ownership(row())['status'], 'PASS')

    def test_modified_original_bytes_reject(self):
        data = row(); data['registryEvents'][0]['persistedJSON'] += ' '
        with self.assertRaises(Exception): probe.verify_ownership(data)

    def test_changed_generation_rejects_even_rehashed_bytes(self):
        data = row(); event = data['registryEvents'][1]; event['identity']['inputRevision'] = 6
        raw = json.dumps({'identity': event['identity'], 'ticket': event['ticket']}, separators=(',', ':'))
        event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
        with self.assertRaises(Exception): probe.verify_ownership(data)

    def test_missing_duplicate_or_extra_ticket_reject(self):
        data = row()
        for records in [data['registryEvents'][:2], data['registryEvents'][:2]+[data['registryEvents'][1]], data['registryEvents']*2]:
            with self.subTest(count=len(records)), self.assertRaises(Exception):
                probe.verify_ownership({**data, 'registryEvents': records})

    def test_partial_native_lifecycle_reject(self):
        for field in ['flushed', 'closed', 'readbackMatched', 'writeCalls', 'readCalls']:
            data = copy.deepcopy(row()); data['registryEvents'][0][field] = False
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)

    def test_schema_token_namespace_and_job_identity_reject_even_rehashed(self):
        for field, value in [('format', 'wrong'), ('schema', 2), ('schema', True), ('namespace', 'wrong'), ('ownerToken', 'bad')]:
            data = row()
            for event in data['registryEvents']:
                event['identity'][field] = value
                content = event['identity'] if event['status'] == 'ready' else {'identity': event['identity'], 'ticket': event['ticket']}
                raw = json.dumps(content, separators=(',', ':'))
                event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)
        for field, value in [('format', 'wrong'), ('schema', 2), ('schema', True), ('jobId', 'other-in'), ('ownerToken', 'bad')]:
            data = row(); event = data['registryEvents'][1]; event['ticket'][field] = value
            raw = json.dumps({'identity': event['identity'], 'ticket': event['ticket']}, separators=(',', ':'))
            event.update(persistedJSON=raw, bytes=len(raw), sha256=hashlib.sha256(raw.encode()).hexdigest())
            with self.subTest(field=field), self.assertRaises(Exception): probe.verify_ownership(data)

if __name__ == '__main__': unittest.main()
