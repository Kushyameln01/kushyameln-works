Install the observer before importing/creating any ORT or Hike owner in the new
six-run browser harness. This is a proposed harness insertion; existing frozen
runtime and runner files have not been edited.

```js
const {installWasmMemoryObserver}=await import('/shared/diffusion-models/execution/wasm-memory-observer.mjs');
const memoryObserver=installWasmMemoryObserver();
const memorySamples=[memoryObserver.sample('before-owner-create')];
const heartbeat=setInterval(()=>memorySamples.push(memoryObserver.sample('heartbeat')),1000);
try {
  // Existing owner creation and inference calls, unchanged.
  // In the existing onProgress callback, append:
  // memorySamples.push(memoryObserver.sample('progress:'+event.stage));
  // Immediately before and after existing owner disposal, append:
  // memorySamples.push(memoryObserver.sample('before-dispose'));
  // ... await owner.dispose(); ...
  // memorySamples.push(memoryObserver.sample('after-dispose'));
  // Copy only these numeric snapshots into the existing diagnostic receipt.
} finally {
  clearInterval(heartbeat);
  memorySamples.push(memoryObserver.sample('observer-final'));
  memoryObserver.unhook();
}
```

The hooks use the native `Memory` and `Instance` constructors through Proxies and attach a
nonthrowing observer to the native instantiation promise while returning that
original promise. They discover native exported memories with the intrinsic
instance exports getter. Every memory is held only by `WeakRef`/`WeakMap`, so the
observer does not keep a disposed owner's memory alive across jobs. It does add
small constructor, promise-callback, and polling overhead to measured timings.
The attached rejection observer marks instantiation promises handled, which
changes `unhandledrejection` telemetry. Awaited native results and rejections
are preserved; the six-run harness already awaits those calls.

Imported memories created after installation are seen through the constructor;
preexisting imported memories exported by an observed instance are also seen.
For trusted, already available imports, `registerImports(imports)` can register
data-property memories explicitly. Hooks never inspect native import arguments
or invoke additional import getters/proxy traps. Preexisting unexported memory
and construction through saved native constructors require explicit registration.

Each sample records actual current `memory.buffer.byteLength` per object identity
and its observed peak. Current reachable-object byte sums and concurrent sampled
peaks describe those objects only. Multiple shared-memory objects can refer to
the same backing, so these sums are not a physical-allocation total. An identity
that is no longer dereferenceable has no current byte measurement. Reachable
after disposal can mean collectible but not yet collected, another retained
reference, or intended runtime retention; this observer cannot distinguish them
and makes no OS release claim. No forced GC is used.
Shared memory is measured even when the global `SharedArrayBuffer` constructor
is hidden. If a native memory's length cannot be read, its identity and error
count remain visible, and current bytes are `null` rather than a zero estimate.

Run the small native tests with:

```sh
node docs/shared/diffusion-models/execution/test-wasm-memory-observer.mjs
```
