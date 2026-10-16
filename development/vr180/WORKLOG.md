# VR180 b1 implementation log

## 2026-10-17 start

User authorized implementation using plan1.1 and attached audit. Main input confirmed VR180 capture/stereo; no repeat question. Read audit fully. GitHub connector confirmed repo access and main0ee9b175; created isolated local branch codex/vr180-browser-b1 from that state. Existing public sites unchanged.

Read applicable orchestration/audit protocol, Sites and browser-tools instructions; prior Guardian/CDLC/ADHD/preserve-procedure instructions remain applied. RTK0.51.0 prepared (no telemetry). Current source metadata and pinned dependency retained.

Initial independent audit permits packed-stereo starting scope, requires explicit experiment contract before code. IMPLEMENTATION.md records routes, data/timing/resource limits, independent verification and unverified target VR playback. Separate-eye/unknown-mesh acceptance held; dependent branches alone are blocked. Contract sent for critique before implementation.

Operational note: broad GitHub commit output and a search of a minified bundle produced excessive output; subsequent reads must select metadata or source archive files, not full diff/minified line. Cloud skill child protocol resources failed; recovered exact installed reference files. No product code yet.

## Preimplementation recheck

Independent auditor read contract and released packed-input implementation HOLD (PROCEED). Technical reviewer inspected pinned Mediabunny source: CanvasSource/VideoSampleSink + encoded AAC copy supported; OPFS random writes and explicit cancellation cleanup required; mux indices grow O(samples), complex edit lists are not supported. Contract corrected with 100000 sample guard and deferred cleanup until consumption/disposal. Separate-eye and unknown-mesh HOLD remain.

Created owner-private Sites staging appgprj_6ad2a14bdd54819188aae0b453eef8e3 at kushyameln-vr180-studio-lab. Registration only, not yet deployed. Assigned MP4 metadata module and transform module to two independent writers with disjoint paths and test-first requirement. Coordinator owns UI/Worker/fixtures/integration.

## Integration review and recovery

Fast-forwarded the isolated branch to concurrent main 34368e769def983d7709ed21a6ac4a93c9b4b2b4. Preserved shared compute preparation recovery changes. Unit tests identified no metadata failure; independent reviewer identified UI preparation cancellation and save-picker races. Added operation ownership/AbortController covering fetch and cleanup before Worker creation; save ownership starts before the picker and retains output on cancellation. Stale cleanup errors now appear separately, settings invalidate old output, synchronous postMessage failure releases the Worker. Meaningful cancellation and client tests pass. Restricted eye raster ratios are now explicit in UI and contract, not inferred projection claims.

Real AAC fixtures contain leading edit trims; metadata copy accepts/preserves them, transform admission currently rejects them until preservation is independently established. Transform author is investigating the pinned muxer before any relaxation.

Managed preview requires the control-browser skill, absent from installed files and executor skill discovery (missing /root/.codex/skills/browser). No substitute local server/browser installation is being used. Owner-private Sites and permitted TinyFish remain the intended cloud QA path.

## Metadata worker: bounded MP4 patcher and AAC admission follow-up

Implemented `inspectMp4`/`tagMp4` after failing Node tests; 16 focused tests passed before the AAC follow-up. Patcher reads bounded metadata (16 MiB candidate budget, 20000 boxes, depth 16), appends a rewritten moov, and changes only the prior moov fourcc to free. It rejects unsupported tracks/codecs/references/offset structures and conflicting projection/layout/orientation. The independent Python verifier in `tools/vr180/verify-metadata.py` imports no producer code. Stored SBS, TB and repeated-SBS outputs in `evidence/metadata/` passed independent box parsing and ffprobe comparison: all 155 packets (60 H.264, 95 AAC), hashes, PTS/DTS/duration/position/skip-sample data, sample tables, edits and mdat bytes/positions were equal to their respective source. Raw equi bounds remain exactly 0/0/0x40000000/0x40000000; ffprobe's displayed pixel bounds are a separate rounded representation.

AAC follow-up plan, recorded before relaxing the guard: the transform worker traced pinned Mediabunny 1.61.5 negative PTS and edit-list reconstruction, then tested the production AAC copier against all three real fixtures. Its independent ffprobe and decoded PCM checks passed, including 1024 leading samples and the exact tail. Therefore allow only a single rate-1.0 nonnegative audio edit whose input endpoint equals the actual sample presentation endpoint, whose resulting endpoint lies exactly on the pinned 57600 Hz output movie grid, and whose separately rounded muxer span plus offset reproduces that endpoint. Video leading trims, complex/negative/rate-altered edits, trailing trim/extension and rounding mismatches stay blocked. Add a failing admission test before changing the guard; retain the transform runtime's sample-grid/continuous-PTS checks. This evidence does not establish viewport rendering, headset/player interoperability, ordinary-camera footage or general HDR detection; SDR remains an input premise and explicit unsupported color/profile metadata is rejected.

AAC admission result: observed the new positive admission test fail (`false !== true`), then implemented exact BigInt rational checks plus agreement with the pinned Number rounding. Rejected controls include a 1.001-second fractional movie tick, the negative half-tick double-rounding counterexample, end trim, negative media time, video leading trim and an unedited audio endpoint off the output movie grid. `node --test tests/vr180-mp4.test.mjs tests/vr180-transform.test.mjs` passed 30/30 (18 metadata, 12 transform); all three real H.264/AAC fixtures now satisfy the constrained inspection guard, while the production AAC packet/PCM checks remain green. Regenerated the three stored metadata outputs after this guard-only change: bytes were identical to the previous outputs, and all three independent JSON verification reports passed again. Two negative verifier controls (wrong stereo layout and unchanged input masquerading as tagged output) were rejected as expected; recorded in `evidence/metadata/verifier-negative-controls.json`. No independent viewport or target VR player result is claimed by this paragraph.

## Source freeze and private candidate

Final scoped Node suite: 37/37 PASS; raw evidence/node-tests.txt. Node syntax checks passed for all new modules and UI. Metadata outputs independently verified; compressed AAC roundtrip test passes for three fixtures. Final UI review corrected save cancellation after close: write commitment is recorded separately, and cancellation of post-save verification no longer claims the completed write was canceled. AAC seek sample-group loss remains explicit and release-gating.

Owner-private Sites source a9d94a87c54d5a73ef931a5515d7f7526ed7b5ee was pushed and packaged by the native source workflow. Native private deployment succeeded: appgdep_6ad2a691476c81918a4ac57fd36faa0e, version appgprj_6ad2a14bdd54819188aae0b453eef8e3~appgver_f3510a9092fc819198ee9b75099cb507. URL https://kushyameln-vr180-studio-lab.vde6fedxrbh7fbbb740t.chatgpt.site . Exact 22 candidate asset hashes in evidence/staging-files.json; deployment response in evidence/deployment.json. This commit identifies the Sites source, not the GitHub working branch. No change to existing Works Sites audience or Pages main.

Cloud execution is BLOCKED pending one user connection confirmation. TinyFish list_profiles returned a default profile with no signed-in sites. Its documented instruction forbids assuming a login from profile name and requires user confirmation before running/setup. No browser run was started, no bypass token requested, and no audience broadened. control-browser remains absent, so prohibited substitute servers were not used. User manual media testing is not the fallback.

Independent final audit/review checks local outcome and interruption, not whole-product completion. RESULT.md records stage2/5 gaps and exact restart conditions. GitHub source commit/push follows this log entry; its success must be confirmed separately before the final response.

## GitHub source transport recovery

Local source commit f7cac59509a6281e8dd918b3e173ef623b4a9ade was created successfully. HTTPS git push failed because this execution environment has no GitHub Username credential provider; no remote branch update occurred. Recovery uses the already connected GitHub plugin Git-object API, preserving the exact file bytes and comparing the resulting tree against the local tree. Sites source and deployment remain successful and are separate from this GitHub transport failure.

Final technical review confirms the save-commit cancellation correction has no remaining blocking finding in its reviewed diff. Independent audit permits reporting the limited implementation and connection-blocked cloud QA, subject to confirming source saving. This log does not predeclare the API save result; final response must use the returned remote commit and branch state.
