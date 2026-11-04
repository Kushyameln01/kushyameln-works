# Exact Hike RoPE geometry cache

The optional owner-local cache in `docs/shared/diffusion-models/execution/model-math.mjs` retains only successful output matrices from the pinned Hike `RopeBuild` export. A hit copies that matrix back into the existing WASM matrix slot, then executes the unchanged Hike `RopeApply` on the current input. The kernel bytes, imports, ABI, axis widths 44/42/42, source-ID rotation, R128 tiling, F32 intermediates, and multiplication/addition order remain unchanged.

One math owner is already shared by the HIGH and LOW sampler candidates. Cache lifetime therefore covers both sides without introducing a sampler request field. Geometry reuse does not depend on x, Q/K output, timestep, model weights, or a payload hash. LoRA or a different input cannot make an earlier x/result eligible for reuse: neither is retained.

Keys contain schema/profile 1, exact row count, every raw F32 coordinate word, and every raw I32 source-ID word. The exact pinned kernel SHA256 and axis/source profile are invariant within the owner and reported in `stats().ropeCache.profile`. A 32-bit hash only selects a bucket; every retained word must match. Signed zero remains distinct on every axis. Finite/compact/nonshared/type/row/source-ID validation still runs on every call, including hits. `RopeApply` still performs native finite matrix/input/output admission. Positions and IDs are still staged into their ordinary slots on hits.

The defaults are 96 MiB of retained matrix plus key backing-store bytes and 1024 entries. Both bounds are enforced with LRU eviction before retaining a new entry. A key uses 8 header bytes plus 16 bytes per row; a matrix uses 1024 bytes per row. A 73,947-row population tiled at 128 rows needs 578 entries, 75,721,728 matrix bytes and 1,187,776 key bytes: 76,909,504 explicit bytes total, below the 100,663,296-byte default. This is arithmetic for one complete unique geometry population, not a measured full-model memory result. The cache never allocates a population-sized x or result.

`createModelMath({wasmBytes, ropeCache:false})` selects the prior build-every-call path for comparisons. An optional `ropeCache:{maxBytes,maxEntries}` can lower either cap; zero disables retention. Upper caps cannot be increased through this configuration. Ordinary `rope` inputs remain unchanged. `clearRopeCache()` and disposal drop all retained references; clear follows the owner's busy/disposed rules.

`stats().ropeCache` reports builds, build output span, hits/misses, retained matrix/key bytes, peak explicit bytes, evictions, key copies, matrix retention copies, and hit staging copies/bytes. Existing input/output-copy counters include matrix WASM staging/retention traffic. `physicalMemoryBytes:null` is intentional: Map/object overhead, garbage-collector timing, and actual process physical memory are unknown. Eviction or clear does not assert immediate physical memory return. This is not zero-copy and does not establish a new production support domain.

Validation uses only the pinned small math WASM, without loading models, weights, or ORT:

```sh
node docs/shared/diffusion-models/execution/test-model-rope-cache.mjs
node docs/shared/diffusion-models/execution/test-model-math.mjs
```

The six cache tests cover cached/uncached all-output-bit equality for 128/127/1 rows and changing x, signed zero on every axis, adjacent source-ID upper-bound values, exact-key hash collisions, owner isolation, invalid inputs and native arithmetic overflow on a hit, LRU byte/entry limits, clear/disposal, and resource/busy admission. The comparison fixture builds 3 matrices and stages 3 hits, versus 6 builds with caching disabled; transcendental call counts are exactly halved, and both WASM owners remain 9,175,040 bytes. The original nine math tests retain independent F64 RoPE and normalization gates plus legacy exact F32 comparisons. The full 128-row independent RoPE check reports maximum absolute error 4.175179291188158e-7 under the unchanged 2e-5 absolute plus 2e-5 relative gate. These results do not replace the original full 40-block/six-step model acceptance trial.
