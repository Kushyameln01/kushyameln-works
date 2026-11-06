"""Static N2 catalog registration contracts; no model or reference-array IO."""
import copy
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('n2_registration', HERE / 'build-qkv-n2-registration.py')
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


class RegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.owners = registration.load_inputs()
        cls.proposal = registration.build_proposal(cls.base, cls.owners)

    def apply(self, proposal=None, base=None, owners=None):
        return registration.apply_registration(self.base if base is None else base, self.proposal if proposal is None else proposal, self.owners if owners is None else owners)

    def test_new_common_records_rules_norm_and_candidate_have_separate_ids(self):
        result = self.apply()
        old = registration.parse(self.base[registration.CATALOG])
        cat = registration.parse(result[registration.CATALOG])
        self.assertEqual(cat['managementAdoptionSets'], old['managementAdoptionSets'])
        self.assertEqual(cat['managementCandidateSets'][0], old['managementCandidateSets'][0])
        self.assertEqual(cat['managementCandidateSets'][1]['candidateSetId'], registration.CANDIDATE)
        self.assertEqual(len(cat['managementCandidateSets']), 2)
        self.assertEqual(cat['documentVersion'], '1.0-draft.3')
        self.assertFalse(cat['runtimeIntegrated'])
        self.assertEqual(cat['registrationSourceBuild'], old['registrationSourceBuild'])
        self.assertEqual(cat['registrationN2SourceBuild']['mainBuildCommit'], registration.CODE)
        self.assertEqual(registration.counts(result), {'profileRecords': 25, 'numericRules': 19, 'managerNorms': 14})

    def test_prior_profiles_rules_and_norms_are_not_widened(self):
        result = self.apply()
        for path in registration.PROFILE_PATHS + [registration.RULES, registration.NORMS]:
            before, after = registration.parse(self.base[path]), registration.parse(result[path])
            key = 'records' if 'records' in before else 'rules'
            self.assertEqual(after[key][:len(before[key])], before[key])

    def test_shape_and_normalization_ids_are_not_native_ids(self):
        records = self.proposal['profileRecords']
        self.assertIsNone(records['shape'][0]['nativeProfileId'])
        self.assertIsNone(records['normalization'][0]['nativeProfileId'])
        ids = [r['nativeProfileId'] for r in records['numeric-execution']]
        self.assertEqual(ids, [registration.NATIVE, registration.PREFIX])
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['shape'][0]['nativeProfileId'] = 'SHAPE-BERNINI-DERIVED-N2-ALL40'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_native_admission_is_exact_side_timestep_grid_and_limited_scope(self):
        gate = self.proposal['profileRecords']['numeric-execution'][0]['admissionConstraints']['trustedProducer']
        self.assertEqual(gate['evidenceExact']['operatorShape'], [2, 5120])
        self.assertEqual(gate['evidenceExact']['rowToGrid'], [[0, 0, 0], [0, 0, 1]])
        self.assertEqual(gate['evidenceExact']['sourceIds'], [0, 0])
        self.assertEqual(gate['evidenceExact']['contextLatents'], [])
        self.assertEqual(gate['sideCases']['HIGH']['scheduleIndex'], 1)
        self.assertEqual(gate['sideCases']['LOW']['scheduleIndex'], 3)
        for field, value in [('operatorShape', [16, 5120]), ('layout', 'BLC'), ('grid', [21, 30, 52]), ('sourceIds', [0, 1]), ('contextLatents', ['invented']), ('productionHiddenVerified', True), ('load', 'READY')]:
            bad = copy.deepcopy(self.proposal)
            bad['profileRecords']['numeric-execution'][0]['admissionConstraints']['trustedProducer']['evidenceExact'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.apply(bad)

    def test_prefix_numeric_dependency_and_its_precision_are_not_implicit(self):
        rule = self.proposal['numericalRules'][0]
        self.assertEqual(rule['ruleId'], 'NR-BERNINI-RECT2-PREFIX-F32')
        self.assertIn('timeSin', rule['rule']['precision'])
        self.assertEqual(rule['rule']['gates']['hidden'], {'abs': 0.001, 'rel': 0.0001})
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['numeric-execution'][0]['requiredDeclarations']['dependencyProfileRefs'] = []
        with self.assertRaises(ValueError): self.apply(bad)

    def test_observed_success_cannot_relax_a_predeclared_gate(self):
        for record in [0, 1]:
            bad = copy.deepcopy(self.proposal)
            bad['profileRecords']['numeric-execution'][record]['requiredDeclarations']['gates'] = {'all': {'abs': 1}}
            with self.subTest(record=record), self.assertRaises(ValueError): self.apply(bad)

    def test_production_precision_or_readiness_cannot_be_promoted(self):
        for field in ['managerAccepted', 'generationReady', 'originalWorkflowInputsVerified', 'originalProductionPrecisionVerified', 'fullSequenceVerified']:
            bad = copy.deepcopy(self.proposal)
            bad['managementCandidateSet'][field] = True
            with self.subTest(field=field), self.assertRaises(ValueError): self.apply(bad)

    def test_old_record_or_adoption_id_cannot_be_overwritten(self):
        bad = copy.deepcopy(self.proposal)
        bad['managementCandidateSet']['candidateSetId'] = 'ADOPT-MANAGER-285967'
        with self.assertRaises(ValueError): self.apply(bad)
        bad = copy.deepcopy(self.proposal)
        bad['profileRecords']['shape'][0]['recordId'] = 'SHAPE-BERNINI-QKV-N16'
        with self.assertRaises(ValueError): self.apply(bad)

    def test_fixed_n16_preview_and_canonical_catalog_bytes_are_required(self):
        bad = dict(self.base); bad[registration.CATALOG] += b' '
        with self.assertRaises(ValueError): self.apply(base=bad)
        bad = dict(self.owners); key = registration.BASE + ':' + registration.CATALOG; bad[key] += b' '
        with self.assertRaises(ValueError): self.apply(owners=bad)

    def test_main_build_commit_api_and_descriptor_cannot_be_relabelled(self):
        for field, value in [('mainBuildCommit', '0' * 40), ('handoffCommit', '0' * 40), ('apiVersion', 'invented/9'), ('nativeDescriptorSchema', 'invented/9'), ('buildId', 'invented/9')]:
            bad = copy.deepcopy(self.proposal); bad['sourceBuild'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError): self.apply(bad)

    def test_changed_kernel_cannot_keep_the_same_api_or_source_commit(self):
        bad = dict(self.owners)
        key = registration.CODE + ':docs/shared/diffusion-models/ort-bridge/block-hidden/kernel.wasm'
        raw = bad[key]; bad[key] = raw[:-1] + bytes([raw[-1] ^ 1])
        with self.assertRaises(ValueError): self.apply(owners=bad)

    def test_self_consistent_changed_plan_is_not_the_fixed_source(self):
        bad = dict(self.owners); key = registration.CODE + ':' + registration.PREFIX_PLAN
        plan = registration.parse(bad[key]); plan['gates']['hidden']['abs'] = 1
        bad[key] = registration.encode(plan)
        forged = registration.build_proposal(self.base, bad)
        with self.assertRaises(ValueError): self.apply(forged, owners=bad)

    def test_self_consistent_unknown_owner_asset_is_not_authenticated(self):
        bad = dict(self.owners); bad[registration.CODE + ':invented-owner-source.txt'] = b'pretend'
        forged = registration.build_proposal(self.base, bad)
        with self.assertRaises(ValueError): self.apply(forged, owners=bad)

    def test_forged_handoff_cannot_reanchor_a_modified_receipt(self):
        bad = dict(self.owners); key = registration.HANDOFF + ':' + registration.HANDOFF_PATH
        handoff = registration.parse(bad[key]); handoff['readiness']['load'] = 'READY'; bad[key] = registration.encode(handoff)
        forged = registration.build_proposal(self.base, bad)
        with self.assertRaises(ValueError): self.apply(forged, owners=bad)

    def test_reused_results_remain_exact_14_prefix_and_11_downstream_per_side(self):
        for side in ['HIGH', 'LOW']:
            evidence = self.proposal['managementCandidateSet']['reusedOwnerEvidence'][side]
            self.assertEqual(evidence['prefixStages'], 14)
            self.assertEqual(evidence['headComparisons'], 11)
            self.assertEqual(evidence['failed'], 0)
            self.assertFalse(evidence['freshForRegistration'])

    def test_inputs_and_previous_source_build_are_preserved(self):
        base, owners, proposal = dict(self.base), dict(self.owners), copy.deepcopy(self.proposal)
        result = self.apply()
        self.assertEqual(self.base, base); self.assertEqual(self.owners, owners); self.assertEqual(self.proposal, proposal)
        self.assertEqual(set(result), set(base)); self.assertTrue(all(isinstance(v, bytes) for v in result.values()))


if __name__ == '__main__': unittest.main(verbosity=2)
