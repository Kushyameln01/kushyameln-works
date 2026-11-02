# Declared full-target HIGH block0 probe: partial, not accepted

Execution source: `0f761f374dce1d447bbb912ad13c08f9bf85c279`.
The target remains `[1,16,21,60,104]` (832x480,81frames). This explicitly declared
case also has source81frames and three848x848 wired references, no reference
video: 32,760target +32,760source +3x2,809reference =73,947tokens. These dimensions
are test conditions, not measurements of missing original media. Real Text L512
is retained in full. Precision baseline is retained scaledFP8/F16 decoded by the
fixed loader to stagedF32, with an independent reference; original mxfp8 precision
is unconfirmed.

The operational1800s watchdog stopped the run during block0 self-attention.
`passed=false`. No kernel error, numerical mismatch or OOM was observed. The
current runtime completed patching, allK/V rows and their91-row tail. Q rows0..5247
were independently compared; attention, O projection and self-residual rows0..5119
were independently compared. Each accepted query used every73,947key and all40
heads. The accepted query prefix is still within the target stream; source and
reference *queries*, the final91-query tail, cross-attention, FFN and complete
block0 were not reached. Do not promote this to complete1block, predict or sample.

Across2,485chunks /1,622,609,920compared F32 values, failures=0 under the frozen
`abs0.01 + rel0.001*abs(reference)` gate. Maximum absolute error was
`0.000217437744140625`; maximum normalized-to-gate error was
`0.01576734089608632`. The complete metadata receipt preserves every per-stage
coverage/error statistic and failure event. No intermediate numeric arrays are
published.

The native candidate elapsed1,803.458s including diagnostic waits. Reference
comparison compute was622.532s; Worker callback/transport wait was839.625s.
Native operator timers are inclusive: attention474.380s, linear169.129s,
math190.535s, layout copy102.430s, weight read/decode8.899s. Nested totals cannot
be added as an exclusive elapsed total. These partial measurements provide no
measured full40/six-update duration and no execution-impossibility conclusion.

The outer process observation began before command exec and ran through cleanup:
sampled RSS sum peak11,457,220,608B, PSS sum peak11,180,201,984B. This includes the
simultaneous independent oracle and driver. At the PSS peak, the renderer group
was6,320,688,128B and Python-spawn/oracle group3,762,124,800B; role names are
heuristic and native Worker memory cannot be isolated from its renderer here.
Four native hidden stores have6,057,738,240B of logical span; stage-weight peak
was209,715,200B. ReferenceX/K/V add up to4,543,303,680B of separate logical tmpfs
backing. Observed WASM Memory high-water capacities summed178,520,064B including
ORT165,937,152B. Capacity is not allocator usage or the complete physical peak.

Cumulative native ORT-operator JS snapshot-copy bytes were127,572,889,344B, including repeated
K/V tile snapshots124,183,633,920B. These are traffic, not simultaneous live bytes.
Actual ORT internal/WASM staging uploads and allocator suballocations remain
unobserved. The summary preserves CPU-span counters, all session/timing stats,
source-read/cache counters and unknown coverage.

Shared cgroup current approached its16GiB limit; `memory.events.max` increased
57,354, while `oom` and `oom_kill` stayed0. This demonstrates shared limit pressure,
not native-only memory attribution or a proven failure cause. Shared file already
includes shmem; historical `memory.peak` and shared `/tmp` use are recorded
separately. Baseline/peak/final anon/file/shmem and event values are preserved.

Native cancellation returned AbortError, cleanupError=null and no native cleanup
errors; owned hidden/stage-weight-cache/tensor/query counts returned to0. The oracle was forcibly
terminated, all3backing files were removed and no live child remained. An EOFError
from an in-flight comparison is retained as a cancellation/IPC cleanup failure
event, not a numeric mismatch. Graceful oracle final stats were unavailable.
Final known Chromium records were3zeroRSS zombies; PSS was inaccessible for them.
Weakly observed WASM Memory objects could remain reachable after dispose; Worker
termination/browser close and process observations are separate evidence.

The result receipt and driver log are byte-identical metadata copies. The resource
summary keeps original all-sample peaks, gate/baseline, final/postcleanup rows,
nearest30s samples and peak windows, and identifies the untouched17,724,731B raw
resource receipt by SHA-256. `full-probe-summary.json` provides scope-safe extracted
facts. Bundle `../manifest.json` inventories published files and original hashes.
No new inference or tensor export was performed to package these results.
