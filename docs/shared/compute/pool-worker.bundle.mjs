var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/protocol.mjs
var BUILD_ID = "compute-unity-b1";
var WASM_SHA256 = "b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad";
var MAX_MASKS = 262144;
function validateRequest(input, { copy = true } = {}) {
  if (!input || input.protocolVersion !== 1 || input.taskType !== "ft-magnitude-batch" || input.taskVersion !== 1) throw new TypeError("\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044protocol\u30FBtask\u30FBversion\u3067\u3059");
  if (typeof input.jobId !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(input.jobId)) throw new TypeError("jobId\u306F1\u301C64\u6587\u5B57\u306E\u82F1\u6570\u5B57\u30FB_.:-\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  if (!Number.isSafeInteger(input.inputRevision) || input.inputRevision < 0) throw new TypeError("inputRevision\u306F0\u4EE5\u4E0A\u306E\u6574\u6570\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  const { masks, weights } = input.payload ?? {};
  if (!Array.isArray(weights) || weights.length < 1 || weights.length > 5 || Array.from(weights).some((x) => typeof x !== "number" || !Number.isFinite(x) || x <= 0) || !Number.isFinite(weights.reduce((a, b) => a + b, 0))) throw new RangeError("weights\u306F\u5408\u8A08\u304C\u6709\u9650\u306B\u306A\u308B1\u301C5\u500B\u306E\u6B63\u306E\u6570\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  if (!Array.isArray(masks) || masks.length > MAX_MASKS) throw new RangeError("masks\u306E\u4EF6\u6570\u304C\u4E0D\u6B63\u3067\u3059");
  for (const mask of masks) if (!Number.isInteger(mask) || mask < 0 || mask >= 2 ** weights.length) throw new RangeError("masks\u306E\u5024\u57DF\u304C\u4E0D\u6B63\u3067\u3059");
  const timeoutMs = input.limits?.timeoutMs ?? 3e4;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4) throw new RangeError("timeoutMs\u306F1\u301C30000\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044");
  return { protocolVersion: 1, jobId: input.jobId, inputRevision: input.inputRevision, taskType: input.taskType, taskVersion: 1, payload: { masks: copy ? masks.slice() : masks, weights: copy ? weights.slice() : weights }, limits: { timeoutMs } };
}

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/registered-tasks.mjs
var registered_tasks_exports = {};
__export(registered_tasks_exports, {
  executeTask: () => executeTask,
  freezeTaskResult: () => freezeTaskResult,
  inputBytes: () => inputBytes,
  inspectTaskRequest: () => inspectTaskRequest,
  instantiateTask: () => instantiateTask,
  kernelInfo: () => kernelInfo,
  prepareTaskModule: () => prepareTaskModule,
  resultBytes: () => resultBytes,
  resultShape: () => resultShape,
  snapshotTaskRequest: () => snapshotTaskRequest,
  taskInputCount: () => taskInputCount,
  transferTaskInput: () => transferTaskInput,
  transferTaskResult: () => transferTaskResult,
  validTaskResult: () => validTaskResult
});

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/kernel.mjs
async function prepareKernelModule({ signal, fetchImpl = fetch, onCompile = () => {
}, onResponse = () => {
} } = {}) {
  const response = await fetchImpl(new URL("../ft/kernel/ft-kernel.wasm", import.meta.url), { credentials: "omit", signal });
  onResponse(response.headers?.get("content-type") ?? null);
  if (!response.ok) throw Error(`WASM fetch failed: ${response.status}`);
  const bytes2 = await response.arrayBuffer();
  if (signal?.aborted) throw Error("WASM preparation aborted");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes2)), (value2) => value2.toString(16).padStart(2, "0")).join("");
  if (digest !== WASM_SHA256) throw Error("WASM digest does not match the reviewed kernel");
  if (signal?.aborted) throw Error("WASM preparation aborted");
  onCompile();
  const module = await WebAssembly.compile(bytes2);
  if (signal?.aborted) throw Error("WASM preparation aborted");
  return module;
}
function instantiateKernel(module) {
  if (!(module instanceof WebAssembly.Module)) throw TypeError("Expected a compiled WASM module");
  if (WebAssembly.Module.imports(module).length) throw Error("Unexpected kernel imports");
  const expected = ["FtAnchorComponent:function", "FtCrc32Step:function", "FtMagnitude:function", "FtSignedMagnitude:function", "FtValidate:function", "memory:memory"];
  const actual = WebAssembly.Module.exports(module).map((value2) => `${value2.name}:${value2.kind}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error("Unexpected kernel exports");
  const instance = new WebAssembly.Instance(module, {});
  const k = instance.exports;
  return Object.freeze({
    instanceId: crypto.randomUUID(),
    memory: k.memory,
    magnitude(mask, weights) {
      if (!Number.isInteger(mask) || mask < 0 || mask > 2147483647) throw RangeError("Expected an i32 mask");
      if (!Array.isArray(weights) || weights.length < 1 || weights.length > 5 || Array.from(weights).some((value3) => typeof value3 !== "number" || !Number.isFinite(value3))) throw RangeError("Invalid weights");
      const padded = [...weights, ...Array(5 - weights.length).fill(0)];
      if (k.FtValidate(mask, weights.length, ...padded) !== 0) throw RangeError("Kernel rejected the input");
      const value2 = k.FtMagnitude(mask, weights.length, ...padded);
      if (!Number.isFinite(value2)) throw RangeError("Kernel returned an invalid result");
      return value2;
    }
  });
}

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/registered-tasks.mjs
var inspectTaskRequest = (r) => validateRequest(r, { copy: false });
var snapshotTaskRequest = (r) => ({ ...r, payload: { masks: r.payload.masks.slice(), weights: r.payload.weights.slice() } });
var inputBytes = (r) => (r.payload.masks.length + r.payload.weights.length) * 8;
var kernelInfo = () => ({ sha256: WASM_SHA256, variant: "scalar", abi: "ft-v1", key: `ft-v1:${WASM_SHA256}:scalar` });
var resultShape = (r) => ({ length: r.payload.masks.length });
var validTaskResult = (t, s, r) => Array.isArray(r) && r.length === s.length && Array.from(r).every((x) => typeof x === "number" && Number.isFinite(x));
var resultBytes = (r) => r ? r.length * 8 : 0;
var freezeTaskResult = (r) => r === void 0 ? void 0 : Object.freeze(r);
var transferTaskInput = () => [];
var transferTaskResult = () => [];
var prepareTaskModule = prepareKernelModule;
var instantiateTask = (r, m) => instantiateKernel(m);
var executeTask = (r, k) => r.payload.masks.map((mask) => k.magnitude(mask, r.payload.weights));
var taskInputCount = (r, v) => v.length;

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/pool-task.mjs
var pool_task_exports = {};
__export(pool_task_exports, {
  executeTask: () => executeTask2,
  freezeTaskResult: () => freezeTaskResult2,
  inputBytes: () => inputBytes2,
  inspectTaskRequest: () => inspectTaskRequest2,
  instantiateTask: () => instantiateTask2,
  isUnity: () => isUnity,
  kernelInfo: () => kernelInfo2,
  prepareTaskModule: () => prepareTaskModule2,
  resultBytes: () => resultBytes2,
  resultShape: () => resultShape2,
  snapshotTaskRequest: () => snapshotTaskRequest2,
  taskInputCount: () => taskInputCount2,
  transferTaskInput: () => transferTaskInput2,
  transferTaskResult: () => transferTaskResult2,
  validTaskResult: () => validTaskResult2
});

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/model.mjs
var SCHEMA = "unity-analysis-snapshot/1";
var ANALYZER_VERSION = "unity-analysis-0.1.0";
var RULES_VERSION = "unity-static-1";
var TYPES = Object.freeze({ Unknown: 0, Float: 1, Int: 2, Bool: 3, Trigger: 4 });
var LIMITS = Object.freeze({ maxFiles: 4096, maxObjects: 65536, maxEdges: 262144, maxProperties: 262144, maxInputBytes: 4 * 1024 * 1024, maxReportBytes: 8 * 1024 * 1024 });
var own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var plain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
function bytes(value2) {
  return new TextEncoder().encode(JSON.stringify(value2)).byteLength;
}
function fileId(value2, { zero = true } = {}) {
  if (typeof value2 !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value2) || value2 === "-0") throw TypeError("fileID must be a decimal string");
  const n = BigInt(value2);
  if (n < -(1n << 63n) || n > (1n << 63n) - 1n || !zero && n === 0n) throw RangeError("fileID outside signed 64-bit range");
  return value2;
}
function guid(value2) {
  if (typeof value2 !== "string" || !/^[0-9a-fA-F]{32}$/.test(value2)) throw TypeError("Invalid GUID");
  return value2.toLowerCase();
}
function safePath(path) {
  if (typeof path !== "string" || !path || path.length > 1024 || /[\\\x00-\x1f]/.test(path) || path.startsWith("/") || path.split("/").some((x) => !x || x === "." || x === "..") || path.includes(":")) throw TypeError("Unsafe relative input path");
  return path;
}
function boundedText(v, max = 1024) {
  if (typeof v !== "string" || v.length > max) throw TypeError("Invalid text field");
  return v;
}
function value(v, depth = 0) {
  if (depth > 64) throw RangeError("Property depth limit");
  if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
  if (Array.isArray(v)) {
    for (const x of v) value(x, depth + 1);
    return;
  }
  if (plain(v)) {
    for (const [k, x] of Object.entries(v)) {
      boundedText(k);
      value(x, depth + 1);
    }
    return;
  }
  throw TypeError("Properties must be JSON values");
}
function sourcePosition(source) {
  if (source == null) return {};
  if (!plain(source) || Object.keys(source).some((k) => !["line", "column", "start", "end", "endLine", "endColumn"].includes(k)) || Object.values(source).some((v) => !Number.isSafeInteger(v) || v < 0)) throw TypeError("Invalid source position");
  return { ...source };
}
function inspectSnapshot(input) {
  if (!plain(input) || input.schemaVersion !== SCHEMA || !Array.isArray(input.files) || input.files.length > LIMITS.maxFiles) throw TypeError("Expected " + SCHEMA + " and bounded files");
  boundedText(input.snapshotId ?? "snapshot", 128);
  let objects = 0, edges = 0, properties = 0;
  for (const f of input.files) {
    if (!plain(f)) throw TypeError("Invalid file");
    safePath(f.path);
    if (f.guid != null) guid(f.guid);
    if (f.coverage != null && !["structured-input", "serialized", "partial", "opaque", "meta-only"].includes(f.coverage)) throw TypeError("Invalid coverage state");
    if (!Array.isArray(f.objects)) throw TypeError("File objects required");
    if (f.contentHash != null && !/^[0-9a-f]{64}$/.test(f.contentHash)) throw TypeError("Invalid SHA256");
    objects += f.objects.length;
    for (const o of f.objects) {
      if (!plain(o)) throw TypeError("Invalid object");
      fileId(o.fileId, { zero: false });
      sourcePosition(o.source);
      boundedText(o.classId ?? "", 32);
      if (!plain(o.properties ?? {})) throw TypeError("Properties map required");
      value(o.properties ?? {});
      properties += Object.keys(o.properties ?? {}).length;
      for (const r of o.references ?? []) {
        boundedText(r.property);
        sourcePosition(r.source);
        fileId(r.fileId);
        if (r.guid != null) guid(r.guid);
        edges++;
      }
      for (const p of o.parameters ?? []) {
        boundedText(p.name);
        if (!own(TYPES, p.type)) throw TypeError("Unknown parameter type tag");
      }
      for (const u of o.parameterUses ?? []) {
        boundedText(u.name);
        sourcePosition(u.source);
        boundedText(u.rule ?? "supplied-rule");
        if (!Array.isArray(u.allowedTypes) || u.allowedTypes.some((t) => !own(TYPES, t) || t === "Unknown")) throw TypeError("Invalid allowed types");
        if (u.scopeFileId != null) fileId(u.scopeFileId, { zero: false });
      }
    }
  }
  if (objects > LIMITS.maxObjects || edges > LIMITS.maxEdges || properties > LIMITS.maxProperties || bytes(input) > LIMITS.maxInputBytes) throw RangeError("Snapshot limit exceeded");
  return input;
}
function canonical(value2) {
  if (Array.isArray(value2)) return "[" + value2.map(canonical).join(",") + "]";
  if (plain(value2)) return "{" + Object.keys(value2).sort().map((k) => JSON.stringify(k) + ":" + canonical(value2[k])).join(",") + "}";
  return JSON.stringify(value2);
}
function freezeDeep(v) {
  if (v && typeof v === "object" && !ArrayBuffer.isView(v) && !Object.isFrozen(v)) {
    Object.values(v).forEach(freezeDeep);
    Object.freeze(v);
  }
  return v;
}
function buildIndex(input) {
  inspectSnapshot(input);
  const nodes = [], assetMap = /* @__PURE__ */ new Map(), guidMap = /* @__PURE__ */ new Map(), findings = [];
  for (const [fi, f] of input.files.entries()) {
    const assetId = f.guid ? guid(f.guid) : `input:${f.path}`;
    const entry = { ...f, assetId, inputFileIndex: fi, nodes: /* @__PURE__ */ new Map() };
    const byAsset = assetMap.get(assetId) ?? [];
    byAsset.push(entry);
    assetMap.set(assetId, byAsset);
    if (f.guid) guidMap.set(guid(f.guid), byAsset);
    for (const o of f.objects) {
      const n = { ...o, index: nodes.length, assetId, file: f, fileIndex: fi, key: `${assetId}:${o.fileId}`, source: { ...o.source ?? {}, path: f.path, fileId: o.fileId, classId: o.classId } };
      nodes.push(n);
      const matches = entry.nodes.get(o.fileId) ?? [];
      matches.push(n);
      entry.nodes.set(o.fileId, matches);
    }
  }
  for (const [assetId, entries] of assetMap) if (entries.length > 1) findings.push({ code: "DUPLICATE_ASSET_ID", category: "reference", severity: "warning", confidence: "confirmed", assetId, paths: entries.map((e) => e.path) });
  for (const entries of assetMap.values()) for (const e of entries) for (const [id, ns] of e.nodes) if (ns.length > 1) findings.push({ code: "DUPLICATE_FILE_ID", category: "reference", severity: "error", confidence: "confirmed", path: e.path, fileId: id });
  return { nodes, assetMap, guidMap, findings };
}

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/analysis.mjs
var builtin = (g) => /^0{16}[def]0{15}$/i.test(g ?? "");
function analyzeSnapshot(input, kernel) {
  const index = buildIndex(input), { nodes, assetMap, guidMap } = index, findings = [...index.findings], references = [], targets = [], targetSources = /* @__PURE__ */ new Map();
  for (const n of nodes) for (const r of n.references ?? []) {
    const reference = { source: { ...n.source, ...sourcePosition(r.source), property: r.property }, assetId: n.assetId, fileId: r.fileId, guid: r.guid ?? null, property: r.property, state: null, targetIndex: null };
    if (r.fileId === "0") reference.state = "null";
    else if (builtin(r.guid)) reference.state = "builtin-unverified";
    else {
      const candidates = r.guid ? guidMap.get(r.guid.toLowerCase()) : assetMap.get(n.assetId);
      if (!candidates?.length) reference.state = "external-unprovided";
      else if (candidates.length !== 1) reference.state = "ambiguous";
      else {
        const file = candidates[0], found = file.nodes.get(r.fileId) ?? [];
        if (found.length > 1) reference.state = "ambiguous";
        else if (found.length === 1) {
          reference.state = "resolved";
          reference.targetIndex = found[0].index;
          reference.target = { path: file.path, assetId: file.assetId, fileId: r.fileId };
          targets.push(found[0].index);
          const refs = targetSources.get(found[0].index) ?? [];
          refs.push(reference.source);
          targetSources.set(found[0].index, refs);
        } else if (file.coverage === "opaque" || file.coverage === "partial") reference.state = "unparsed-target";
        else reference.state = r.guid ? "missing-target-object" : "missing-local";
      }
    }
    references.push(reference);
    if (!["null", "resolved"].includes(reference.state)) findings.push({ code: reference.state === "missing-local" || reference.state === "missing-target-object" ? "MISSING_REFERENCE" : "REFERENCE_UNRESOLVED", category: "reference", severity: reference.state.startsWith("missing-") ? "error" : "warning", confidence: reference.state.startsWith("missing-") ? "confirmed" : "unverified", ...reference });
  }
  const counts = kernel.incoming(Int32Array.from(targets), nodes.length);
  const shared = [];
  for (const n of nodes) if (counts[n.index] > 1) shared.push({ assetId: n.assetId, fileId: n.fileId, path: n.file.path, incoming: counts[n.index], sources: targetSources.get(n.index) ?? [] });
  const declarations = [], declarationMap = /* @__PURE__ */ new Map(), checks = [], actual = [], allowed = [];
  for (const n of nodes) for (const p of n.parameters ?? []) {
    const d = { ...p, scope: n.key, source: n.source };
    declarations.push(d);
    const key = JSON.stringify([n.key, p.name]);
    const matches = declarationMap.get(key) ?? [];
    matches.push(d);
    declarationMap.set(key, matches);
  }
  for (const declarations2 of declarationMap.values()) if (declarations2.length > 1) findings.push({ code: "PARAMETER_DUPLICATE_DECLARATION", category: "parameter", severity: "warning", confidence: "confirmed", name: declarations2[0].name, scope: declarations2[0].scope, declarations: declarations2 });
  for (const n of nodes) for (const u of n.parameterUses ?? []) {
    const scope = u.scopeFileId ? `${n.assetId}:${u.scopeFileId}` : n.key;
    const declarationsInScope = declarationMap.get(JSON.stringify([scope, u.name])) ?? [];
    const type = declarationsInScope.length === 1 ? declarationsInScope[0].type : "Unknown";
    actual.push(TYPES[type]);
    allowed.push(u.allowedTypes.reduce((m, t) => m | 1 << TYPES[t], 0));
    checks.push({ name: u.name, declared: type, required: u.allowedTypes, rule: u.rule ?? "supplied-rule", scope, source: { ...n.source, ...sourcePosition(u.source) }, declarationCount: declarationsInScope.length });
  }
  const verdicts = kernel.types(Int32Array.from(actual), Int32Array.from(allowed));
  for (let i = 0; i < checks.length; i++) {
    checks[i].verdict = ["unknown", "compatible", "incompatible"][verdicts[i]];
    if (verdicts[i] !== 1) findings.push({ code: verdicts[i] === 2 ? "PARAMETER_TYPE_CONSTRAINT" : checks[i].declarationCount > 1 ? "PARAMETER_AMBIGUOUS" : "PARAMETER_UNRESOLVED", category: "parameter", severity: verdicts[i] === 2 ? "error" : "warning", confidence: verdicts[i] === 2 ? "confirmed" : "unverified", ...checks[i] });
  }
  const coverage = { files: input.files.length, objects: nodes.length, opaqueFiles: input.files.filter((f) => f.coverage === "opaque").map((f) => f.path), partialFiles: input.files.filter((f) => f.coverage === "partial").map((f) => ({ path: f.path, reason: f.reason ?? "unsupported syntax" })), source: !input.files.length || input.files.some((f) => !f.coverage || f.coverage === "structured-input") ? "caller-supplied schema" : "serialized-input", unresolvedReferences: references.filter((r) => !["null", "resolved"].includes(r.state)).length, unknownParameterChecks: checks.filter((c) => c.verdict === "unknown").length };
  return { kind: "unity-analysis", schemaVersion: 1, analyzerVersion: ANALYZER_VERSION, ruleSetVersion: RULES_VERSION, snapshotId: input.snapshotId ?? "snapshot", files: input.files.map((f) => ({ path: f.path, guid: f.guid ?? null, contentHash: f.contentHash ?? null, contentHashProvenance: "caller-provided; not independently verified at structured-input boundary", coverage: f.coverage ?? "structured-input", reason: f.reason ?? null })), coverage, references, parameters: { declarations, checks }, shared, findings, completeness: { totalCount: findings.length, returnedCount: findings.length, truncated: false }, counts: { files: input.files.length, objects: nodes.length, references: references.length, shared: shared.length, findings: findings.length } };
}
function compareSnapshots(before, after, kernel) {
  const b = buildIndex(before), a = buildIndex(after), changes = [], ambiguous = [];
  const byKey = (index) => {
    const m = /* @__PURE__ */ new Map();
    for (const n of index.nodes) {
      const v = m.get(n.key) ?? [];
      v.push(n);
      m.set(n.key, v);
    }
    return m;
  };
  const bm = byKey(b), am = byKey(a), pairs = [], bv = [], av = [], intern = /* @__PURE__ */ new Map();
  let next = 1;
  const id = (v) => {
    const s = canonical(v);
    if (!intern.has(s)) intern.set(s, next++);
    return intern.get(s);
  };
  for (const key of /* @__PURE__ */ new Set([...bm.keys(), ...am.keys()])) {
    const bs = bm.get(key) ?? [], as = am.get(key) ?? [];
    if (bs.length > 1 || as.length > 1) {
      ambiguous.push({ key, beforeCount: bs.length, afterCount: as.length });
      continue;
    }
    const bn = bs[0], an = as[0];
    if (!bn || !an) {
      changes.push({ kind: bn ? "object-removed" : "object-added", identity: key, source: (bn ?? an).source, matching: "exact-guid-fileID-or-provisional-input-path", before: bn?.properties ?? null, after: an?.properties ?? null });
      continue;
    }
    const domains = [["property", bn.properties ?? {}, an.properties ?? {}], ["metadata", { classId: bn.classId }, { classId: an.classId }], ["references", { references: bn.references ?? [] }, { references: an.references ?? [] }], ["parameters", { declarations: bn.parameters ?? [], uses: bn.parameterUses ?? [] }, { declarations: an.parameters ?? [], uses: an.parameterUses ?? [] }]];
    for (const [domain, bp, ap] of domains) for (const property of /* @__PURE__ */ new Set([...Object.keys(bp), ...Object.keys(ap)])) {
      const presentB = Object.hasOwn(bp, property), presentA = Object.hasOwn(ap, property);
      pairs.push({ domain, kind: !presentB ? "property-added" : !presentA ? "property-removed" : "property-changed", identity: key, property, before: presentB ? bp[property] : null, after: presentA ? ap[property] : null, beforePresent: presentB, afterPresent: presentA, source: an.source, matching: an.file.guid ? "exact-guid-fileID" : "provisional-input-path-fileID" });
      bv.push(presentB ? id(bp[property]) : 0);
      av.push(presentA ? id(ap[property]) : 0);
    }
  }
  const diffs = kernel.diff(Int32Array.from(bv), Int32Array.from(av));
  for (let i = 0; i < diffs.length; i++) if (diffs[i]) changes.push(pairs[i]);
  const fileChanges = [];
  for (const f of before.files) {
    const other = after.files.filter((x) => f.guid ? x.guid === f.guid : x.path === f.path);
    if (other.length === 1 && f.contentHash && other[0].contentHash && f.contentHash !== other[0].contentHash) fileChanges.push({ pathBefore: f.path, pathAfter: other[0].path, beforeHash: f.contentHash, afterHash: other[0].contentHash, kind: "raw-bytes-changed" });
  }
  return { kind: "unity-diff", changes, ambiguous, fileChanges, completeness: { totalCount: changes.length, returnedCount: changes.length, truncated: false }, identityPolicy: "GUID/fileID exact; missing GUID uses explicit provisional input path; no heuristic remapping" };
}

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/kernel/registry.mjs
var UNITY_KERNEL = Object.freeze({ key: "hike-unity-i32-v1:e7c1049626826d3dabe2f53a7935efa69cd6f2cfa85fa11375b7bdd877088520:scalar", variant: "scalar", abi: "hike-unity-i32-v1", sha256: "e7c1049626826d3dabe2f53a7935efa69cd6f2cfa85fa11375b7bdd877088520", url: new URL("../unity-analysis/kernel/unity-analysis.wasm", import.meta.url).href });

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/kernel/kernel.mjs
var MAX_VECTOR = 262144;
var MAX_MEMORY = 16777216;
var PAGE_BYTES = 65536;
var typedPrototype = Object.getPrototypeOf(Int32Array.prototype);
var typedGet = Object.fromEntries(["length", "buffer", "byteOffset", "byteLength"].map((key) => [key, Object.getOwnPropertyDescriptor(typedPrototype, key).get]));
var typed = (value2, key) => Reflect.apply(typedGet[key], value2, []);
var integer = (value2, min, max) => Number.isSafeInteger(value2) && value2 >= min && value2 <= max;
var errors = { [-1]: "UA_INVALID_COUNT", [-2]: "UA_INVALID_VALUE" };
function aborted(signal) {
  if (signal?.aborted) throw new DOMException("Unity kernel preparation aborted", "AbortError");
}
async function prepareUnityKernel({ signal, fetchImpl = fetch, onCompile = () => {
}, onResponse = () => {
} } = {}) {
  aborted(signal);
  const response = await fetchImpl(UNITY_KERNEL.url, { credentials: "omit", signal });
  aborted(signal);
  if (!response.ok) throw Error(`UA_KERNEL_FETCH:${response.status}`);
  onResponse(response.headers?.get("content-type") ?? null);
  const bytes2 = await response.arrayBuffer();
  aborted(signal);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes2)), (x) => x.toString(16).padStart(2, "0")).join("");
  aborted(signal);
  if (hash !== UNITY_KERNEL.sha256) throw Error("UA_KERNEL_HASH");
  onCompile();
  aborted(signal);
  const module = await WebAssembly.compile(bytes2);
  aborted(signal);
  return module;
}
function instantiateUnityKernel(module) {
  const expected = "UaDiff:function,UaIncoming:function,UaTypeCheck:function,memory:memory";
  if (!(module instanceof WebAssembly.Module) || WebAssembly.Module.imports(module).length || WebAssembly.Module.exports(module).map((x) => `${x.name}:${x.kind}`).sort().join(",") !== expected) throw TypeError("UA_KERNEL_ABI");
  let instance = new WebAssembly.Instance(module), memory = instance.exports.memory;
  if (!(memory instanceof WebAssembly.Memory) || !(memory.buffer instanceof ArrayBuffer) || memory.buffer.byteLength < 65536 || memory.buffer.byteLength > MAX_MEMORY || ["UaIncoming", "UaTypeCheck", "UaDiff"].some((name) => instance.exports[name].length !== 5)) throw TypeError("UA_KERNEL_ABI");
  const instanceId = `unity-${crypto.randomUUID()}`, arenaBase = memory.buffer.byteLength;
  let disposed = false, busy = false, liveBytes = 0, peakBytes = 0, runs = 0;
  function check() {
    if (disposed) throw Error("UA_DISPOSED");
    if (busy) throw Error("UA_BUSY");
  }
  function vector(data) {
    if (!(data instanceof Int32Array)) throw TypeError("UA_INT32_REQUIRED");
    const buffer = typed(data, "buffer"), length = typed(data, "length"), offset = typed(data, "byteOffset"), bytes2 = typed(data, "byteLength");
    if (!(buffer instanceof ArrayBuffer) || buffer.resizable) throw TypeError("UA_BUFFER");
    if (buffer === memory.buffer) throw TypeError("UA_MEMORY_ALIAS");
    new Int32Array(buffer, offset, length);
    if (!integer(length, 0, MAX_VECTOR) || bytes2 !== length * 4) throw RangeError("UA_VECTOR_LIMIT");
    return { data, length };
  }
  function values(v, min, max, code) {
    for (let i = 0; i < v.length; i++) if (!integer(v.data[i], min, max)) throw RangeError(code);
  }
  function execute(name, inputs, outputCount, argumentsFor, validResult) {
    check();
    const lengths = [...inputs.map((x) => x.length), outputCount];
    let end = arenaBase;
    const pointers = lengths.map((length) => {
      if (!integer(length, 0, MAX_VECTOR)) throw RangeError("UA_VECTOR_LIMIT");
      const bytes2 = length * 4, start = end;
      end = Math.ceil((end + bytes2) / 8) * 8;
      if (!Number.isSafeInteger(end) || start % 8 || end < start || end > MAX_MEMORY || end > 2147483647) throw RangeError("UA_ARENA_LIMIT");
      return start;
    });
    if (memory.buffer.byteLength > MAX_MEMORY) throw RangeError("UA_MEMORY_LIMIT");
    busy = true;
    let reserved = false;
    try {
      const pages = Math.ceil((end - memory.buffer.byteLength) / PAGE_BYTES);
      if (pages > 0) memory.grow(pages);
      const mem = memory;
      new Uint8Array(mem.buffer, arenaBase, end - arenaBase).fill(0);
      reserved = true;
      liveBytes = end - arenaBase;
      peakBytes = Math.max(peakBytes, liveBytes);
      for (let i = 0; i < inputs.length; i++) new Int32Array(mem.buffer, pointers[i], inputs[i].length).set(inputs[i].data);
      const status = instance.exports[name](...argumentsFor(pointers));
      if (status !== 0) throw Error(errors[status] ?? "UA_KERNEL_STATUS");
      if (mem.buffer.byteLength > MAX_MEMORY) throw Error("UA_MEMORY_LIMIT");
      const result = Int32Array.from(new Int32Array(mem.buffer, pointers[pointers.length - 1], outputCount));
      if (!validResult(result)) throw Error("UA_INVALID_RESULT");
      runs++;
      return result;
    } finally {
      if (reserved) new Uint8Array(memory.buffer, arenaBase, end - arenaBase).fill(0);
      liveBytes = 0;
      busy = false;
    }
  }
  function incoming(targets, nodeCount) {
    check();
    const edges = vector(targets);
    if (!integer(nodeCount, 0, MAX_VECTOR)) throw RangeError("UA_NODE_COUNT");
    values(edges, 0, nodeCount - 1, "UA_TARGET");
    return execute("UaIncoming", [edges], nodeCount, ([input, out]) => [input, edges.length, nodeCount, out, nodeCount], (result) => {
      let total = 0;
      for (const count of result) {
        if (!integer(count, 0, edges.length)) return false;
        total += count;
      }
      return total === edges.length;
    });
  }
  function types(actual, allowedMasks) {
    check();
    const a = vector(actual), m = vector(allowedMasks);
    if (a.length !== m.length) throw RangeError("UA_LENGTH");
    values(a, 0, 4, "UA_TYPE_TAG");
    values(m, 0, 31, "UA_TYPE_MASK");
    return execute("UaTypeCheck", [a, m], a.length, ([ap, mp, out]) => [ap, mp, a.length, out, a.length], (result) => result.every((x) => x >= 0 && x <= 2));
  }
  function diff(before, after) {
    check();
    const a = vector(before), b = vector(after);
    if (a.length !== b.length) throw RangeError("UA_LENGTH");
    values(a, 0, 2147483647, "UA_EQUIVALENCE_ID");
    values(b, 0, 2147483647, "UA_EQUIVALENCE_ID");
    return execute("UaDiff", [a, b], a.length, ([ap, bp, out]) => [ap, bp, a.length, out, a.length], (result) => result.every((x) => x === 0 || x === 1));
  }
  function dispose() {
    if (disposed) return;
    if (busy) throw Error("UA_BUSY");
    disposed = true;
    instance = null;
    memory = null;
    module = null;
    liveBytes = 0;
  }
  return Object.freeze({
    instanceId,
    get memory() {
      return memory;
    },
    incoming,
    types,
    diff,
    dispose,
    resourceStats: () => ({ disposed, busy, runs, liveBytes, peakBytes, arenaBase, memoryBytes: memory?.buffer.byteLength ?? 0, maxMemoryBytes: MAX_MEMORY, maxVectorElements: MAX_VECTOR, boundsScope: "prototype" })
  });
}

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/unity-analysis/pool-task.mjs
var isUnity = (t) => t === "unity-analyze" || t === "unity-diff";
function inspectTaskRequest2(r) {
  if (!r || r.protocolVersion !== 1 || !isUnity(r.taskType) || r.taskVersion !== 1 || typeof r.jobId !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId) || !Number.isSafeInteger(r.inputRevision) || r.inputRevision < 0) throw TypeError("Invalid Unity task identity");
  const timeoutMs = r.limits?.timeoutMs ?? 3e4;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4) throw RangeError("Invalid Unity task timeout");
  if (r.taskType === "unity-analyze") inspectSnapshot(r.payload);
  else {
    inspectSnapshot(r.payload?.before);
    inspectSnapshot(r.payload?.after);
  }
  if (bytes(r.payload) > LIMITS.maxInputBytes) throw RangeError("Unity task input budget");
  return { protocolVersion: 1, taskType: r.taskType, taskVersion: 1, jobId: r.jobId, inputRevision: r.inputRevision, wasmVariant: "scalar", kernelHash: UNITY_KERNEL.sha256, payload: r.payload, limits: { timeoutMs } };
}
var snapshotTaskRequest2 = (r) => ({ ...r, payload: structuredClone(r.payload) });
var inputBytes2 = (r) => bytes(r.payload);
var kernelInfo2 = () => ({ ...UNITY_KERNEL, requiresWasm: true });
var resultShape2 = (r) => ({ kind: r.taskType === "unity-diff" ? "unity-diff" : "unity-analysis", snapshotId: r.payload.snapshotId ?? "snapshot" });
function validTaskResult2(taskType, shape, result) {
  return !!(result && result.kind === shape.kind && result.completeness?.truncated === false && Number.isSafeInteger(result.completeness.totalCount) && result.completeness.totalCount === result.completeness.returnedCount && bytes(result) <= LIMITS.maxReportBytes && (taskType === "unity-analyze" ? result.snapshotId === shape.snapshotId && Array.isArray(result.findings) && Array.isArray(result.references) && Array.isArray(result.shared) && result.findings.length === result.completeness.totalCount : Array.isArray(result.changes) && result.changes.length === result.completeness.totalCount));
}
var resultBytes2 = (r) => r ? bytes(r) : 0;
var freezeTaskResult2 = freezeDeep;
var transferTaskInput2 = () => [];
var transferTaskResult2 = () => [];
var prepareTaskModule2 = prepareUnityKernel;
var instantiateTask2 = (r, module) => instantiateUnityKernel(module);
function executeTask2(r, kernel) {
  const result = r.taskType === "unity-analyze" ? analyzeSnapshot(r.payload, kernel) : compareSnapshots(r.payload.before, r.payload.after, kernel);
  if (bytes(result) > LIMITS.maxReportBytes) throw RangeError("Unity report output budget");
  return result;
}
var taskInputCount2 = (r) => r.taskType === "unity-analyze" ? r.payload.files.reduce((n, f) => n + f.objects.length, 0) : r.payload.before.files.length + r.payload.after.files.length;

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/tasks.mjs
var MAX_MEDIA_INPUT_BYTES = Reflect.get(registered_tasks_exports, "MAX_MEDIA_INPUT_BYTES");
var adapter = (r) => isUnity(typeof r === "string" ? r : r?.taskType) ? pool_task_exports : registered_tasks_exports;
var inspectTaskRequest3 = (r) => adapter(r).inspectTaskRequest(r);
var kernelInfo3 = (r) => adapter(r).kernelInfo(r);
var transferTaskResult3 = (r) => r?.kind?.startsWith("unity-") ? [] : transferTaskResult(r);
var prepareTaskModule3 = (o) => adapter(o).prepareTaskModule(o);
var instantiateTask3 = (r, m) => adapter(r).instantiateTask(r, m);
var executeTask3 = (r, k) => adapter(r).executeTask(r, k);
var taskInputCount3 = (r, v) => adapter(r).taskInputCount(r, v);

// ../../scratch/a12324e000fc/pages-unity-b1/docs/shared/compute/pool-worker.mjs
var workerId = crypto.randomUUID();
var bootEpochMs = performance.timeOrigin + performance.now();
var received = false;
var pending = null;
var matching = (identity, data) => ["protocolVersion", "buildId", "taskType", "taskVersion", "jobId", "inputRevision", "generation"].every((key) => data[key] === identity[key]);
self.onmessage = async ({ data }) => {
  if (data?.type === "start") {
    if (pending && matching(pending.identity, data)) {
      const run = pending.run;
      pending = null;
      await run();
    }
    return;
  }
  if (received) return;
  received = true;
  const identity = { protocolVersion: 1, buildId: BUILD_ID, taskType: data?.taskType, taskVersion: data?.taskVersion, jobId: data?.jobId, inputRevision: data?.inputRevision, generation: data?.generation, workerId, ...data?.taskType !== "ft-magnitude-batch" ? { wasmVariant: data?.wasmVariant, kernelHash: data?.kernelHash } : {} };
  const started = performance.now();
  let kernel = null, request = null;
  const cleanup = () => {
    pending = null;
    kernel?.dispose?.();
    kernel = null;
    request = null;
    self.onmessage = null;
  };
  const fail = (error) => {
    self.postMessage({ ...identity, type: "error", message: String(error?.message ?? error).slice(0, 240) });
    cleanup();
  };
  try {
    if (data?.buildId !== BUILD_ID || !Number.isSafeInteger(data?.generation) || data.generation < 1 || data.startTogether !== void 0 && typeof data.startTogether !== "boolean") throw Error("Invalid worker identity/options");
    request = inspectTaskRequest3(data);
    const info = kernelInfo3(request);
    if (request.taskType !== "ft-magnitude-batch" && data.kernelHash !== info.sha256) throw Error("Kernel identity mismatch");
    self.postMessage({ ...identity, type: "phase", phase: "loading", bootEpochMs });
    let compileCalls = 0, wasmContentType = null;
    const startTogether = data.startTogether === true, needsWasm = info.requiresWasm !== false;
    const module = needsWasm ? data.module ?? await prepareTaskModule3({ taskType: request.taskType, wasmVariant: request.wasmVariant, onCompile: () => compileCalls++, onResponse: (value2) => {
      wasmContentType = value2;
    } }) : null;
    kernel = needsWasm ? instantiateTask3(request, module) : null;
    const preparedAt = performance.now();
    const compute = async () => {
      try {
        const computeStart = performance.now();
        self.postMessage({ ...identity, type: "phase", phase: "computing", instanceId: kernel?.instanceId ?? null, bootEpochMs });
        const result = await executeTask3(request, kernel), transfer = transferTaskResult3(result);
        const computeEnd = performance.now();
        self.postMessage({ ...identity, type: "result", instanceId: kernel?.instanceId ?? null, result, metrics: { buildId: BUILD_ID, wasmSha256: info.sha256, wasmVariant: info.variant, kernelAbi: info.abi, wasmContentType, bootEpochMs, loadMs: preparedAt - started, readyWaitMs: startTogether ? computeStart - preparedAt : 0, startTogether, computeMs: computeEnd - computeStart, computeStartEpochMs: performance.timeOrigin + computeStart, computeEndEpochMs: performance.timeOrigin + computeEnd, memoryBytes: kernel?.memory.buffer.byteLength ?? null, wasmNotApplicable: needsWasm ? null : "JavaScript parsing task", inputCount: taskInputCount3(request, result), compileCalls, moduleReuse: needsWasm && data.module instanceof WebAssembly.Module, arena: kernel?.resourceStats?.() ?? null, memoryMeasurement: null } }, transfer);
        cleanup();
      } catch (error) {
        fail(error);
      }
    };
    if (startTogether) {
      pending = { identity, run: compute };
      self.postMessage({ ...identity, type: "phase", phase: "ready", instanceId: kernel?.instanceId ?? null, bootEpochMs });
    } else await compute();
  } catch (error) {
    fail(error);
  }
};
