"""Contract tests for a data-only catalog registration, never model inference."""
import copy
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('qkv_registration', HERE / 'build-qkv-registration.py')
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


class RegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.owners = registration.load_inputs()
        cls.proposal = registration.build_proposal(cls.base, cls.owners)

    def apply(self, proposal=None, base=None, owners=None):
        return registration.apply_registration(base or self.base, proposal or self.proposal, owners or self.owners)

    def test_candidate_is_a_new_data_entry_and_preserves_old_adoption(self):
        result = self.apply()
        old = registration.parse(self.base[registration.CATALOG])
        cat = registration.parse(result[registration.CATALOG])
        self.assertEqual(cat['managementAdoptionSets'], old['managementAdoptionSets'])
        self.assertEqual(cat['managementCandidateSets'][0]['candidateSetId'], 'CANDIDATE-DIFFUSION-QKV-N16-8CDFD3F')
        self.assertFalse(cat['runtimeIntegrated'])
        self.assertFalse(cat['managementCandidateSets'][0]['generationReady'])
        self.assertEqual(cat['documentVersion'], '1.0-draft.2')
        self.assertEqual(cat['registrationSourceBuild']['runtimeCodeCommit'], registration.CODE)
        self.assertEqual(len(cat['registrationSourceBuild']['kernelBindings']), 4)

    def test_old_profile_and_rule_contents_are_not_widened(self):
        result = self.apply()
        for path in registration.PROFILE_PATHS + [registration.RULES, registration.NORMS]:
            before = registration.parse(self.base[path])
            after = registration.parse(result[path])
            key = 'records' if 'records' in before else 'rules'
            self.assertEqual(after[key][:len(before[key])], before[key])

    def test_original_catalog_bytes_and_digests_are_required(self):
        bad = dict(self.base)
        bad[registration.CATALOG] += b' '
        with self.assertRaises(ValueError): self.apply(base=bad)

    def test_same_api_does_not_hide_an_altered_loaded_kernel(self):
        bad = dict(self.owners)
        key = registration.CODE + ':docs/shared/diffusion-models/ort-bridge/qkv/kernel.wasm'
        bad[key] = bad[key][:-1] + bytes([bad[key][-1] ^ 1])
        with self.assertRaises(ValueError): self.apply(owners=bad)

    def test_observed_success_cannot_relax_the_predeclared_gate(self):
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['numeric-execution'][0]['requiredDeclarations']['gates']['projection']['absolute'] = 0.1
        with self.assertRaises(ValueError): self.apply(bad)

    def test_self_consistent_changed_owner_plan_is_not_the_fixed_git_source(self):
        owners = dict(self.owners)
        key = registration.CODE + ':' + registration.P4 + 'candidate-plan.json'
        plan = registration.parse(owners[key])
        plan['gates']['projection']['absolute'] = 0.1
        owners[key] = registration.encode(plan)
        forged = registration.build_proposal(self.base, owners)
        with self.assertRaises(ValueError): self.apply(forged, owners=owners)

    def test_unknown_owner_asset_is_not_authenticated_by_a_commit_label(self):
        owners = dict(self.owners)
        owners[registration.CODE + ':unregistered-owner-source.txt'] = b'arbitrary bytes'
        forged = registration.build_proposal(self.base, owners)
        with self.assertRaises(ValueError): self.apply(forged, owners=owners)

    def test_head_local_normalization_is_rejected(self):
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['numeric-execution'][0]['requiredDeclarations']['normalizationAxis'] = 128
        with self.assertRaises(ValueError): self.apply(bad)

    def test_scope_and_production_readiness_are_not_promoted(self):
        for key in ['productionQKVVerified', 'actualModelHiddenVerified', 'generationReady', 'managerAccepted']:
            bad = copy.deepcopy(self.proposal)
            bad['managementCandidateSet'][key] = True
            with self.subTest(key=key), self.assertRaises(ValueError): self.apply(bad)

    def test_an_existing_adoption_entry_cannot_be_replaced(self):
        bad = copy.deepcopy(self.proposal)
        bad['managementCandidateSet']['candidateSetId'] = 'ADOPT-MANAGER-285967'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_existing_record_ids_cannot_be_reused(self):
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['shape'][0]['recordId'] = 'SHAPE-TEXT-UMT5-BLC'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_native_profile_id_is_only_the_real_execution_id(self):
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['shape'][0]['nativeProfileId'] = 'SHAPE-BERNINI-QKV-N16'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_build_identity_is_bound_to_actual_build_info(self):
        bad = copy.deepcopy(self.proposal)
        bad['sourceBuild']['buildId'] = 'diffusion-models/0.1+' + '0' * 64
        with self.assertRaises(ValueError): self.apply(bad)

    def test_handoff_api_and_descriptor_identity_cannot_be_relabelled(self):
        for field, replacement in [('handoffCommit', '0' * 40), ('apiVersion', 'pretend-api/9'), ('nativeDescriptorSchema', 'pretend-schema/9')]:
            bad = copy.deepcopy(self.proposal)
            bad['sourceBuild'][field] = replacement
            with self.subTest(field=field), self.assertRaises(ValueError): self.apply(bad)

    def test_preview_does_not_keep_the_baseline_document_version(self):
        bad = copy.deepcopy(self.proposal)
        bad['proposedDocumentVersion'] = '1.0-draft.1'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_inputs_are_preserved_and_the_output_is_only_reference_data(self):
        before = copy.deepcopy(self.proposal)
        base = dict(self.base)
        output = self.apply()
        self.assertEqual(self.proposal, before)
        self.assertEqual(self.base, base)
        self.assertEqual(set(output), set(self.base))
        self.assertTrue(all(isinstance(v, bytes) for v in output.values()))


if __name__ == '__main__': unittest.main(verbosity=2)
