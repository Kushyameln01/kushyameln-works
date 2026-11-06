# E1 Hike kernel fix review

PASS — independent, read-only review of commit `4d5fd7363f40f0d743ead448193ef2bf1915bbdc`, performed 2026-10-31 UTC. No repository edits, rebuilds, gate changes, or numerical fallback were made during this review.

Reviewed kernel: `docs/shared/inference/lora/kernel/lora.wasm`, 5,051 bytes; SHA-256 `3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24` (independently computed, matches registry/build record).

## Cause and source/WAT review

The previous compiler output allocated decoder temporaries on every element, growing the stack from byte 65,536 into the host arena at byte 1,048,576. For the actual HIGH Q down factor, the old kernel produced 655,360 mismatches and 574,569 erroneous zeros. Relocating only its exported stack pointer to 8 MiB eliminated all mismatches, establishing memory overlap as the cause.

The fix declares reusable merge indices/sum before the loops (`tools/lora/kernel/lora.hike:8`) and all decoder temporaries before the element loop (`:34`). Initializations still occur where needed; the arithmetic, factor order, ABI, and host implementation are unchanged. The build-record diff retains the compiler SHA-256, Hike revision, backend, and tool versions.

Disassembly using the pinned WABT `wasm2wat --generate-names` confirms stack increments are confined to function setup. There are no repeated stack increments in the merge or decoder loop bodies. Fixed frame sizes are 50 bytes for `LoraMerge` and 54 bytes for `LoraDecode`.

Runtime confirmation: each call used the original stack pointer 65,536, filled the reserved stack area through byte 1,048,575 with a sentinel, and scanned it afterward. The pointer was restored to 65,536 in every case.

| Function | Work size | Stack bytes touched | Incorrect outputs |
| --- | ---: | ---: | ---: |
| Decode BF16 | 1 element | 54 | 0 |
| Decode BF16 | 655,360 elements | 54 | 0 |
| Merge, rank 1 | 2 × 2 outputs | 50 | 0 |
| Merge, rank 1 | 1,024 × 1,024 outputs | 50 | 0 |

Both decoder cases also left every input integer unchanged. The large decoder case used BF16 1.0 throughout; both merge cases used down=0.25, up=0.5, base=0, scale=1 and produced exactly 0.125 throughout. These checks directly confirm constant stack usage at sizes that previously crossed the arena boundary.

## Actual HIGH Q down factor

Decoded the existing isolated `e1-debug/down.bf16` through the public `createKernel().decode(..., 'BF16')` API and compared all elements with the independent NumPy result `e1-debug/down.reference.f32`.

- Elements: 655,360 (`128 × 5,120`).
- Mismatches: **0**; maximum absolute error: **0**.
- Decoded output and reference SHA-256 both: `4c0ef919aa1116cb93fb06423b3060d35677a8951ede088c2bdde2e2d9ef85de`.

The isolated factor now decodes bit-exactly, and the disassembled and observed stack behavior resolves the diagnosed overlap. This report does not claim completion of the separate browser joint trial or repeat its full test suite.
