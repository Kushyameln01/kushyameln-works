# Current E0/E2/E6 update after owner push — 2026-10-31 JST

**Both f522d9a and9023329 are now actually acquired.** Earlier422 responses below are historical evidence; they are no longer current acquisition blockers. The earlier report is also preserved separately as `diffusion-review-before-push.md`.

## Exact received source and archive

- Actual implementation: `f522d9aeff313558c4ef83022a340af9a4c21391`, branch`codex/diffusion-l1-wasm`. Nativeprotocol remains`diffusion-models/0.1`; actualBUILD_ID is`diffusion-models/0.1+17ecb7d0645bc4ac28ef459cfb1a4d594e58398b6db73d5d42ac072bc1b5df70`.
- Proposal: `9023329b8d803306abcdd9342f24c01ba0df2676`, branch`codex/diffusion-api-adjustment`. Its `bernini-integration/0.2-draft.1` is a historicalproposal, not the currentwire protocol.
- Actual902archive received viaGitHubconnector: **73,134 bytes**, SHA-256 **`3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`**. PAXcommit matches902; all32files matchmanifest bytecounts/SHA-256/blob IDs and actual902GitHubtree. Manifest SHA`622b68a2dbd6bbcd4a5ee8f90306bf0a8ab8cfe0a98e387340e9edd473beb337` verified. This is a reference subset, not a runnable runtimebundle.
- `diffusion-reacquisition-verified.json` records timestamp,18actual retrievedsource hashes, archive verification and exact normalization dependency comparison. Files are private under`diffusion-source-f522d9a/`. No ownerfiles were edited/merged.

Immutable links:

- [Actual API](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/docs/shared/diffusion-models/API.md)
- [Owner common/native mapping](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/development/ai-connection/CONTRACT-MAPPING.md)
- [Core mapping and G1C follow-up](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/development/ai-connection/CORE-CONTRACT-MAPPING.md)
- [Original902 proposal](https://github.com/Kushyameln01/kushyameln-works/blob/9023329b8d803306abcdd9342f24c01ba0df2676/development/diffusion-models/INTEGRATION_ADJUSTMENT.md)
- [902archive actual bytes](https://raw.githubusercontent.com/Kushyameln01/kushyameln-works/f522d9aeff313558c4ef83022a340af9a4c21391/development/ai-connection/a0/9023329-source.tar.gz) and [manifest](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/development/ai-connection/a0/9023329-source.manifest.json)
- [L1 diagnosticAPI](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md), read here without executingL1 modeloperations.

## E6 exactshape support

The f522API explicitly keepsNOT_READY forload/predict/sample, the pointwisebudget1,048,576 and mean kernel128 unchanged. The exact commoncodec, interop, latent-space module, kernelregistry, Hikesource and6385-bytekernel have identical blobs/SHA-256 at679a72d7,9023329 andf522d9a. Therefore prior12small boundarychecks are **reused through byte-identical dependency proof**, not counted as12newexecutions.

Also executed `node diffusion-f522-metadata-check.mjs` against the newly acquiredf522files: four boundedobservations, noNN inference. The actualnewacceptedrectangular VAEmean `browser-acceptance/png-mean.wktensor`, shape`[1,16,1,2,4]`,128elements, fileSHA`6539204ef61dc0f706238b74e2bcabf8bbcce971f5056d0b0d7e288811516b71`, payloadSHA`289977e71b65ca42ac9f3fa2b614882bc0eba7420e70620927a25740db6f53a3`, is rejected by f522validator/normalize/restore: `RangeError: Tensor shape cannot connect to this profile`; addedHikecalls0.

The owner-published implementation/docs explicitly supportonly`[1,16,2,2,2]`, not64F1 or same-countrectangle. No newowner64/rectangle extension exists in thissource. NewACK for this particularE6 review remains unreceived; do not claim a new bilateralagreement. Noreshape/padding/frame duplication/hash retagging/normalization inVAE was added.

## E2 important measured metadata difference

This f522numeric closure is **not our G1C metadata-preserving closure**. Actualowner observations:

| Operation | Observed result |
| --- | --- |
| Existing128mean normalize andrestore with valid5-frame nativecontext | Both **dropcontext**. Numbers/model remaincorrect;2realHikecalls, maxAbs`3.5762786865234375e-7`≤`2e-6`. |
| Owner commoncodec andrawmean storagewrapper | **Dropcontext** in savedheader/readback. |
| Owner conditioning storagewrapper | Preservesmask`[1,0]` andmodelSHA, but **drops suppliedtokenizerSha256**. |
| Actualrectangular mean128 | Exactshape rejection describedabove. |

`diffusion-f522-metadata-results.json` explicitly records`jointMetadataPreserved:false`. Its observationchecks pass because they reproducedthe differences, not becausejointmetadata preservationpassed.

Sourcepoints atf522: `latent-space/latent-space.mjs:28–33` buildsoutputwithoutcontext; `tensor-interop.mjs:38–39` whitelistslegacyownedTensorfields; `inference/tensor.mjs:25` saveslegacyheaderfields. `api/worker.mjs:28–30` returnsbasicvalidationmetadata and`:60–61` returnsthe transformtensorunchanged.

Keep the502/G1C metadata-onlypatches. An outside manageradapter must retain completeoriginal nativeMetadata/evidence andinput/outputpayload bindings/trace in its artifact/sidecar. Unknown/absent fields stay unknown/absent. Do not overwriteourcodec with ownerlegacycodec or claim f522echoesmetadata it drops. Any futureowneradoption ofmetadata-onlypatches requires thatowner's receipt/regressionupdate. Noownerfiles changedhere.

## R3/core body nowactually obtained

The owner's COREmapping and902body, including pinnedComfyUI source/line/hashreferences, were acquired and read; everyupstreamfile was not independently refetched/reexecutedthisphase.

- **Text:** plain512 versusIDvariableL agrees withG1C. Proposed`prepareConditioning` owns snapshot, zeroesmaskedrows andrightpads512beforetext_embedding, keepsoriginalL/mask/internalholes, does not addsoftmaxmask. Still unimplemented. LaterCOREfollow-up putsBerniniliteralprompt/negative assembly inmanagement, correctingthe older902 Diffusion-ownedliteralprompt proposal.
- **Contexts:** VAE returnsrawmean; Diffusionowns percontextWanprocess_in. Orderis sourcevideo→referencevideo→slotorder→imageframe. Actualstreamlisti becomes source_id=i+1,target0. Noemptyroles, dedup/reorder, slotIndex=source_id orinputframearray=latentT identity. G1C frameindices/times must be retainedoutsidecurrentf522 transforms.
- **Graphconsumption:** perstream patch→flatten→transpose, thentoken-axisconcat aftertarget; suffixremovedafterhead. NotrawNCTHWconcat. Patch`(1,2,2)`; RoPEaxis widths`[44,42,42]` plusfull128source_id rotation; eagercircular versus tracedreflectpadding remainexplicit. Theseare acquiredstaticrules, notfullgraphacceptance.
- **Generatedsample:** laterG1Cfollow-up explicitlymatches`wan21-raw-generated-sample:v1`,schemaVersion1,raw/restored, actualproducerModelSha256s separatefromdecoderVAE, normalization`wan21-comfy-f32-v1` owner`diffusion_models`. Metadataisnotnumericalevidence. Actualproducer/restorationtrace/decodercomparison remainunimplemented. Historical902decoderBinding/producerfieldscannotbesentdirectlytoG1C.
- **HIGH→LOW:** acquiredstaticcontractpreserves output0rawhandoff N^-1(u/(1-s)) thenLOW(1-s)N(h),LOWadd_noise=false and separateallzero-startskip; noidentitysimplification orordinarymean-zeroexception. NoE8/E9 executionperformed.

Currentoutcome: E0acquisitionresolved; declaredG1Cschema correspondenceis nowvisible inbothowners'source. E6newshapeDiffusionsupport, E2fullmetadatajointpreservation, generatedproducer/restore/decode, externalmanageradapter/packageacceptance andnewbilateralACK remainseparateunfulfilledstates. IndependentVAEprofiles andold128Diffusionmean remainusablewithin scope.

---

# Historical pre-push report below — acquisition failures superseded above

# E0/E2/E6: Diffusion source acquisition and shape boundary

2026-10-31 JST. Read-only source investigation plus small validator/real-Hike fixtures. No neural inference, VAE numeric conversion, normalization extension, model download, new export, repository mutation or external comment was performed by this reviewer.

## Acquisition states

| Target | Actual result |
| --- | --- |
| `f522d9aeff313558c4ef83022a340af9a4c21391` | GitHub connector `fetch_commit` for `Kushyameln01/kushyameln-works` returned 422 `No commit found for SHA`. Source not acquired; does not establish nonexistence in its owner's environment. |
| `9023329b8d803306abcdd9342f24c01ba0df2676` | Same 422 response. Execution plan reports archive SHA-256 `3464794167492e1440a918ab38e9823e6d9d030d141e58fb596fae7b482fdbb0`; no actual archive/reference bytes were acquired, so that hash is a declaration, not a local verification. |
| Retrieved owner source | `679a72d7f53e31bccecbee46b4e2fe559a4e0aba`, `codex/diffusion-models`. Exact Git objects copied into private `diffusion-source-679a72d7/`. `tensor-interop.mjs` additionally fetched through GitHub connector at the same full SHA; its blob ID matches `0aed25de3451728844051ce1e2048cb0a12d6e28`. |
| Retrieved owner BUILD_ID | `diffusion-models/0.1+33d7c5c3f3865fb6cf68b85358e04d1d0f558ca362531cc14902667fcc0c850b` |
| New owner acknowledgement | None received. Current retrieved implementation explicitly rejects these new shapes; this is not a new bilateral owner agreement or verification of the unacquired f522/902 source. |

The actual retrieved source URL is:

https://github.com/Kushyameln01/kushyameln-works/blob/679a72d7f53e31bccecbee46b4e2fe559a4e0aba/docs/shared/diffusion-models/tensor-interop.mjs

The exact eight source/binary paths, byte lengths, SHA-256, Git blob IDs and immutable HTTPS URLs are in `diffusion-source-acquisition.json`. Particularly:

- `tensor-interop.mjs`: SHA-256 `fd92792e2b2cbe93cb5ea0a899ab072f3a256453da821c42ef31c2ed906c4b3f`.
- `latent-space/latent-space.mjs`: `e123db620dd4ef1ff133c41122ebe1384f49c6506ee3f5be17a8450dc8b65e14`.
- Real Hike `latent-space/build/latent-space.wasm`: 6,385 bytes, `ffd1c821d9ecf2aba10cd7ac96f231c78380a1d02621dae8838ee8d64495b9ea`.
- Original Hike source: `ceb50086b0ca658c1547058d339980ceb5b8f40797ee365b2af203d996c6ea5d`.

## Space evidence and search limits

Read the actual common specification Page `page_65b303c9bc708191a7e48c78b51c35a7` (1.1-draft.1), actual LoRA handoff Page `page_4988393f36e88191bcf7c0823139d1f3` (full current body), and the root's fetched execution plan `page_cfdb3e2026608191964eb24af5c64e61` / local `page-1.md`. The common Page explicitly retains 902 as unacquired. The LoRA Page supplies its own v2 archive and old Diffusion029 references, not a f522/902 archive or a 64-element mean extension.

Also searched Pages for `DiffusionModels API 0.2`, `DiffusionModels 引継ぎ`, `9023329`, `f522d9a` and the declared archive hash. These are bounded semantic results and not proof of absence. Exhausted the top-level accessible Page listing (40 entries) and the common specification's direct children; no Diffusion source handoff Page was identified there. Other unlisted stores or private owner workspaces are not asserted absent. No body or schema was reconstructed from a report summary.

## Existing actual shape boundary

Retrieved `WAN21_RAW_PROFILE` is exactly:

```text
id       wan21-raw-f32-5x16x16
dtype    float32
layout   NCTHW
meaning  raw-posterior-mean
shape    [1,16,2,2,2] = 128 elements
producer 2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b
```

`requireWanRawLatent`, `encodeWanRawLatent`, `normalizeRawMean` and normalized-mean restoration validate the exact profile, not just its element count. Existing `createLatentSpace` has 128-element buffers and actual exports `NormalizeRawMean` / `RestoreRawMean`. No generic-shape or 64-element transform export was found in this retrieved implementation. Hike imports are empty. `tensor-interop` module exports are recorded in the fixture report.

## Small fixture execution

Command: `node /workspace/work/inference/e6-rect/diffusion-boundary-check.mjs`.

The private script imports the exact retrieved owner's source tree; it does not substitute our merged metadata implementation. All **12 bounded checks passed**:

| Input or condition | Result |
| --- | --- |
| Actual previously accepted F=1 mean `[1,16,1,2,2]`, 64 elements | Read original `.wktensor` without reshape/relabel/hash change. File SHA `3641234c5f5a722d1d7eb2b4558412ba2c425d089324986bcdf209e66f9f8e98`, payload SHA `8f245b119bfd7ad42ea78e6f0ed68a9ee5d852f6fe85c528cdc0f87166c7d26e`. |
| Actual F=1 mean through validator / writer wrapper / normalize | Explicitly rejected: `RangeError: Tensor shape cannot connect to this profile`. |
| Normalized-mean fixture with the same F=1 shape through restore | Same explicit shape rejection. No generated-sample meaning was introduced. |
| Rectangle `[1,16,1,2,4]`, also 128 elements | Synthetic boundary-only fixture: validator, normalize and normalized-mean restore all reject exact-shape mismatch. It is not the new rectangular VAE neural output. |
| Unsupported-shape attempts | Actual Hike transform call count remains zero. |
| Old `[1,16,2,2,2]` mean | Actual Hike normalize → existing codec save/read → actual Hike restore succeeds. 128 outputs, 2 Hike calls, max absolute round-trip error `3.5762786865234375e-7` under the retained `2e-6` gate. |
| Generated-sample meaning or wrong producer hash | Existing strict mean boundary rejects them. |

Machine-readable evidence: `diffusion-boundary-results.json`; retained old-profile binary: `old128-normalized.wktensor`. The old path remains supported. Neither the 64-element F1 nor the same-count rectangular profile is connected to this Diffusion transform. An adapter may report this explicit unsupported edge; it may not reshape, pad, duplicate frames, retag a model hash or add the transform to VAE.

## What is pending versus independently actionable

- Needed from Diffusion owner: retrievable f522/902 source and declared archive bytes; versioned API/exports/build/profile acceptance; either an explicit maintained non-support decision for each new shape or an owner-implemented and validated shape-specific extension. A report-only implementation cannot be called acquired or jointly verified.
- A VAE rectangular profile can be exported and accepted independently under its own scope. Equal latent element count does not make its temporal/spatial semantics compatible with the old kernel.
- The management adapter keeps native `raw-posterior-mean`, exact shape, VAE producer, mask/context/metadata and the unsupported reason. It does not change any numeric space. New generated-sample restoration and E8/E9 remain outside this check.
- New-source acquisition, counterpart ACK and actual new-profile Diffusion acceptance remain separate pending states. The existing 128-element mean path and independent VAE work remain usable.
