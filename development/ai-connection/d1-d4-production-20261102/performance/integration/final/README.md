# Final generated-inventory API regression

All four existing browser suites pass against build
`diffusion-models/0.1+134d002dbab74539d95d66e529bcd34f4e6b4a87459856359195a6876ba1a386`:

| Suite | Passed | Page errors |
| --- | ---: | ---: |
| API browser | 22/22 | 0 |
| LoRA IO browser | 16/16 | 0 |
| L1 API mode | 4/4 | 0 |
| E6 API | 4/4 | 0 |

The strict Node test servers combine their explicit fixture routes with exact
URL-to-file mappings for the generated144-entry `BUILD_SOURCES` inventory.
Sibling `ai-connection`, `inference` and `vr180` paths map to their actual shared
module files. Duplicate routes with conflicting files fail. Membership remains
an explicit finite map; there is no directory-serving fallback. The receipt
records the build ID, inventory count and tested source hashes.

The prior final-build failure was a missing allowlist dependency, recorded in
`api-browser-before-final-inventory.log`. Neither the production implementation
nor its capabilities/build metadata was changed to fix this test-server issue.
Legacy historical result files were restored; final reports are preserved here.

Reproduction commands are unchanged from the parent integration README. These
checks cover existing arithmetic/LoRA IO and unloaded model error semantics.
They do not run model inference or broaden any original-shape acceptance.
