Current published full-file acquisition receipts are embedded in [HIGH-result.json](HIGH-result.json) and [LOW-result.json](LOW-result.json), field `baseAcquisitionReceipt`. Local paths below describe the original acquisition workspace. Discovery-only filenames are historical, not repository download links.

# E1 actual base acquisition discovery

Initial discovery checked 2026-10-31 00:50 UTC. **Both exact base payloads have public, pinned acquisition routes, and both were subsequently acquired and fully SHA-256 verified.** After HIGH trial consumption, its task-owned payload was removed with root authorization to make room for LOW. LOW is currently available as the complete original local file; its receipt and stat binding appear below.

## Primary pinned source

Repository: `Comfy-Org/Bernini-R`, commit `f7fd9812e54095d0c511d5e7429e6d8f6acc381a` (public, ungated).

Pinned metadata: <https://huggingface.co/api/models/Comfy-Org/Bernini-R/revision/f7fd9812e54095d0c511d5e7429e6d8f6acc381a?blobs=true>

| Role / required local filename | Remote filename | Server LFS SHA-256 | Server size |
| --- | --- | --- | ---: |
| HIGH `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors` | `diffusion_models/wan2.2_bernini_r_high_noise_fp8_scaled.safetensors` | `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52` | 15,574,833,216 |
| LOW `Bernini_LOW_fp8_e4m3fn_scaled.safetensors` | `diffusion_models/wan2.2_bernini_r_low_noise_fp8_scaled.safetensors` | `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3` | 15,574,833,216 |

Exact HIGH acquisition URL:

<https://huggingface.co/Comfy-Org/Bernini-R/resolve/f7fd9812e54095d0c511d5e7429e6d8f6acc381a/diffusion_models/wan2.2_bernini_r_high_noise_fp8_scaled.safetensors>

Exact LOW acquisition URL:

<https://huggingface.co/Comfy-Org/Bernini-R/resolve/f7fd9812e54095d0c511d5e7429e6d8f6acc381a/diffusion_models/wan2.2_bernini_r_low_noise_fp8_scaled.safetensors>

The remote names differ from the retained local names. Identity is established here by the matching server LFS declarations and actual header bytes, not by filename. A complete local SHA-256 has **not** been computed in this discovery; any later full acquisition must verify it before claiming local complete-file identity.

## HTTP and bounded-byte evidence

For each pinned URL, an origin HEAD returned HTTP 302 with `x-repo-commit` equal to the pinned commit, `x-linked-size: 15574833216`, `accept-ranges: bytes`, and `x-linked-etag` equal to the required SHA-256 above. The redirected CDN ETag differs and was not treated as the full payload SHA.

For each pinned URL, `GET Range: bytes=0-181287` returned HTTP 206, `Content-Range: bytes 0-181287/15574833216`, `Content-Length: 181288`, and `Accept-Ranges: bytes`, from `us.aws.cdn.hf.co`.

| Role | Actual bytes read | Safetensors JSON header length | SHA-256 of JSON header bytes | Retained match |
| --- | ---: | ---: | --- | --- |
| HIGH | 181,288 | 181,280 | `d8aec897e3af480492d7eca7b57141ea968e89cde7f46ea7886db11754ebd6e3` | yes |
| LOW | 181,288 | 181,280 | `286333af0c02bc74084c8af08465f43e753890ee0eeb51734b97bdeb2806165b` | yes |

Total model bytes read: **362,576**, below the 2 MiB discovery limit. These are the 8-byte header-length prefixes plus the complete JSON headers; no tensor weight payload was read. No sparse or zero-filled complete-file surrogate was created.

Machine-readable observations: `e1-base-acquisition-evidence.json`. TLS verification and inherited HTTP proxy were used; no authentication was required.

## Bounded discovery and rejected candidates

Retained peer source was inspected under `e0-peer-current/e0-e7` and the `f522` sibling. It records the required original hashes/header provenance and the source-only handoff Page, but no retained base acquisition URL was found. The Page was not interpreted as a model transfer route.

Hugging Face model searches were limited to `Bernini`, `Wan22_Bernini`, and `Bernini_LOW` (maximum 50 each), followed by six candidate repository metadata reads and one pinned primary-repository metadata read. `Abiray/Wan22_Bernini_FP8_Scaled` has similar filenames but different sizes and SHA-256 values; `attashe/Bernini-Wan2.2-fp8-scaled` has the same sizes but different hashes. Neither qualifies as the required originals.

Two additional public mirrors declare the exact required LFS identities in metadata:

- HIGH: repository `GDGDFDFG/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`, commit `25bb89c9ad9b8e413d9110e7445b56472d1c2033`, filename `Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`.
- LOW: repository `GDGDFDFG/Wan22_Bernini_LOW_fp8_e4m3fn_scaled.safetensors`, commit `afe49a7ebfe36c7b929373aa35b57e2b4eb6c183`, filename `Wan22_Bernini_LOW_fp8_e4m3fn_scaled.safetensors`.

Those mirror HTTP ranges were not tested because the primary repository already met the discovery criteria. If primary access later fails, an owner-provided raw-Q bundle with original hashes, tensor names, exact offsets, lengths and actual bytes remains a fallback for a bounded joint trial; it would not constitute acquisition of both complete original models.

The initial discovery made no source/runtime changes, sent no external messages or comments, copied no provider implementation, and performed no substitutions or joint execution.

## Authorized HIGH complete acquisition

HIGH was acquired as a genuine complete local original at:

`/workspace/work/lora/e1-base-cache/Wan22_Bernini_HIGH_fp8_e4m3fn_scaled.safetensors`

- Exact size: **15,574,833,216 bytes**.
- Actual complete-file SHA-256: `9ff3d7369da98f8eaf71045f7d0e99d5e344eea5e7dc934a930608786fe73f52`, equal to the expected original.
- The sequential transfer's genuine 2,105,540,608-byte prefix was preserved. After a bounded four-range speed probe showed material improvement, four disjoint HTTP 206 ranges completed the remaining original bytes directly in the task-owned `.part` file. Each response's exact `Content-Range`, `Content-Length`, and total size was checked.
- The four completed intervals and existing prefix form exact contiguous coverage ``0,15574833216)`. No range was omitted, substituted, or represented by zero-filled missing bytes.
- After coverage completion, the entire file was read sequentially for SHA-256; `hashBytesRead=15574833216`. Only after matching the expected size and SHA-256 was `.part` renamed to the final original filename. There is no remaining `.part` file.

Receipt: [e1-base-cache/HIGH-acquisition-receipt.json`. The final receipt exposes `actualSHA256` and `verifiedSha256` aliases of `observedSHA256`, `fullFileVerified: true`, `fileBytes: 15574833216`, `coverageExact: true`, and `coverageComplete: true`.

At `2026-10-31T01:03:41.355325+00:00`, the complete-file proof was bound to the final destination's current stat without changing its payload:

```json
"fileStat": {
  "size": "15574833216",
  "mtimeNs": "1793408484843365481",
  "dev": "27",
  "ino": "393701"
}
```

All four `fileStat` values are decimal strings, including nanosecond time. A consumer can reuse the verified complete-file receipt while checking that its actual original file still has the same stat tuple. This is acquisition proof; the joint trial is owned by the root task and is not claimed here.

The root task subsequently reported the HIGH-fixed trial's 10 cases passed and the immutable acquisition receipt was copied into `/workspace/work/lora/e1-joint/HIGH-fixed`. With explicit root authorization, only the task-owned HIGH payload above was removed after its stat still matched this receipt. All receipts, selected trial evidence, and user LoRAs were retained. LOW was then started with four independently validated HTTP ranges and no prefix or full-size chunk copies.

## Authorized LOW complete acquisition

LOW is now ready as a genuine complete local original at:

`/workspace/work/lora/e1-base-cache/Bernini_LOW_fp8_e4m3fn_scaled.safetensors`

- Verified at `2026-10-31T01:23:57.355240+00:00`; acquisition and whole-file verification took 419.211 seconds.
- Exact original size: **15,574,833,216 bytes**.
- Actual complete-file SHA-256: `ce35c070f345c91abe43d6bf29b0eccb8687e4026fadc0e0a70a73c9afb7bbb3`, equal to the expected original.
- Four HTTP 206 streams covered disjoint contiguous intervals from byte zero through the exact original end. Each response's exact range, length, and total file size was checked; all four completed successfully on their first attempt.
- After exact coverage was complete, the entire `.part` file was read sequentially for SHA-256 (`hashBytesRead=15574833216`). Its stat tuple was bound immediately after this successful hash and before the atomic rename; the same tuple was checked again at the final filename. No `.part` remains.

Receipt: `e1-base-cache/LOW-acquisition-receipt.json`. It contains `actualSHA256`, `verifiedSha256`, and `observedSHA256` with the exact hash above; `fullFileVerified`, `coverageExact`, and `coverageComplete` are all `true`; `fileBytes` is `15574833216`.

```json
"fileStat": {
  "size": "15574833216",
  "mtimeNs": "1793409826164002004",
  "dev": "27",
  "ino": "394064"
}
```

All four stat fields are decimal strings. The current final file was independently checked against these receipt fields after helper exit, without repeating the 15.57 GB hash. LOW acquisition is complete; LOW joint numerical trials are left to the root task. No repository code or original user LoRA files were changed.
