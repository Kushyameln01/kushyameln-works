# G1C mapping and V1 first profile
Plan source: user-attached implementation0.1-draft.1 + specification1.1-draft.1; exact hashes inacceptance-plan.json.
Baseline6432de584b633e7b0fb1a4b7ab6d4cc8f8ccd095; latestmain029ce933 read beforework. ExistingnativeAPI/codec/12fixture/5framebundle retained.
- [x] LosslessG1Cmapping andcodec/outer-package boundary.
- [x] Fresh privateF1 graph export andoriginalmodel/sourceSHA.
- [x] NativeFP32reference forunchanged16x16PNG; alloutputcompares (predeclared2e-5absolute/relative/maxAbs).
- [x] ActualORTWASM+Hike acceptance, savedbinaryrecovery, cancel/session/dispose, resource/timeevidence.
- [x] Existing5frame regression andindependentreview, reportremainingprofiles andV2dependencies.
Ruling: Firstselectedprofile isdiagnosticF1atnative16x16fromexisting623BopaquePNG. AttachedplanV1explicitlyallowssmalldiagnosticprofile withoutchangingoriginalworkflow; actualworkflowmedia unavailable areblockedonlyfortheirownprofiles. Noresize,pad,framecut introduced.
Ruling: Preservealloriginalnativefields andevidenceinoutermapping; noM1/M5managerimplementationorsemanticregistrationinvented.

Ruling: Exported ONNX inputs are concrete; PyTorch legacy exporter leaves output type dimensions symbolic (also after ONNX inference). Preserve exported bytes and enforce exact native-reference AND real SDK runtime output shape. Do not fabricate fixed output metadata or relax runtime shape validation. Initial metadata-only assertion failure retained in native-reference-initial.log.

Validation: real browser5phasesPASS; 12unchangedfixturesPASS; Python53/53PASS; syntax+DiffusionreceiptPASS; independent whole-branchreviewno importantfindings. Initialharnessmeasurementlauncher unavailable andcollapsed-detailsreader corrected, plusONNXsymbolicoutputmetadata guardadjustment documented; numerical gates andmodelbytes neverchanged.
