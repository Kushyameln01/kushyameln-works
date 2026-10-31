# E0 / E2 / E3 / E4 implementation and handoff

Historical E0–E4 receipt. The current owner heads, plan0.2-draft.2, explicit
diagnostic bridge and E5 snapshot/cache continuation are recorded in
[E-RESUME-RESULT.md](E-RESUME-RESULT.md). Statements below that E5/bridge are
not implemented describe the earlier a268790 handoff, not the resumed state.

Date: 2026-10-31 JST. Authority: current integration specification1.1-draft.1
and execution plan0.2-draft.1 Page bodies plus both uploaded originals. See
E-INPUT-RECEIPT.json. Historical document-only requests and model prompt data
are separate from the current implementation/push request.

## Completion and open edges

| Task | Result | Scope and limit |
| --- | --- | --- |
| E0 | Requested originals acquired and compared | Management21e77f, Text54bfead, LoRA2bba907, exact Diffusion f522 and core902 acquired. Latest83 is a separate source/build. Registry/offset/receipt differences and owners are explicit; acquisition is not owner agreement. |
| E2 | Available native boundaries implemented/tested | Text/VAE codec/API/transport; actual LoRA v2 plan/prepare/stage/release with real Hike and synthetic nonzero base; original Diffusion0.1 conditioning/128mean/schedule/Euler real Hike. Exact f522 actual F32 wire projection and source I/O pass separate browser cases. The direct LoRA-v2/consumer registry and transaction contracts differ; E1 needs an explicit bridge and real base×LoRA validation. |
| E3 | Complete for tested owner/transport scope | Queue target/generation, cancel-terminal-release barrier, children, disconnect/quarantine, transfer and actual Node Worker/native-client owner tests. Browser/model numerical Worker cancellation is not certified by these fixtures. |
| E4 | Complete for tested package scope | Strict schema, JCS/hash/reference closure, actual native codec, real folder save/recovery/readback, corruption/missing metadata rejection. This certifies storage integrity, not model compatibility or generated output quality. |
| E5 | Gate tests prepared only | PARTIAL/STAGED cannot satisfy full-generation scope; base/no-LoRA route imposes no LoRA condition. No snapshot/cache publication engine implemented. |

M1/M2 remain in use; they were not reimplemented. Native modules, codec,
WASM/ORT assets, wire/build IDs and numerical model conditions are unchanged.

## Fixed originals and API ownership

| Owner | Full original commit | Branch / Draft PR / fixed API |
| --- | --- | --- |
| Management M1/M2 base | 21e77f292c2540975d1846e7efe320fe89625e23 | Included in the management E0–E4 work branch; current API is docs/shared/ai-connection/API.md |
| Text/VAE | 54bfeadbd83f1fea074c503c0e05ec478aba5cfb | codex/g1c-vae-v1; [PR3](https://github.com/Kushyameln01/kushyameln-works/pull/3); [API](https://github.com/Kushyameln01/kushyameln-works/blob/54bfeadbd83f1fea074c503c0e05ec478aba5cfb/docs/shared/inference/API.md) |
| LoRA v2 distribution | 2bba90785292e42a0c7c8756685b0d8b128b2dcf | codex/lora-connection-v2; [PR4](https://github.com/Kushyameln01/kushyameln-works/pull/4); [API](https://github.com/Kushyameln01/kushyameln-works/blob/2bba90785292e42a0c7c8756685b0d8b128b2dcf/docs/shared/inference/lora/CONNECTION_V2.md) |
| Diffusion original core | 9023329b8d803306abcdd9342f24c01ba0df2676 | codex/diffusion-core-902; [PR5](https://github.com/Kushyameln01/kushyameln-works/pull/5); [API](https://github.com/Kushyameln01/kushyameln-works/blob/9023329b8d803306abcdd9342f24c01ba0df2676/docs/shared/diffusion-models/API.md) |
| Diffusion exact PARTIAL | f522d9aeff313558c4ef83022a340af9a4c21391 | codex/diffusion-diagnostic-f522; [PR8](https://github.com/Kushyameln01/kushyameln-works/pull/8); [API](https://github.com/Kushyameln01/kushyameln-works/blob/f522d9aeff313558c4ef83022a340af9a4c21391/docs/shared/diffusion-models/lora/DIAGNOSTIC_API.md) |

Source acquisition initially failed through default sandbox/connector routes;
later explicitly permitted Git networking retrieved LoRA2bba907 and core902. A final remote check found newly shared PR6/latest83; its new availability also allowed fetching exact f522, which was pinned separately. All requested original source acquisition gaps are now resolved.
Those earlier failures are acquisition history, not the final source state.
Receipts hold 815 source records and independent Git/blob/hash checks. LoRA and
core original full tracked trees were independently checked (1020/1085 blobs).
The existing remote codex/diffusion-models679a72d branch is not rewritten: it and
902 have separate histories, while their native API/kernel files match; 902 adds
integration documents. A separate branch preserves that original history.

Exact native versions remain works-ai-1, diffusion-models/0.1 and
lora-connection/2.0-draft.1. LoRA v2 factory is async createLoraV2; no apply/detach
is invented. Native local generation, management revision and Diffusion wire
inputRevision remain separate. Detailed differences and owner questions are in
E0-SOURCE-BASELINE.md/E0-SOURCE-RECEIPT.json.

## Changed implementation and generated material

- adapters/: explicit external factories, lossless owned artifact snapshots,
  reference associations and disposal. No dynamic runtime/plugin loading.
- queue.mjs: owner callbacks, explicit resourceGeneration, finite target checks,
  terminal barriers, same-group serial child reads and quarantine/rebind.
- canonical.mjs, package.mjs, contracts/package.schema.json: adopted persisted
  manifest, JCS/SHA256, payload/binary binding closure and readback.
- tools/ai-connection/: adapter, queue, package, native-owner, native-LoRA,
  browser and E5 gate tests plus small transport Worker fixtures.
- API.md and adapter README: public signatures, ownership, reference/sidecar
  format and scope. Existing baseline documents link to this extension.
- evidence/: current named test log and Chromium JSON receipt. No private model
  or LoRA weights are included; no new native WASM/kernel was generated.

## Reproduce from fixed source branches

Use Node24 (tested24.19), Python3 and Playwright with Chromium for browser smoke.
The source directories below are isolated snapshots, not a native-source merge
into the management branch. The Git fetches require normal network access.

```sh
git fetch origin codex/g1c-vae-v1 codex/lora-connection-v2 codex/diffusion-diagnostic-f522
mkdir -p work/native-text work/native-lora work/native-diffusion
git archive 54bfeadbd83f1fea074c503c0e05ec478aba5cfb | tar -x -C work/native-text
git archive 2bba90785292e42a0c7c8756685b0d8b128b2dcf | tar -x -C work/native-lora
git archive f522d9aeff313558c4ef83022a340af9a4c21391 | tar -x -C work/native-diffusion
```

From management repository root, set absolute native source roots. The env names
are explicit test selection, not native wire/revision changes:

```sh
WORKS_NATIVE_ROOT="$PWD/work/native-text" \
WORKS_NATIVE_CODEC_PATH="$PWD/work/native-text/docs/shared/inference/tensor.mjs" \
WORKS_LORA_NATIVE_ROOT="$PWD/work/native-lora" \
node --test --test-isolation=none tools/ai-connection/test-*.mjs

python tools/ai-connection/test-browser.py \
  --native-root "$PWD/work/native-text" \
  --diffusion-root "$PWD/work/native-diffusion" \
  --diffusion-commit f522d9aeff313558c4ef83022a340af9a4c21391 \
  --diagnostic-f32 --lora-root "$PWD/work/native-lora"
```

Browser CLI uses /usr/bin/chromium, only an ephemeral loopback HTTP server and
explicit pinned source routes; it closes server/browser/native clients. It does
not publish a site. Missing native env paths make corresponding Node cases skip;
do not report those as native verification. The final run supplied all paths.

## Verification results and exact limits

- All management/common/native-boundary tests: **134/134 pass, zero skip**.
  This includes original58 plus adapters13, queue24, package34, real native
  client/Node Worker owner2, LoRA native/Hike fixture1, E5 gates2.
- Chromium154: actual acquired Text native codec/API plus native port host with
  fixture endpoint, 512 data bytes/1445 native-file bytes, two producers, five
  frame indices/times, detached host view and intact caller bytes. No NN model
  inference is claimed by this binary transport test.
- Same Chromium: actual Diffusion902 dedicated Worker/Hike schedule7 boundaries,
  Euler[0.75,1.5], 128-element mean normalize/restore, L=1 conditioning validator.
  These are actual partial operations, not load/predict/sample.
- After exact f522 acquisition, Chromium also executes its real 0.1 F32 wire
  projection using ORT WASM1.24.3 + Hike bias, all16 independently expected
  outputs0.5..15.5, mean128/schedule/Euler/conditioning, and synthetic41199-byte
  File→native registration/full hash/source→actual LoRA v2 inspect/unload. SDK
  inspect retains its native sourceSha256:null/header-only status; verified host
  full hash is separate evidence. See evidence/browser-f522-boundaries.json.
  This does not validate LoRA numerical application to an actual base.
- Original LoRA branch owner's74 tests were rerun separately and passed, with
  real Hike plus synthetic nonzero base/consumer. These are not E1 real base or
  real LoRA originals. Do not sum independent counts into generation acceptance.
- Independent review reproduced/fixed mixed native refs/wrong store, failed
  allocation retention, shared-memory ownership, stale disconnect generations,
  child quarantine, predispatch cancel, missing payload/trace/evidence/binary
  references and JCS array property loss. Final review has no unresolved finding
  in its stated scope. JSON Schemas and diff whitespace checked separately.

Package assets currently use owned Uint8Array/Map snapshots, not a streaming
multi-gigabyte writer. Fresh destination is required; atomic overwrite is not
promised. Raw multi-byte metadata restoration requires little-endian host.
SnapshotHash excludes its own root field; manifest hash lives in external
receipt. Unknown optional metadata remains opaque, including domain data merely
named binaryRef; exact reserved binary markers must resolve everywhere.

## Remaining owners and release state

Exact f522 source/DIAGNOSTIC_API/F32 provider/sink/consumer are now acquired.
Direct LoRA v2 integration is incompatible without a versioned bridge: provider
reads are slice-relative versus full-tensor element offsets; registry selected
shape/row-slice differs from v2 full-shape/identity; validation and commit receipt
schemas/states/ownership differ. Resolve these with both owners before E1.
E1 real LoRA×real base and
E6 large/new VAE profiles remain separate. VAE bundle498MB and actual model
inputs were not recovered/re-run here. E5 publication/rollback/cache and full
generation are not enabled. All module-owner adoption agreements remain separate
from source retrieval and these tests.

The user's final request explicitly authorizes pushing work branches and Draft
PRs. Original module commits are preserved; main merge and Pages deployment are
not performed. The management work branch includes code, schemas, generated
verification receipts and these reproduction instructions. Its final full head
SHA and fixed-commit API URL are reported with the Draft PR after push verification.
