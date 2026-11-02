# Hike lookup decoder

`createModelWeightSource({file, side, decoder: 'lookup'})` selects this implementation. The default remains `decoder: 'legacy'`. `lookupBytes` can provide the pinned lookup WASM directly; browsers otherwise fetch it beside this source.

The numeric profile remains `legacy-hike-f16-e4m3fn-f32-v1`; the implementation profile is `hike-lookup-table-decoder-v1`. The original Hike bridge is the sole numeric oracle: one call decodes all 63,488 finite F16 codes, and one call per registered FP8 target decodes the 254 legal codes using that target's original F32 scale. JavaScript enumerates integer codes and copies the resulting F32 bits. It contains no alternate floating point decoder or scale multiplication.

The new Hike `Lookup8` and `Lookup16` exports validate every selected code before writing output, then copy its oracle-produced F32 table value. Invalid FP8 codes `0x7f`/`0xff` and F16 exponent 31 are rejected. Tables are private runtime data and are never written to repository artifacts.

Both exports accept `(codes, count, table, out, capacity) -> status`, with `count` and `capacity` in `1..81920`. F16 input uses explicit little-endian bytes. The host uses a fixed 754,688-byte arena: 163,840 input bytes, 262,144 F16 table bytes, 1,024 selected FP8 table bytes, and 327,680 output bytes. Per-target FP8 tables retain 1,024 host bytes each. Returned outputs are independent, compact, nonshared F32 buffers; input and output scratch ranges are cleared after each call. Disposal clears tables and releases instance references.

Build offline with the pinned Hike compiler:

```sh
DIFFUSION_TOOLCHAIN=/path/to/pinned/toolchain python docs/shared/diffusion-models/execution/model-decode/build.py
node docs/shared/diffusion-models/execution/test-model-decode.mjs
node docs/shared/diffusion-models/execution/test-model-weights.mjs
```

The tests compare every legal F16 code and every legal FP8 code at representative scales bitwise against the original Hike bridge, reject every invalid F16 code, inspect preflight-before-output behavior, and check fixed workspace, ownership, bounds, integrity and disposal. The retained-file browser diagnostic separately compares selected real HIGH/LOW ranges. These diagnostics do not add payload sample admission, full-file hashing or LoRA arithmetic.
