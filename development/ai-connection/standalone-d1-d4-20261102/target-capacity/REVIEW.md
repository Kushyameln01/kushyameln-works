# Preparation review

An independent read-only review checked the Gemm→Hike bias order, complete inner
dimension, four live host stores, real staged cache, localhost/private-reference
routes and captured JS/WASM serving. It performed source/syntax inspection only.

Four findings were corrected before any numerical execution:

1. The new capacity reference/native processes now share an exclusive OS lock.
   Known model/reference owners, including another copy of this runner, are also
   checked. Other harnesses still require coordinator-controlled sequential work;
   they do not participate in this new lock.
2. Both native projection and biased projection must contain exactly655,360 F32
   values before the fixed all-value comparison can pass.
3. The reference metadata and numerical bytes are captured once for execution;
   reported hashes describe those snapshots, and their disk identities are
   checked again after the native phase.
4. Independent `Parameters.linear` code executes from the verified captured
   Python source bytes, with its original filename for relative source identity.

The final preparation also adds explicit named lookup-table, bias-snapshot and
operator-output spans. Runtime reservations remain unverified planning values.
The existing gate/input/operator/core hash did not change. The public captured
core was independently checked at83,811bytes and SHA256
`17dd8f793f09fb71dce847e48e64ea18afd9270bcef916d11fc34e309a30b699`.

Light verification: Node4 tests; Python6 checks; JS syntax and Python AST; CLI
recipient `--models`/`--model`/`--core` options. The controlled input identity is
hashed one55,296byte row at a time without a target array. `preparation.json`
records `allSourcesAtHead:false` because these new files are deliberately
uncommitted while the parent's six-NN execution source remains frozen.

No target store, model payload, native Gemm, NumPy reference or heavy capacity
phase has run. Numerical, physical-capacity and combined-RSS acceptance are
pending the parent's explicit GO after the current six-NN owner exits and the
prepared sources are committed.
