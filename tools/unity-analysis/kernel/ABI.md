# Unity analysis kernel ABI v1 — minimum prototype

This contract and `../test-kernel.mjs` are authored before the kernel implementation.
Tests are deliberately NOT RUN until the exact candidate is published to GitHub
Pages and obtained in the approved cloud verification environment.

Hike fdad7bb / LLVM / wasm32, scalar; i32 pointers and signed i32 values. No slice
header, allocator, free, host imports, shared Memory or runtime memory growth.
Each vector and node count is bounded to 262144 (a prototype resource bound,
not a universal Unity-project limit). Memory is capped at 16 MiB.

| Export | Parameters, all i32 | Result |
| --- | --- | --- |
| UaIncoming | targets pointer, edgeCount, nodeCount, out pointer, outCapacity | 0 success; out[node] is its incoming edge count |
| UaTypeCheck | actual pointer, allowedMasks pointer, count, out pointer, outCapacity | 0 success; out[i] is 0 unknown, 1 compatible, 2 incompatible |
| UaDiff | before pointer, after pointer, count, out pointer, outCapacity | 0 success; out[i] is 0 equal, 1 changed |

Errors: -1 invalid count/capacity; -2 invalid target/type/mask/equivalence ID.
All input values are checked before any output write. Count=0 is valid; no input
is dereferenced. UaIncoming allows nodeCount=0 only with no edges. Output
capacity must fit the required count and must not exceed the vector limit.

UaTypeCheck tags: 0 unknown, 1 Float, 2 Int, 3 Bool, 4 Trigger. allowedMasks is
0..31 and uses bit `(1 << tag)`. actual=0 or mask=0 gives unknown; otherwise the
actual tag bit determines compatibility. Bit 0 never turns an unknown actual
type into a known result. This numeric kernel does not decide which Unity or
VRChat conversion rules apply: callers provide the applicable allowed mask.

UaDiff compares interned equivalence IDs in 0..2147483647. The host retains the
original string values, source positions, GUID/fileID and snapshot identities;
this ABI does not reinterpret those identifiers as numbers.

The host adapter owns a non-overlapping arena starting at the initial Memory
byte length (beyond the compiler stack). It validates counts, arithmetic,
alignment, capacity and Memory aliasing, grows once before creating views,
copies input, calls the selected export and returns a copied Int32Array. It
clears the entire reserved arena in finally. No caller obtains an arena view.
dispose releases references; memory is not shrunk and OS/GC release is not
promised. Synchronous cancellation is by the enclosing Worker termination.

## Independent expected vectors

- incoming: targets [1,1,3,0,3], nodeCount 5 -> [1,2,0,2,0].
- types: actual [0,1,2,3,4,1,2], masks [2,2,4,10,16,0,2] -> [0,1,1,1,1,0,2].
- diff: before [0,1,2,2147483647], after [0,3,2,2147483646] -> [0,1,0,1].
- Empty vectors succeed; targets outside [0,nodeCount) fail before any write.
- Boundary vectors have 262144 elements; 262145 is rejected by the adapter.
- Returned results and input bytes survive later calls and disposal unchanged.
- A second instance owns different Memory. Growth occurs before creating views.

## Build-only checks

Build from the pinned source archive and recorded runtime i64-to-i32 map hash
correction, without editing emitted LLVM. Explicit exports only. Inspect WAT
for three `(i32,i32,i32,i32,i32)->i32` signatures, Memory initial 16/max 256 pages,
and no imports. Compilation and WAT inspection are not execution evidence.

The first build retained about 503 kB of Zig debug custom sections when LLVM
lowered zeroing to an internal memset. `--strip-debug` removes only debug data
from deployment; Hike source/LLVM/WAT and the initial build record are retained.

The first stripped build passed compilation but its WAT inspection expected
debug symbol names. Zig also stripped the name section. The checker was corrected
to resolve each export's final function index and inspect that function's exact
signature. This was a static-check failure; no kernel or test was executed.
