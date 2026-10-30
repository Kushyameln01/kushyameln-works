# Text Encoder / VAE publication review

Reviewed baseline: `a92e1044d42078d7fd65175570a383e7660436d7` (73 changed files), its 27-file public candidate, and the concrete publication fixes below. The user now explicitly requests GitHub Pages publication. That authorization supersedes the earlier local-only scope; this review does not create another generic approval requirement.

## Decision

PROCEED to the existing exact-file registry/export/deployment workflow after incorporating the notice fix and regenerating the candidate snapshot. Do not export the old 27-file snapshot: the notice adds a public file and the Worker runtime-path fix changes bytes. Export must continue to validate exact file/dependency closure. Registry mutation, export and deployment are performed by the Coordinator, not this review.

## Purpose and content

- Public endpoints are the independent TextEncoder and VAE tools plus their typed external API, common single-job Worker/controller, tensor format, Hike tensor kernel and pinned local browser dependencies.
- Diffusion and another Codex's aggregator are outside these components. The UI/API explicitly reject text embeddings as VAE latents; no text-to-image generation or actual peer-handshake claim is made.
- Public limits remain explicit: FP32 diagnostic arithmetic, UMT5 24 layers/maximum512 tokens, and the tested fixed Wan2.1 VAE profile. Public descriptions do not claim original GPU FP8/BF16 arithmetic equivalence, arbitrary VAE video shapes or measured user-PC load reduction.
- All 27 candidate hashes and byte lengths matched baseline `a92e104` at initial review (13,602,984 total bytes). Every changed `docs/` file was represented. No `.onnx`, `.safetensors`, `.pt`, `.pth`, `.f32`, `.wktensor` or symlink appeared among the73 changed files. The only changed file over1MB was the12,361,745-byte pinned ORT runtime WASM. Model graphs, original weights, tokenizer model, selected prompts/media and private working directories are not shipped.

## Dependency and network boundary

The module Worker imports local ORT, Hike, Text/VAE and tokenizer modules. Hike is fetched from the local kernel path and hash checked; ORT is single-thread WASM with proxy disabled. The Coordinator's pending Worker fix selects the exact local ORT `.mjs` and `.wasm` artifacts explicitly, avoiding an unprovided version-suffixed package filename. Both artifacts and the ORT entrypoint are already in the candidate and hash matched installed `onnxruntime-web@1.24.3` at inventory review.

SentencePiece contains its own embedded runtime WASM as package code, not a trained tokenizer model. The latter is selected from a local verified bundle. Inference files are read from caller-provided File/Blob/Uint8Array objects; there is no model/prompt upload endpoint. The API requires an explicitly supplied MessagePort and does not install a wildcard window-message server. The existing GitHub catalogue analytics script was retained; the new input tools do not add remote telemetry or service credentials. Source-provenance URLs are documentation/metadata, not startup network jobs.

## Concrete notice fix P1 — resolved in working tree

`sentencepiece.mjs` also embeds `buffer@6.0.3` (MIT), `ieee754@1.2.1` (BSD-3-Clause), `base64-js@1.5.1` (MIT), and the original Microsoft generated-helper notice from the pinned package's `dist/index.js`. Its minifier tail provided only short buffer/ieee754 labels, not complete license terms.

Added `docs/shared/inference/vendor/SentencePiece-ThirdPartyNotices.txt` containing the complete exact installed LICENSE texts plus the original Microsoft notice. Bytes5295; SHA256 `1b8960f3536106e928b3eafd96836850cf5cdbfc1b08ff4a30254e4c41fe6fa1`. `license-sources.json` now records exact package versions, archive URLs/integrities and source-notice hashes. The candidate generator maps the new notice and the bundle to these combined license materials. Include the new notice in the approval registry and exported artifact; do not omit it as a non-runtime file. Original main SentencePiece Apache-2.0 license remains included.

## Other source/license checks

- ORT MIT LICENSE and full ThirdPartyNotices are present and pinned. Hike runtime MIT copyright/permission notice is present; compiler/source/build hashes and the explicit sqrt host primitive are recorded.
- The shipped preparation reference `tools/inference/text-encoder/pinned-t5.py` is byte-identical to the pinned original ComfyUI source SHA256 `797f11b69256dffa8d9a6d236fe1e05d0c250c84d231a5993accde0ff44238bc`. Full GPL-3.0 text is adjacent in `COMFYUI-LICENSE`, source-provenance pins source URLs/commit/hashes, and README identifies the GPL source. It is committed as source, not minified into the Pages runtime. No missing GPL source/license material was found in that distributed reference. The unrelated project-authored browser code is not blanket relicensed by this review.
- Wan preparation reference `tools/inference/vae/vendor/vae.py` is byte-identical to pinned upstream source, retains its original Alibaba Wan copyright and has the adjacent full Apache-2.0 license/source receipt.
- Repository-owned code has no root LICENSE declaration; publishing the user's own source does not require inventing one. This review adds no new blanket license grant. Included third-party notices must remain with redistributed artifacts.

## Remaining operational gates

Regenerate candidate byte/hash records after the exact final changes, extend only the intended registry paths, run the publication exporter and applicable tests, then deploy and read back the actual Pages URLs. Keep the pre-existing relocation-test failure distinct: the current FT loader already equals baseline HEAD and its historical byte-preservation record predates later loader hardening. Do not weaken that unrelated test or mutate its records to force this deployment green. Record any remaining test failure and actual public runtime verification scope.

Coordinator final packaging: the combined notice line endings were normalized from CRLF to LF without changing copyright or license text. Original upstream notice hashes remain in provenance; final combined bytes/hash are in license-sources.json and the regenerated publication snapshot.
