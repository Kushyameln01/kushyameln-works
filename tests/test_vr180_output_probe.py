"""Failure-path transport contract for the private native browser harness."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('output_probe',ROOT/'tools/vr180/probe-output-index.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)

class ProbeTransport(unittest.TestCase):
    def test_preflight_failure_still_emits_complete_identifiable_evidence(self):
        with tempfile.TemporaryDirectory(prefix='vr180-probe-contract-') as temp:
            root=Path(temp);bundle=root/'fork.mjs';bundle.write_text('// no browser is started\n')
            output=root/'result';logs=io.StringIO()
            with patch.dict(os.environ,{'GITHUB_REPOSITORY':'rejected/test','GITHUB_RUN_ID':'contract','GITHUB_RUN_ATTEMPT':'2'}), patch.object(sys,'argv',[str(probe.__file__),'--bundle',str(bundle),'--output',str(output)]),contextlib.redirect_stdout(logs):
                code=probe.main()
            self.assertEqual(code,1)
            report=json.loads((output/'run.json').read_text())
            self.assertEqual(report['runId'],'contract-output-index-2')
            self.assertNotEqual(report['status'],'PASS')
            self.assertFalse(report['fullOutputRecovered'])
            begins=[line for line in logs.getvalue().splitlines() if line.startswith('VR180_EVIDENCE_BEGIN ')]
            self.assertEqual(len(begins),1)
            transport=json.loads(begins[0].split(' ',1)[1])
            self.assertTrue(transport['complete'])
            self.assertEqual(transport['runId'],report['runId'])
            self.assertIn('VR180_EVIDENCE_END ',logs.getvalue())

if __name__=='__main__':unittest.main()
