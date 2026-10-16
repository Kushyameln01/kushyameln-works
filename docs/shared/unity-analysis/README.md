# Unity data analysis (0.1.0 minimum gate)

Shared read-only SDK; initial structured snapshot schema `unity-analysis-snapshot/1`.
The bundled example.json contains before/after snapshots with string fileIDs, objects,
raw properties, references, parameter declarations and explicit type-use constraints.
Caller-provided structured semantics are labelled as such, not independently proven.

`createUnityAnalyzer({pool?,concurrency:2})` returns analyze(snapshot,options), compare(before,after,options), cancel(sessionId), getReport(sessionId), dispose(sessionId?).
The returned Promise has sessionId. Options inputRevision, timeoutMs (1..30000), sessionTimeoutMs (1..300000).
Only owned job IDs are cancelled; injected pool is never disposed. Default-owned pool is released on dispose().

Prototype bounds: 4096 files, 65536 objects, 262144 refs/properties, 4 MiB serialized input per task, 8 MiB complete report. These are admission bounds, not a guarantee for arbitrary Unity projects. No partial report is silently exported. Unknown/opaque content and unresolved refs do not imply normality.
Hike uses its own memory per job and computes incoming counts, type constraints and interned property differences. GUID/fileID remain strings in host dictionaries.

Development: static checks -> Sites save -> GitHub Pages update/deployment verification -> exact-version cloud copy -> dynamic tests. Source publication and passed runtime validation are separate states. This minimum gate is not a claim that the full planned file/archive adapters are complete.
