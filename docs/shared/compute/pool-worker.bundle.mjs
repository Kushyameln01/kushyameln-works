var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../pages-adjustment/docs/shared/compute/protocol.mjs
var BUILD_ID = "compute-unity-b5";
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

// ../pages-adjustment/docs/shared/compute/registered-tasks.mjs
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

// ../pages-adjustment/docs/shared/compute/kernel.mjs
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

// ../pages-adjustment/docs/shared/compute/registered-tasks.mjs
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

// ../pages-adjustment/docs/shared/unity-analysis/pool-task.mjs
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

// ../pages-adjustment/docs/shared/unity-analysis/model.mjs
var SCHEMA = "unity-analysis-snapshot/1";
var ANALYZER_VERSION = "unity-analysis-0.3.1";
var RULES_VERSION = "unity-static-3";
var TYPES = Object.freeze({ Unknown: 0, Float: 1, Int: 2, Bool: 3, Trigger: 4 });
var LIMITS = Object.freeze({ maxFiles: 4096, maxObjects: 65536, maxEdges: 262144, maxProperties: 262144, maxInputBytes: 4 * 1024 * 1024, maxReportBytes: 8 * 1024 * 1024, maxDiffPairs: 262144, maxOwnerContexts: 262144, maxGraphSteps: 2e6 });
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
function normalizeAssetId(value2) {
  boundedText(value2, 1100);
  return /^[0-9a-fA-F]{32}$/.test(value2) ? guid(value2) : value2;
}
function fileAssetId(file) {
  return file.guid == null ? `input:${file.path}` : guid(file.guid);
}
function safePath(path) {
  if (typeof path !== "string" || !path || path.length > 1024 || /[\\\x00-\x1f]/.test(path) || path.startsWith("/") || path.split("/").some((x) => !x || x === "." || x === "..") || path.includes(":")) throw TypeError("Unsafe relative input path");
  return path;
}
function boundedText(v, max2 = 1024) {
  if (typeof v !== "string" || v.length > max2) throw TypeError("Invalid text field");
  return v;
}
function value(v, depth = 0, counter = { n: 0 }) {
  if (++counter.n > LIMITS.maxProperties) throw RangeError("PROPERTY_COUNT_LIMIT");
  if (depth > 64) throw RangeError("Property depth limit");
  if (v === null || typeof v === "string" || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
  if (Array.isArray(v)) {
    for (const x of v) value(x, depth + 1, counter);
    return;
  }
  if (plain(v)) {
    for (const [k, x] of Object.entries(v)) {
      boundedText(k);
      value(x, depth + 1, counter);
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
  const valueCounter = { n: 0 };
  for (const f of input.files) {
    if (!plain(f)) throw TypeError("Invalid file");
    safePath(f.path);
    if (f.guid != null) guid(f.guid);
    if (f.coverage != null && !["structured-input", "serialized", "partial", "opaque", "meta-only"].includes(f.coverage)) throw TypeError("Invalid coverage state");
    if (!Array.isArray(f.objects)) throw TypeError("File objects required");
    if (f.issues != null) {
      if (!Array.isArray(f.issues)) throw TypeError("Invalid file issues");
      for (const issue of f.issues) {
        if (!plain(issue) || Object.keys(issue).some((k) => !["code", "message", "source", "relatedSources", "propertyPath"].includes(k))) throw TypeError("Invalid file issue fields");
        boundedText(issue.code, 128);
        boundedText(issue.message, 4096);
        sourcePosition(issue.source);
        if (issue.propertyPath != null) boundedText(issue.propertyPath);
        if (issue.relatedSources != null) {
          if (!Array.isArray(issue.relatedSources)) throw TypeError("Invalid issue sources");
          for (const src of issue.relatedSources) sourcePosition(src);
        }
      }
    }
    if (f.contentHash != null && !/^[0-9a-f]{64}$/.test(f.contentHash)) throw TypeError("Invalid SHA256");
    objects += f.objects.length;
    for (const o of f.objects) {
      if (!plain(o)) throw TypeError("Invalid object");
      fileId(o.fileId, { zero: false });
      sourcePosition(o.source);
      if (o.propertySources != null) {
        if (!plain(o.propertySources)) throw TypeError("Invalid property sources");
        for (const [path, source] of Object.entries(o.propertySources)) {
          boundedText(path);
          sourcePosition(source);
        }
      }
      boundedText(o.classId ?? "", 32);
      if (!plain(o.properties ?? {})) throw TypeError("Properties map required");
      value(o.properties ?? {}, 0, valueCounter);
      properties += Object.keys(o.properties ?? {}).length;
      for (const r of o.references ?? []) {
        boundedText(r.property);
        sourcePosition(r.source);
        fileId(r.fileId);
        if (r.guid != null) guid(r.guid);
        edges++;
      }
      for (const p of o.parameters ?? []) {
        sourcePosition(p.source);
        if (p.domain != null && !["animator", "vrchat-expression"].includes(p.domain)) throw TypeError("Invalid parameter domain");
        boundedText(p.name);
        if (!own(TYPES, p.type)) throw TypeError("Unknown parameter type tag");
      }
      for (const u of o.parameterUses ?? []) {
        boundedText(u.name);
        sourcePosition(u.source);
        boundedText(u.rule ?? "supplied-rule");
        if (!Array.isArray(u.allowedTypes) || u.allowedTypes.some((t) => !own(TYPES, t) || t === "Unknown")) throw TypeError("Invalid allowed types");
        if (u.domain != null && u.domain !== "animator") throw TypeError("Invalid use domain");
        if (u.scope) {
          boundedText(u.scope.assetId, 1100);
          fileId(u.scope.fileId, { zero: false });
        }
        if (u.scopeFileId != null) fileId(u.scopeFileId, { zero: false });
      }
    }
  }
  if (input.parameterLinks != null) {
    if (!Array.isArray(input.parameterLinks) || input.parameterLinks.length > 4096) throw RangeError("PARAMETER_LINK_LIMIT");
    for (const link of input.parameterLinks) for (const side of ["expression", "controller"]) {
      boundedText(link[side]?.assetId, 1100);
      fileId(link[side]?.fileId, { zero: false });
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
    const assetId = fileAssetId(f);
    const entry = { ...f, assetId, inputFileIndex: fi, nodes: /* @__PURE__ */ new Map() };
    const byAsset = assetMap.get(assetId) ?? [];
    byAsset.push(entry);
    assetMap.set(assetId, byAsset);
    if (f.guid) guidMap.set(assetId, byAsset);
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

// ../pages-adjustment/docs/shared/unity-analysis/analysis.mjs
var builtin = (g) => /^0{16}[def]0{15}$/i.test(g ?? "");
var withoutSources = (value2) => Array.isArray(value2) ? value2.map(withoutSources) : value2 && typeof value2 === "object" ? Object.fromEntries(Object.entries(value2).filter(([k]) => k !== "source").map(([k, v]) => [k, withoutSources(v)])) : value2;
var pointer = (k) => String(k).replaceAll("~", "~0").replaceAll("/", "~1");
var keyOf = (assetId, fileId2) => `${normalizeAssetId(assetId)}:${fileId2}`;
var referenceValues = (references) => references.map(({ source, ...r }) => ({ ...r, ...r.guid != null ? { guid: guid(r.guid) } : {} }));
var useValues = (uses) => withoutSources(uses.map((u) => u.scope ? { ...u, scope: { ...u.scope, assetId: normalizeAssetId(u.scope.assetId) } } : u));
function graphComponents(nodes, edges) {
  const out = nodes.map(() => []), rev2 = nodes.map(() => []);
  for (const [a, b] of edges) {
    out[a].push(b);
    rev2[b].push(a);
  }
  let steps = 0;
  const step = () => {
    if (++steps > LIMITS.maxGraphSteps) throw RangeError("GRAPH_STEP_LIMIT");
  };
  const seen = /* @__PURE__ */ new Set(), order = [];
  for (let start = 0; start < nodes.length; start++) {
    if (seen.has(start)) continue;
    seen.add(start);
    const stack = [[start, 0]];
    while (stack.length) {
      step();
      const top = stack[stack.length - 1], next = out[top[0]][top[1]++];
      if (next === void 0) {
        order.push(top[0]);
        stack.pop();
      } else if (!seen.has(next)) {
        seen.add(next);
        stack.push([next, 0]);
      }
    }
  }
  seen.clear();
  const cycles = [];
  for (let p = order.length - 1; p >= 0; p--) {
    const start = order[p];
    if (seen.has(start)) continue;
    const members = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      step();
      const n = stack.pop();
      members.push(n);
      for (const next of rev2[n]) {
        step();
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    if (members.length > 1 || out[start].includes(start)) cycles.push({ kind: "strongly-connected-component", nodes: members.sort((a, b) => a - b).map((i) => ({ assetId: nodes[i].assetId, fileId: nodes[i].fileId, path: nodes[i].file.path })), meaning: "A directed cycle exists; not an enumeration of every elementary cycle" });
  }
  return cycles;
}
function analyzeSnapshot(input, kernel) {
  const index = buildIndex(input), { nodes, assetMap, guidMap } = index, findings = [...index.findings], references = [], targets = [], targetSources = /* @__PURE__ */ new Map(), edges = [], ownerEdges = nodes.map(() => []);
  for (const f of input.files) for (const issue of f.issues ?? []) findings.push({ code: issue.code, message: issue.message, source: { ...sourcePosition(issue.source), path: f.path }, relatedSources: issue.relatedSources ?? [], propertyPath: issue.propertyPath ?? null, category: "coverage", severity: "warning", confidence: "input-reported", path: f.path });
  for (const n of nodes) for (const r of n.references ?? []) {
    const reference = { source: { ...n.source, ...sourcePosition(r.source), property: r.property }, assetId: n.assetId, fileId: r.fileId, guid: r.guid ?? null, property: r.property, role: r.role ?? "reference", state: null, targetIndex: null };
    if (r.fileId === "0") reference.state = "null";
    else if (builtin(r.guid)) reference.state = "builtin-unverified";
    else {
      const candidates = r.guid ? guidMap.get(guid(r.guid)) : assetMap.get(n.assetId);
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
          edges.push([n.index, found[0].index]);
          if (r.role === "animator-owner") ownerEdges[n.index].push(found[0].index);
          const refs = targetSources.get(found[0].index) ?? [];
          refs.push(reference.source);
          targetSources.set(found[0].index, refs);
        } else if (file.coverage === "opaque" || file.coverage === "partial") reference.state = "unparsed-target";
        else reference.state = r.guid ? "missing-target-object" : "missing-local";
      }
    }
    references.push(reference);
    if (!["null", "resolved"].includes(reference.state)) findings.push({ code: reference.state.startsWith("missing-") ? "MISSING_REFERENCE" : "REFERENCE_UNRESOLVED", category: "reference", severity: reference.state.startsWith("missing-") ? "error" : "warning", confidence: reference.state.startsWith("missing-") ? "confirmed" : "unverified", ...reference });
  }
  const counts = kernel.incoming(Int32Array.from(targets), nodes.length), shared = [];
  for (const n of nodes) if (counts[n.index] > 1) shared.push({ assetId: n.assetId, fileId: n.fileId, path: n.file.path, incoming: counts[n.index], sources: targetSources.get(n.index) ?? [] });
  const cycles = graphComponents(nodes, edges), owners = nodes.map(() => /* @__PURE__ */ new Set());
  let ownerCount = 0, steps = 0;
  for (const controller of nodes.filter((n) => n.classId === "91")) {
    const stack = [controller.index], seen = /* @__PURE__ */ new Set();
    while (stack.length) {
      if (++steps > LIMITS.maxGraphSteps) throw RangeError("GRAPH_STEP_LIMIT");
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      if (++ownerCount > LIMITS.maxOwnerContexts) throw RangeError("OWNER_CONTEXT_LIMIT");
      owners[id].add(controller.key);
      for (const target of ownerEdges[id]) stack.push(target);
    }
  }
  const declarations = [], declarationMap = /* @__PURE__ */ new Map(), checks = [], actual = [], allowed = [];
  for (const n of nodes) for (const p of n.parameters ?? []) {
    const domain = p.domain ?? "animator", d = { ...p, domain, scope: n.key, source: { ...n.source, ...sourcePosition(p.source) } };
    declarations.push(d);
    const key = JSON.stringify([domain, n.key, p.name]);
    const matches = declarationMap.get(key) ?? [];
    matches.push(d);
    declarationMap.set(key, matches);
  }
  for (const ds of declarationMap.values()) if (ds.length > 1) findings.push({ code: new Set(ds.map((d) => d.type)).size > 1 ? "PARAMETER_CONFLICTING_DECLARATION" : "PARAMETER_DUPLICATE_DECLARATION", category: "parameter", severity: "warning", confidence: "confirmed", name: ds[0].name, scope: ds[0].scope, declarations: ds });
  for (const n of nodes) for (const u of n.parameterUses ?? []) {
    const scopes = u.scope ? [keyOf(u.scope.assetId, u.scope.fileId)] : u.scopeFileId ? [keyOf(n.assetId, u.scopeFileId)] : u.unowned ? [...owners[n.index]] : [n.key];
    if (!scopes.length) scopes.push(null);
    for (const scope of scopes) {
      if (checks.length >= LIMITS.maxOwnerContexts) throw RangeError("OWNER_CONTEXT_LIMIT");
      const ds = scope ? declarationMap.get(JSON.stringify([u.domain ?? "animator", scope, u.name])) ?? [] : [], type = ds.length === 1 ? ds[0].type : "Unknown";
      actual.push(u.allowedTypes.length ? TYPES[type] : 0);
      allowed.push(u.allowedTypes.reduce((m, t) => m | 1 << TYPES[t], 0));
      checks.push({ name: u.name, domain: u.domain ?? "animator", declared: type, required: u.allowedTypes, rule: u.rule ?? "supplied-rule", ruleBasis: u.ruleBasis ?? null, scope, source: { ...n.source, ...sourcePosition(u.source), property: u.property ?? null }, declarationCount: ds.length });
    }
  }
  const verdicts = kernel.types(Int32Array.from(actual), Int32Array.from(allowed));
  for (let i = 0; i < checks.length; i++) {
    checks[i].verdict = ["unknown", "compatible", "incompatible"][verdicts[i]];
    if (verdicts[i] !== 1) findings.push({ code: verdicts[i] === 2 ? "PARAMETER_TYPE_CONSTRAINT" : checks[i].declarationCount > 1 ? "PARAMETER_AMBIGUOUS" : "PARAMETER_UNRESOLVED", category: "parameter", severity: verdicts[i] === 2 ? "error" : "warning", confidence: verdicts[i] === 2 ? "confirmed" : "unverified", ...checks[i] });
  }
  const conversions = [];
  for (const link of input.parameterLinks ?? []) {
    const expression = keyOf(link.expression.assetId, link.expression.fileId), controller = keyOf(link.controller.assetId, link.controller.fileId);
    const expr = declarations.filter((d) => d.scope === expression && d.domain === "vrchat-expression");
    if (!expr.length) findings.push({ code: "EXPRESSION_CONTEXT_UNRESOLVED", category: "parameter", severity: "warning", confidence: "unverified", expression, controller });
    for (const e of expr) {
      const ds = declarationMap.get(JSON.stringify(["animator", controller, e.name])) ?? [], supported = ["Int", "Float", "Bool"];
      const state = ds.length !== 1 || e.type === "Unknown" || ds[0].type === "Unknown" || (declarationMap.get(JSON.stringify(["vrchat-expression", expression, e.name])) ?? []).length !== 1 ? "unknown" : ds[0].type === e.type ? "same-type" : supported.includes(ds[0].type) && supported.includes(e.type) ? "permitted-conversion" : "incompatible";
      if (conversions.length >= LIMITS.maxOwnerContexts) throw RangeError("OWNER_CONTEXT_LIMIT");
      conversions.push({ name: e.name, expression, controller, from: e.type, to: ds.length === 1 ? ds[0].type : "Unknown", state, association: "explicit-input-context", source: e.source, basis: "https://creators.vrchat.com/avatars/animator-parameters/#mismatched-parameter-type-conversion" });
    }
  }
  const coverage = { files: input.files.length, objects: nodes.length, opaqueFiles: input.files.filter((f) => f.coverage === "opaque").map((f) => f.path), partialFiles: input.files.filter((f) => f.coverage === "partial").map((f) => ({ path: f.path, reason: f.reason ?? "unsupported syntax" })), source: !input.files.length || input.files.some((f) => !f.coverage || f.coverage === "structured-input") ? "caller-supplied schema" : "serialized-input", unresolvedReferences: references.filter((r) => !["null", "resolved"].includes(r.state)).length, unknownParameterChecks: checks.filter((c) => c.verdict === "unknown").length };
  return { kind: "unity-analysis", schemaVersion: 1, analyzerVersion: ANALYZER_VERSION, ruleSetVersion: RULES_VERSION, snapshotId: input.snapshotId ?? "snapshot", files: input.files.map((f) => ({ path: f.path, guid: f.guid ?? null, contentHash: f.contentHash ?? null, contentHashProvenance: "caller-provided at snapshot boundary; raw-byte verification, when available, is in report.ingestion", coverage: f.coverage ?? "structured-input", reason: f.reason ?? null, issues: f.issues ?? [], byteLength: f.byteLength ?? null, metadata: f.meta ?? null, unparsedDocuments: f.unparsedDocuments ?? [], rawText: f.rawText ?? null })), objects: nodes.map((n) => ({ assetId: n.assetId, fileId: n.fileId, classId: n.classId, rootType: n.rootType ?? null, source: n.source, properties: n.properties ?? {}, propertySources: n.propertySources ?? {}, coverage: n.coverage ?? n.file.coverage ?? "structured-input", rawText: n.rawText ?? null })), coverage, references, parameters: { declarations, checks, conversions }, shared, cycles, findings, completeness: { totalCount: findings.length, returnedCount: findings.length, truncated: false }, counts: { files: input.files.length, objects: nodes.length, references: references.length, shared: shared.length, cycles: cycles.length, findings: findings.length } };
}
function leaves(value2, path = "", result = /* @__PURE__ */ new Map()) {
  if (value2 && typeof value2 === "object" && Object.keys(value2).length) {
    for (const [k, v] of Object.entries(value2)) leaves(v, path + "/" + pointer(k), result);
  } else result.set(path, value2);
  return result;
}
function structures(value2, path = "", result = /* @__PURE__ */ new Map()) {
  if (value2 && typeof value2 === "object") {
    result.set(path, Array.isArray(value2) ? "array" : "object");
    for (const [k, v] of Object.entries(value2)) structures(v, path + "/" + pointer(k), result);
  }
  return result;
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
      changes.push({ kind: bn ? "object-removed" : "object-added", identity: key, source: (bn ?? an).source, matching: (bn ?? an).file.guid ? "exact-guid-fileID" : "provisional-input-path-fileID", before: bn?.properties ?? null, after: an?.properties ?? null });
      continue;
    }
    const domains = [["property", leaves(bn.properties ?? {}), leaves(an.properties ?? {})], ["structure", structures(bn.properties ?? {}), structures(an.properties ?? {})], ["metadata", /* @__PURE__ */ new Map([["classId", bn.classId]]), /* @__PURE__ */ new Map([["classId", an.classId]])], ["references", /* @__PURE__ */ new Map([["references", referenceValues(bn.references ?? [])]]), /* @__PURE__ */ new Map([["references", referenceValues(an.references ?? [])]])], ["parameters", /* @__PURE__ */ new Map([["declarations", withoutSources(bn.parameters ?? [])], ["uses", useValues(bn.parameterUses ?? [])]]), /* @__PURE__ */ new Map([["declarations", withoutSources(an.parameters ?? [])], ["uses", useValues(an.parameterUses ?? [])]])]];
    for (const [domain, bp, ap] of domains) for (const property of /* @__PURE__ */ new Set([...bp.keys(), ...ap.keys()])) {
      if (pairs.length >= LIMITS.maxDiffPairs) throw RangeError("DIFF_PAIR_LIMIT");
      const presentB = bp.has(property), presentA = ap.has(property);
      pairs.push({ domain, kind: !presentB ? "property-added" : !presentA ? "property-removed" : "property-changed", identity: key, property, before: presentB ? bp.get(property) : null, after: presentA ? ap.get(property) : null, beforePresent: presentB, afterPresent: presentA, beforeSource: { ...bn.source, ...bn.propertySources?.[property] ?? {} }, source: { ...an.source, ...an.propertySources?.[property] ?? {} }, matching: an.file.guid ? "exact-guid-fileID" : "provisional-input-path-fileID" });
      bv.push(presentB ? id(bp.get(property)) : 0);
      av.push(presentA ? id(ap.get(property)) : 0);
    }
  }
  const diffs = kernel.diff(Int32Array.from(bv), Int32Array.from(av));
  for (let i = 0; i < diffs.length; i++) if (diffs[i]) changes.push(pairs[i]);
  const fileChanges = [], fm = (files) => {
    const m = /* @__PURE__ */ new Map();
    for (const f of files) {
      const k = fileAssetId(f), v = m.get(k) ?? [];
      v.push(f);
      m.set(k, v);
    }
    return m;
  }, bf = fm(before.files), af = fm(after.files);
  for (const key of /* @__PURE__ */ new Set([...bf.keys(), ...af.keys()])) {
    const bs = bf.get(key) ?? [], as = af.get(key) ?? [];
    if (bs.length > 1 || as.length > 1) {
      ambiguous.push({ kind: "file-identity", identity: key, beforeCount: bs.length, afterCount: as.length });
      continue;
    }
    const f = bs[0], g = as[0];
    if (!f || !g) fileChanges.push({ kind: f ? "file-removed" : "file-added", identity: key, pathBefore: f?.path ?? null, pathAfter: g?.path ?? null });
    else {
      if (f.path !== g.path) fileChanges.push({ kind: "file-renamed", identity: key, pathBefore: f.path, pathAfter: g.path });
      if (f.contentHash && g.contentHash && f.contentHash !== g.contentHash) fileChanges.push({ kind: "raw-bytes-changed", identity: key, pathBefore: f.path, pathAfter: g.path, beforeHash: f.contentHash, afterHash: g.contentHash });
    }
  }
  return { kind: "unity-diff", changes, ambiguous, fileChanges, completeness: { totalCount: changes.length, returnedCount: changes.length, truncated: false }, identityPolicy: "GUID/fileID exact; missing GUID uses explicit provisional input path; no heuristic remapping" };
}

// ../pages-adjustment/docs/shared/unity-analysis/kernel/registry.mjs
var UNITY_KERNEL = Object.freeze({ key: "hike-unity-i32-v1:e7c1049626826d3dabe2f53a7935efa69cd6f2cfa85fa11375b7bdd877088520:scalar", variant: "scalar", abi: "hike-unity-i32-v1", sha256: "e7c1049626826d3dabe2f53a7935efa69cd6f2cfa85fa11375b7bdd877088520", url: new URL("../unity-analysis/kernel/unity-analysis.wasm", import.meta.url).href });

// ../pages-adjustment/docs/shared/unity-analysis/kernel/kernel.mjs
var MAX_VECTOR = 262144;
var MAX_MEMORY = 16777216;
var PAGE_BYTES = 65536;
var typedPrototype = Object.getPrototypeOf(Int32Array.prototype);
var typedGet = Object.fromEntries(["length", "buffer", "byteOffset", "byteLength"].map((key) => [key, Object.getOwnPropertyDescriptor(typedPrototype, key).get]));
var typed = (value2, key) => Reflect.apply(typedGet[key], value2, []);
var integer = (value2, min, max2) => Number.isSafeInteger(value2) && value2 >= min && value2 <= max2;
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
  function values(v, min, max2, code) {
    for (let i = 0; i < v.length; i++) if (!integer(v.data[i], min, max2)) throw RangeError(code);
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

// ../pages-adjustment/docs/shared/unity-analysis/pool-task.mjs
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
  if (bytes(r.payload) > LIMITS.maxInputBytes * (r.taskType === "unity-diff" ? 2 : 1)) throw RangeError("Unity task input budget");
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

// ../pages-adjustment/docs/shared/unity-analysis/ingest-task.mjs
var ingest_task_exports = {};
__export(ingest_task_exports, {
  PARSER_VERSION: () => PARSER_VERSION,
  PARSE_BATCH_LIMITS: () => PARSE_BATCH_LIMITS,
  executeTask: () => executeTask3,
  freezeTaskResult: () => freezeTaskResult3,
  inputBytes: () => inputBytes3,
  inspectTaskRequest: () => inspectTaskRequest3,
  instantiateTask: () => instantiateTask3,
  isIngest: () => isIngest,
  kernelInfo: () => kernelInfo3,
  prepareTaskModule: () => prepareTaskModule3,
  resultBytes: () => resultBytes3,
  resultShape: () => resultShape3,
  snapshotTaskRequest: () => snapshotTaskRequest3,
  taskInputCount: () => taskInputCount3,
  transferTaskInput: () => transferTaskInput3,
  transferTaskResult: () => transferTaskResult3,
  validTaskResult: () => validTaskResult3
});

// ../pages-adjustment/docs/shared/ft/vendor/fflate.mjs
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
var revfd = _b.r;
var rev = new u16(32768);
for (i = 0; i < 32768; ++i) {
  x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var x;
var i;
var hMap = (function(cd, mb, r) {
  var s = cd.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd[i])
      ++l[cd[i] - 1];
  }
  var le = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le[i] = le[i - 1] + l[i - 1] << 1;
  }
  var co;
  if (r) {
    co = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        var sv = i << 4 | cd[i];
        var r_1 = mb - cd[i];
        var v = le[cd[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd[i]) {
        co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
      }
    }
  }
  return co;
});
var flt = new u8(288);
for (i = 0; i < 144; ++i)
  flt[i] = 8;
var i;
for (i = 144; i < 256; ++i)
  flt[i] = 9;
var i;
for (i = 256; i < 280; ++i)
  flt[i] = 7;
var i;
for (i = 280; i < 288; ++i)
  flt[i] = 8;
var i;
var fdt = new u8(32);
for (i = 0; i < 32; ++i)
  fdt[i] = 5;
var i;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt)
    throw e;
  return e;
};
var inflt = function(dat, st, buf, dict) {
  var sl = dat.length, dl = dict ? dict.length : 0;
  if (!sl || st.f && !st.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st.i != 2;
  var noSt = st.i;
  if (noBuf)
    buf = new u8(sl * 3);
  var cbuf = function(l2) {
    var bl = buf.length;
    if (l2 > bl) {
      var nbuf = new u8(Math.max(bl * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
  var tbts = sl * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + l);
        buf.set(dat.subarray(s, t), bt);
        st.b = bt += l, st.p = pos = t * 8, st.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
        lbt = max(lt);
        dbt = max(dt);
        lm = hMap(lt, lbt, 1);
        dm = hMap(dt, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt + 131072);
        var end = bt + add;
        if (bt < dt) {
          var shift = dl - dt, dend = Math.min(dt, end);
          if (shift + bt < 0)
            err(3);
          for (; bt < dend; ++bt)
            buf[bt] = dict[shift + bt];
        }
        for (; bt < end; ++bt)
          buf[bt] = buf[bt - dt];
      }
    }
    st.l = lm, st.p = lpos, st.b = bt, st.f = final;
    if (lm)
      final = 1, st.m = lbt, st.d = dm, st.n = dbt;
  } while (!final);
  return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var gzs = function(d) {
  if (d[0] != 31 || d[1] != 139 || d[2] != 8)
    err(6, "invalid gzip data");
  var flg = d[3];
  var st = 10;
  if (flg & 4)
    st += (d[10] | d[11] << 8) + 2;
  for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
    ;
  return st + (flg & 2);
};
var Inflate = /* @__PURE__ */ (function() {
  function Inflate2(opts, cb) {
    if (typeof opts == "function")
      cb = opts, opts = {};
    this.ondata = cb;
    var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
    this.s = { i: 0, b: dict ? dict.length : 0 };
    this.o = new u8(32768);
    this.p = new u8(0);
    if (dict)
      this.o.set(dict);
  }
  Inflate2.prototype.e = function(c) {
    if (!this.ondata)
      err(5);
    if (this.d)
      err(4);
    if (!this.p.length)
      this.p = c;
    else if (c.length) {
      var n = new u8(this.p.length + c.length);
      n.set(this.p), n.set(c, this.p.length), this.p = n;
    }
  };
  Inflate2.prototype.c = function(final) {
    this.s.i = +(this.d = final || false);
    var bts = this.s.b;
    var dt = inflt(this.p, this.s, this.o);
    this.ondata(slc(dt, bts, this.s.b), this.d);
    this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
    this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
  };
  Inflate2.prototype.push = function(chunk, final) {
    this.e(chunk), this.c(final);
  };
  return Inflate2;
})();
var Gunzip = /* @__PURE__ */ (function() {
  function Gunzip2(opts, cb) {
    this.v = 1;
    this.r = 0;
    Inflate.call(this, opts, cb);
  }
  Gunzip2.prototype.push = function(chunk, final) {
    Inflate.prototype.e.call(this, chunk);
    this.r += chunk.length;
    if (this.v) {
      var p = this.p.subarray(this.v - 1);
      var s = p.length > 3 ? gzs(p) : 4;
      if (s > p.length) {
        if (!final)
          return;
      } else if (this.v > 1 && this.onmember) {
        this.onmember(this.r - p.length);
      }
      this.p = p.subarray(s), this.v = 0;
    }
    Inflate.prototype.c.call(this, final);
    if (this.s.f && !this.s.l && !final) {
      this.v = shft(this.s.p) + 9;
      this.s = { i: 0 };
      this.o = new u8(0);
      this.push(new u8(0), final);
    }
  };
  return Gunzip2;
})();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
var UnzipPassThrough = /* @__PURE__ */ (function() {
  function UnzipPassThrough2() {
  }
  UnzipPassThrough2.prototype.push = function(data, final) {
    this.ondata(null, data, final);
  };
  UnzipPassThrough2.compression = 0;
  return UnzipPassThrough2;
})();
var UnzipInflate = /* @__PURE__ */ (function() {
  function UnzipInflate2() {
    var _this = this;
    this.i = new Inflate(function(dat, final) {
      _this.ondata(null, dat, final);
    });
  }
  UnzipInflate2.prototype.push = function(data, final) {
    try {
      this.i.push(data, final);
    } catch (e) {
      this.ondata(e, null, final);
    }
  };
  UnzipInflate2.compression = 8;
  return UnzipInflate2;
})();
var Unzip = /* @__PURE__ */ (function() {
  function Unzip2(cb) {
    this.onfile = cb;
    this.k = [];
    this.o = {
      0: UnzipPassThrough
    };
    this.p = et;
  }
  Unzip2.prototype.push = function(chunk, final) {
    var _this = this;
    if (!this.onfile)
      err(5);
    if (!this.p)
      err(4);
    if (this.c > 0) {
      var len = Math.min(this.c, chunk.length);
      var toAdd = chunk.subarray(0, len);
      this.c -= len;
      if (this.d)
        this.d.push(toAdd, !this.c);
      else
        this.k[0].push(toAdd);
      chunk = chunk.subarray(len);
      if (chunk.length)
        return this.push(chunk, final);
    } else {
      var f = 0, i = 0, is = void 0, buf = void 0;
      if (!this.p.length)
        buf = chunk;
      else if (!chunk.length)
        buf = this.p;
      else {
        buf = new u8(this.p.length + chunk.length);
        buf.set(this.p), buf.set(chunk, this.p.length);
      }
      var l = buf.length, oc = this.c, add = oc && this.d;
      var _loop_2 = function() {
        var _a2;
        var sig = b4(buf, i);
        if (sig == 67324752) {
          f = 1, is = i;
          this_1.d = null;
          this_1.c = 0;
          var bf = b2(buf, i + 6), cmp_1 = b2(buf, i + 8), u = bf & 2048, dd = bf & 8, fnl = b2(buf, i + 26), es = b2(buf, i + 28);
          if (l > i + 30 + fnl + es) {
            var chks_3 = [];
            this_1.k.unshift(chks_3);
            f = 2;
            var sc_1 = b4(buf, i + 18), su_1 = b4(buf, i + 22);
            var fn_1 = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u);
            if (sc_1 == 4294967295) {
              _a2 = dd ? [-2] : z64e(buf, i), sc_1 = _a2[0], su_1 = _a2[1];
            } else if (dd)
              sc_1 = -1;
            i += es;
            this_1.c = sc_1;
            var d_1;
            var file_1 = {
              name: fn_1,
              compression: cmp_1,
              start: function() {
                if (!file_1.ondata)
                  err(5);
                if (!sc_1)
                  file_1.ondata(null, et, true);
                else {
                  var ctr = _this.o[cmp_1];
                  if (!ctr)
                    file_1.ondata(err(14, "unknown compression type " + cmp_1, 1), null, false);
                  d_1 = sc_1 < 0 ? new ctr(fn_1) : new ctr(fn_1, sc_1, su_1);
                  d_1.ondata = function(err2, dat3, final2) {
                    file_1.ondata(err2, dat3, final2);
                  };
                  for (var _i = 0, chks_4 = chks_3; _i < chks_4.length; _i++) {
                    var dat2 = chks_4[_i];
                    d_1.push(dat2, false);
                  }
                  if (_this.k[0] == chks_3 && _this.c)
                    _this.d = d_1;
                  else
                    d_1.push(et, true);
                }
              },
              terminate: function() {
                if (d_1 && d_1.terminate)
                  d_1.terminate();
              }
            };
            if (sc_1 >= 0)
              file_1.size = sc_1, file_1.originalSize = su_1;
            this_1.onfile(file_1);
          }
          return "break";
        } else if (oc) {
          if (sig == 134695760) {
            is = i += 12 + (oc == -2 && 8), f = 3, this_1.c = 0;
            return "break";
          } else if (sig == 33639248) {
            is = i -= 4, f = 3, this_1.c = 0;
            return "break";
          }
        }
      };
      var this_1 = this;
      for (; i < l - 4; ++i) {
        var state_1 = _loop_2();
        if (state_1 === "break")
          break;
      }
      this.p = et;
      if (oc < 0) {
        var dat = f ? buf.subarray(0, is - 12 - (oc == -2 && 8) - (b4(buf, is - 16) == 134695760 && 4)) : buf.subarray(0, i);
        if (add)
          add.push(dat, !!f);
        else
          this.k[+(f == 2)].push(dat);
      }
      if (f & 2)
        return this.push(buf.subarray(i), final);
      this.p = buf.subarray(i);
    }
    if (final) {
      if (this.c)
        err(13);
      this.p = null;
    }
  };
  Unzip2.prototype.register = function(decoder3) {
    this.o[decoder3.compression] = decoder3;
  };
  return Unzip2;
})();

// ../pages-adjustment/docs/shared/unity-analysis/package-reader.mjs
var MAX_UNITY_PACKAGE_BYTES = 64 * 1024 * 1024;
var BLOCK = 512;
var POSIX_MAGIC = "ustar\x0000";
var encoder = new TextEncoder();
var decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
var GUID = /^[0-9a-f]{32}$/;
var children = /* @__PURE__ */ new Set(["asset", "asset.meta", "pathname", "preview.png"]);
var crcTable = Uint32Array.from({ length: 256 }, (_, value2) => {
  for (let i = 0; i < 8; i++) value2 = value2 >>> 1 ^ (value2 & 1 ? 3988292384 : 0);
  return value2 >>> 0;
});
function fail(message) {
  throw new Error(`Unitypackage: ${message}`);
}
function crcUpdate(crc, bytes2) {
  for (const byte of bytes2) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return crc >>> 0;
}
function crc32(bytes2) {
  return (crcUpdate(4294967295, bytes2) ^ 4294967295) >>> 0;
}
function u32(bytes2, offset) {
  return new DataView(bytes2.buffer, bytes2.byteOffset + offset, 4).getUint32(0, true);
}
function bytesRequired(bytes2) {
  if (!(bytes2 instanceof Uint8Array)) fail("expected Uint8Array");
}
function text(bytes2, label) {
  try {
    return decoder.decode(bytes2);
  } catch {
    fail(`invalid UTF-8 in ${label}`);
  }
}
function isZero(bytes2) {
  return bytes2.every((byte) => byte === 0);
}
function validGuid(guid2) {
  if (typeof guid2 !== "string" || !GUID.test(guid2) || /^0+$/.test(guid2)) fail("invalid GUID");
}
function validPath(path) {
  if (typeof path !== "string" || !path.startsWith("Assets/") || /[\\:\x00-\x1f\x7f]/.test(path)) {
    fail("asset path must be a safe path below Assets/");
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) fail("unsafe asset path segment");
}
function folderMeta(meta, guid2) {
  if (typeof meta !== "string" || meta.includes("\0")) fail("invalid asset.meta");
  const matches = [...meta.matchAll(/^guid:\s*([0-9a-f]{32})\s*$/gm)];
  if (matches.length !== 1 || matches[0][1] !== guid2) fail("asset.meta GUID mismatch");
  return /^folderAsset:\s*yes\s*$/m.test(meta);
}
function checkAsset(entry) {
  if (!entry || typeof entry !== "object") fail("invalid asset entry");
  validGuid(entry.guid);
  validPath(entry.path);
  const folder = folderMeta(entry.meta, entry.guid);
  if (folder ? entry.asset !== null : !(entry.asset instanceof Uint8Array)) {
    fail(folder ? "folderAsset must not contain asset data" : "non-folder asset data is missing");
  }
  return folder;
}
function checkCollection(entries) {
  const guids = /* @__PURE__ */ new Set();
  const paths = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const folder = checkAsset(entry);
    if (guids.has(entry.guid)) fail(`duplicate GUID ${entry.guid}`);
    guids.add(entry.guid);
    const key = entry.path.toLowerCase();
    if (paths.has(key)) fail(`duplicate asset path ${entry.path}`);
    paths.set(key, folder);
  }
  for (const entry of entries) {
    const parts = entry.path.toLowerCase().split("/");
    for (let n = 2; n < parts.length; n++) {
      if (paths.get(parts.slice(0, n).join("/")) === false) fail("asset path has a non-folder parent");
    }
  }
}
function gzipHeader(bytes2) {
  if (bytes2.length < 18 || bytes2[0] !== 31 || bytes2[1] !== 139 || bytes2[2] !== 8 || bytes2[3] & 224) {
    fail("invalid gzip header");
  }
  const flags = bytes2[3];
  const end = bytes2.length - 8;
  let offset = 10;
  if (flags & 4) {
    if (offset + 2 > end) fail("truncated gzip extra field");
    const length = bytes2[offset] | bytes2[offset + 1] << 8;
    offset += 2 + length;
    if (offset > end) fail("truncated gzip extra field");
  }
  for (const flag of [8, 16]) {
    if (!(flags & flag)) continue;
    while (offset < end && bytes2[offset] !== 0) offset++;
    if (offset >= end) fail("unterminated gzip header string");
    offset++;
  }
  if (flags & 2) {
    if (offset + 2 > end) fail("truncated gzip header checksum");
    if ((crc32(bytes2.subarray(0, offset)) & 65535) !== (bytes2[offset] | bytes2[offset + 1] << 8)) {
      fail("gzip header checksum mismatch");
    }
    offset += 2;
  }
  if (offset >= end) fail("gzip deflate data is missing");
  return offset;
}
function gunzipBounded(bytes2) {
  bytesRequired(bytes2);
  const headerLength = gzipHeader(bytes2);
  const expectedSize = u32(bytes2, bytes2.length - 4);
  if (expectedSize > MAX_UNITY_PACKAGE_BYTES) fail("expanded data exceeds 64 MiB");
  let length = 0;
  let crc = 4294967295;
  const chunks = [];
  const stream = new Gunzip((chunk) => {
    length += chunk.length;
    if (length > MAX_UNITY_PACKAGE_BYTES) fail("expanded data exceeds 64 MiB");
    if (chunk.length) {
      crc = crcUpdate(crc, chunk);
      chunks.push(chunk);
    }
  });
  stream.onmember = () => fail("multiple gzip members are not supported");
  stream.push(bytes2.subarray(0, headerLength), false);
  for (let offset2 = headerLength; offset2 < bytes2.length; offset2 += 1024) {
    stream.push(bytes2.subarray(offset2, Math.min(offset2 + 1024, bytes2.length)), false);
  }
  stream.push(new Uint8Array(), true);
  if (length !== expectedSize) fail("gzip size mismatch");
  if ((crc ^ 4294967295) >>> 0 !== u32(bytes2, bytes2.length - 8)) fail("gzip checksum mismatch");
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
function headerString(header, start, size) {
  const field = header.subarray(start, start + size);
  const nul = field.indexOf(0);
  if (nul >= 0 && !isZero(field.subarray(nul))) fail("malformed tar string padding");
  return text(nul < 0 ? field : field.subarray(0, nul), "tar header");
}
function octal(header, start, size, label) {
  const raw = text(header.subarray(start, start + size), `tar ${label}`);
  if (!/^[\x00 ]*[0-7]*[\x00 ]*$/.test(raw)) fail(`invalid tar ${label}`);
  const value2 = Number.parseInt(raw.replace(/[\x00 ]/g, "") || "0", 8);
  if (!Number.isSafeInteger(value2)) fail(`tar ${label} is too large`);
  return value2;
}
function readUnityPackage(bytes2) {
  const tar = gunzipBounded(bytes2);
  if (tar.length % BLOCK !== 0) fail("truncated tar block");
  const groups = /* @__PURE__ */ new Map();
  const memberNames = /* @__PURE__ */ new Set();
  let offset = 0;
  let ended = false;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (isZero(header)) {
      if (offset + 2 * BLOCK > tar.length || !isZero(tar.subarray(offset))) fail("invalid tar end marker");
      ended = true;
      break;
    }
    const expectedChecksum = octal(header, 148, 8, "checksum");
    let checksum = 0;
    for (let i = 0; i < BLOCK; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== expectedChecksum) fail("tar checksum mismatch");
    const magic = text(header.subarray(257, 265), "tar magic");
    if (magic !== "ustar  \0" && magic !== POSIX_MAGIC) fail("unsupported tar format");
    if (magic === POSIX_MAGIC && !isZero(header.subarray(345, 500))) fail("tar prefixes are not supported");
    for (const [start2, size2, label] of [[100, 8, "mode"], [108, 8, "uid"], [116, 8, "gid"], [136, 12, "mtime"]]) {
      octal(header, start2, size2, label);
    }
    const size = octal(header, 124, 12, "size");
    const name = headerString(header, 0, 100);
    if (!isZero(header.subarray(157, 257))) fail("tar links are not supported");
    const type = header[156];
    if (![0, 48, 53].includes(type)) fail("tar links and special members are not supported");
    const directory = type === 53;
    const match = directory ? /^([0-9a-f]{32})\/?$/.exec(name) : /^([0-9a-f]{32})\/([^/]+)$/.exec(name);
    if (!match || !directory && !children.has(match[2])) fail("invalid Unitypackage member path");
    const guid2 = match[1];
    validGuid(guid2);
    const memberKey = directory ? guid2 : name;
    if (memberNames.has(memberKey)) fail("duplicate tar member");
    memberNames.add(memberKey);
    if (memberNames.size > 10240 || groups.size > 2048) fail("PACKAGE_ENTRY_LIMIT");
    if (directory && size !== 0) fail("tar directory has data");
    if (size > MAX_UNITY_PACKAGE_BYTES) fail("tar member exceeds 64 MiB");
    const start = offset + BLOCK;
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (start + padded > tar.length) fail("truncated tar member");
    if (!isZero(tar.subarray(start + size, start + padded))) fail("nonzero tar member padding");
    let group = groups.get(guid2);
    if (!group) groups.set(guid2, group = { directory: false, files: /* @__PURE__ */ new Map() });
    if (directory) group.directory = true;
    else group.files.set(match[2], tar.subarray(start, start + size));
    offset = start + padded;
  }
  if (!ended) fail("tar end marker is missing");
  const entries = [];
  for (const [guid2, group] of groups) {
    if (!group.directory || !group.files.has("asset.meta") || !group.files.has("pathname")) fail("incomplete GUID directory");
    const path = text(group.files.get("pathname"), "pathname");
    const meta = text(group.files.get("asset.meta"), "asset.meta");
    const asset = group.files.has("asset") ? group.files.get("asset").slice() : null;
    entries.push({ guid: guid2, path, asset, meta });
  }
  checkCollection(entries);
  return new Map(entries.map((entry) => [entry.guid, entry]));
}

// ../pages-adjustment/docs/shared/unity-analysis/archive.mjs
var MAX_IN = 32 * 1024 * 1024;
var MAX_OUT = 64 * 1024 * 1024;
var MAX_FILES = 2048;
var encoder2 = new TextEncoder();
var decoder2 = new TextDecoder("utf-8", { fatal: true });
function safePath2(path) {
  if (typeof path !== "string" || !path || path.length > 1024 || path.startsWith("/") || path.includes("\\") || /[<>"|?*\u0000-\u001f\u007f:]/.test(path) || path.split("/").some((s) => !s || s === "." || s === ".." || s.length > 255 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s) || /[ .]$/.test(s))) throw new Error("\u4E0D\u6B63\u306A\u30A2\u30FC\u30AB\u30A4\u30D6\u30D1\u30B9");
  return path;
}
function zipHeaders(bytes2) {
  const v = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
  let end = -1;
  for (let i = bytes2.length - 22; i >= Math.max(0, bytes2.length - 65557); i--) if (v.getUint32(i, true) === 101010256 && i + 22 + v.getUint16(i + 20, true) === bytes2.length) {
    end = i;
    break;
  }
  if (end < 0) throw new Error("ZIP\u7D42\u7AEF\u304C\u4E0D\u6B63");
  const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), offset = v.getUint32(end + 16, true);
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || count !== v.getUint16(end + 8, true) || count > MAX_FILES || count === 65535 || offset + size !== end) throw new Error("\u8907\u6570disk/ZIP64/\u4EF6\u6570\u8D85\u904EZIP\u306F\u672A\u5BFE\u5FDC");
  let pos = offset, total = 0;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 33639248) throw new Error("ZIP\u76EE\u9332\u4E0D\u6B63");
    const flags = v.getUint16(pos + 8, true), method = v.getUint16(pos + 10, true), compressed = v.getUint32(pos + 20, true), length = v.getUint32(pos + 24, true), nl = v.getUint16(pos + 28, true), extra = v.getUint16(pos + 30, true), comment = v.getUint16(pos + 32, true), local = v.getUint32(pos + 42, true);
    if (flags & 8257 || ![0, 8].includes(method) || compressed === 4294967295 || length === 4294967295) throw new Error("\u6697\u53F7\u5316/\u672A\u5BFE\u5FDC\u5727\u7E2E/ZIP64");
    if (pos + 46 + nl + extra + comment > end) throw new Error("ZIP\u76EE\u9332\u7BC4\u56F2\u5916");
    const unixType = v.getUint32(pos + 38, true) >>> 16 & 61440;
    if (unixType && unixType !== 32768 && unixType !== 16384) throw new Error("ZIP\u7279\u6B8A\u30D5\u30A1\u30A4\u30EB\u306F\u672A\u5BFE\u5FDC");
    const name = decoder2.decode(bytes2.subarray(pos + 46, pos + 46 + nl));
    const directory = name.endsWith("/");
    safePath2(directory ? name.slice(0, -1) : name);
    total += length;
    if (total > MAX_OUT) throw new Error("\u5C55\u958B\u5BB9\u91CF\u8D85\u904E");
    if (local + 30 > offset || v.getUint32(local, true) !== 67324752 || v.getUint16(local + 6, true) !== flags || v.getUint16(local + 8, true) !== method) throw new Error("ZIP\u30D8\u30C3\u30C0\u30FC\u4E0D\u4E00\u81F4");
    if (!(flags & 8) && (v.getUint32(local + 14, true) !== v.getUint32(pos + 16, true) || v.getUint32(local + 18, true) !== compressed || v.getUint32(local + 22, true) !== length)) throw new Error("ZIP CRC/\u5BB9\u91CF\u30D8\u30C3\u30C0\u30FC\u4E0D\u4E00\u81F4");
    const ln = v.getUint16(local + 26, true), le = v.getUint16(local + 28, true);
    if (local + 30 + ln + le + compressed > offset || decoder2.decode(bytes2.subarray(local + 30, local + 30 + ln)) !== name) throw new Error("ZIP\u53C2\u7167\u7BC4\u56F2/\u540D\u524D\u4E0D\u4E00\u81F4");
    entries.push({ name, length, directory, crc: v.getUint32(pos + 16, true) });
    pos += 46 + nl + extra + comment;
  }
  if (pos !== end) throw new Error("ZIP\u76EE\u9332\u9577\u4E0D\u4E00\u81F4");
  return entries;
}
function crc322(bytes2) {
  let c = 4294967295;
  for (const b of bytes2) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 3988292384 : 0);
  }
  return (c ^ 4294967295) >>> 0;
}
function readFiles(inputs) {
  if (!Array.isArray(inputs) || inputs.length > MAX_FILES) throw new Error("\u5165\u529B\u4EF6\u6570\u8D85\u904E");
  let inputBytes4 = 0, expanded = 0, entryCount = 0;
  const result = [], seen = /* @__PURE__ */ new Map();
  function accept(path, bytes2, directory = false) {
    safePath2(directory ? path.slice(0, -1) : path);
    const key = path.replace(/\/$/, "").normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error("\u30D1\u30B9\u91CD\u8907/\u540C\u4E00\u8996\u885D\u7A81");
    for (const [other, isDirectory] of seen) {
      if (key.startsWith(other + "/") && !isDirectory || other.startsWith(key + "/") && !directory) throw new Error("\u30D5\u30A1\u30A4\u30EB\u3068\u30D5\u30A9\u30EB\u30C0\u306E\u30D1\u30B9\u304C\u885D\u7A81\u3057\u307E\u3059");
    }
    seen.set(key, directory);
    if (++entryCount > MAX_FILES) throw new Error("\u4EF6\u6570\u8D85\u904E");
    if (directory) return;
    expanded += bytes2.length;
    if (expanded > MAX_OUT) throw new Error("\u5C55\u958B\u5BB9\u91CF\u8D85\u904E");
    result.push({ path, bytes: bytes2 });
  }
  for (const input of inputs) {
    safePath2(input.path);
    if (!(input.bytes instanceof Uint8Array)) throw new Error("\u5165\u529B\u30D0\u30A4\u30C8\u4E0D\u6B63");
    inputBytes4 += input.bytes.length;
    if (inputBytes4 > MAX_IN) throw new Error("\u5165\u529B32MiB\u8D85\u904E");
    if (/\.unitypackage$/i.test(input.path)) {
      for (const e of readUnityPackage(input.bytes).values()) {
        if (e.asset) accept(e.path, e.asset);
        accept(e.path + ".meta", encoder2.encode(e.meta));
      }
      continue;
    }
    if (!/\.zip$/i.test(input.path)) {
      accept(input.path, input.bytes);
      continue;
    }
    const expected = zipHeaders(input.bytes);
    const entries = /* @__PURE__ */ new Map();
    for (const e of expected) {
      if (entries.has(e.name)) throw new Error("ZIP\u91CD\u8907");
      entries.set(e.name, e);
    }
    let done = 0, actual = 0;
    const priorExpanded = expanded;
    const unzip = new Unzip((file) => {
      const e = entries.get(file.name);
      if (!e) throw new Error("ZIP\u672A\u767B\u9332entry");
      entries.delete(file.name);
      if (actual + e.length + priorExpanded > MAX_OUT) throw new Error("\u5B9F\u5C55\u958B\u5BB9\u91CF\u8D85\u904E");
      let length = 0, output = new Uint8Array(e.length);
      file.ondata = (error, data, final) => {
        if (error) throw error;
        if (length + data.length > e.length || actual + data.length + priorExpanded > MAX_OUT) throw new Error("\u5B9F\u5C55\u958B\u5BB9\u91CF\u8D85\u904E");
        output.set(data, length);
        length += data.length;
        actual += data.length;
        if (final) {
          if (length !== e.length) throw new Error("\u5C55\u958B\u9577\u4E0D\u4E00\u81F4");
          if (crc322(output) !== e.crc) throw new Error("CRC\u4E0D\u4E00\u81F4");
          const bytes2 = output;
          output = null;
          accept(e.name, bytes2, e.directory);
          done++;
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    for (let pos = 0; pos < input.bytes.length; pos += 4096) unzip.push(input.bytes.subarray(pos, pos + 4096), pos + 4096 >= input.bytes.length);
    if (done !== expected.length || entries.size) throw new Error("ZIP\u5C55\u958B\u672A\u5B8C\u4E86");
  }
  return result;
}
function expandInput(input) {
  if (!(input?.bytes instanceof Uint8Array) || input.bytes.byteLength > 16 * 1024 * 1024) throw RangeError("ARCHIVE_INPUT_LIMIT");
  return readFiles([input]);
}

// ../pages-adjustment/docs/shared/ft/unity-text.mjs
var own2 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function parseUnityScalar(value2) {
  if (typeof value2 !== "string") throw new TypeError("Expected Unity scalar text");
  value2 = value2.trim();
  if (!value2) return "";
  if (value2.startsWith('"')) {
    const match = /^"((?:[^"\\\r\n]|\\[^\r\n])*)"(?:[ \t]+#.*)?$/.exec(value2);
    if (!match) throw new Error("Unsupported or malformed quoted Unity scalar");
    const body = match[1];
    const escapes = {
      "0": "\0",
      a: "\x07",
      b: "\b",
      t: "	",
      n: "\n",
      v: "\v",
      f: "\f",
      r: "\r",
      e: "\x1B",
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      N: "\x85",
      _: "\xA0",
      L: "\u2028",
      P: "\u2029"
    };
    let result = "";
    for (let index = 0; index < body.length; index++) {
      const char = body[index];
      if (char !== "\\") {
        result += char;
        continue;
      }
      const escaped = body[++index];
      if (own2(escapes, escaped)) {
        result += escapes[escaped];
        continue;
      }
      const length = { x: 2, u: 4, U: 8 }[escaped];
      if (!length) throw new Error("Unsupported or malformed quoted Unity scalar escape");
      const digits = body.slice(index + 1, index + 1 + length);
      if (digits.length !== length || !/^[0-9a-fA-F]+$/.test(digits)) throw new Error("Malformed Unity scalar hexadecimal escape");
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343) throw new Error("Invalid Unicode scalar escape");
      result += String.fromCodePoint(codePoint);
      index += length;
    }
    return result;
  }
  if (value2.startsWith("'")) {
    const match = /^'((?:[^'\r\n]|'')*)'(?:[ \t]+#.*)?$/.exec(value2);
    if (!match) throw new Error("Malformed single-quoted Unity scalar");
    return match[1].replaceAll("''", "'");
  }
  if (/[\r\n]/.test(value2)) throw new Error("Multiline Unity scalar requires explicit handling");
  return value2.replace(/\s+#.*$/, "").trimEnd();
}

// ../pages-adjustment/docs/shared/unity-analysis/rules.mjs
var TEXT_RULES_VERSION = "unity-text-rules/1";
var EXPRESSION_SCHEMA = Object.freeze({ kind: "vrchat-expression", scriptGuid: "67cc4cb7839cd3741b63733d5adf0442", scriptFileId: "-1506855854", profile: "known-five-field-parameters/1" });
var animatorTypes = Object.freeze({ "1": "Float", "3": "Int", "4": "Bool", "9": "Trigger" });
var expressionTypes = Object.freeze({ "0": "Int", "1": "Float", "2": "Bool" });
var conditions = Object.freeze({ "1": ["Bool", "Trigger"], "2": ["Bool"], "3": ["Float", "Int"], "4": ["Float", "Int"], "6": ["Int"], "7": ["Int"] });
var map = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var own3 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var pointerPart = (v) => String(v).replaceAll("~", "~0").replaceAll("/", "~1");
var conditionBasis = "https://docs.unity3d.com/ScriptReference/Animations.AnimatorCondition.html";
var blendBasis = "https://docs.unity3d.com/2022.3/Documentation/Manual/BlendTrees.html";
function referenceRole(classId, property) {
  if (classId === "91" && /^\/m_AnimatorLayers\/\d+\/m_StateMachine$/.test(property)) return "animator-owner";
  if (classId === "1107" && (/^\/m_ChildStates\/\d+\/m_State$/.test(property) || /^\/m_ChildStateMachines\/\d+\/m_StateMachine$/.test(property) || /^\/(?:m_AnyStateTransitions|m_EntryTransitions)\/\d+$/.test(property))) return "animator-owner";
  if (classId === "1102" && (property === "/m_Motion" || /^\/m_Transitions\/\d+$/.test(property))) return "animator-owner";
  if (classId === "206" && /^\/m_Childs\/\d+\/m_Motion$/.test(property)) return "animator-owner";
  return "reference";
}
function deriveParameterRules(object) {
  const p = object.properties, parameters = [], parameterUses = [], issues = [];
  const source = (path) => object.propertySources[path] ?? object.source;
  const issue = (code, message, path) => issues.push({ code, message, source: source(path), propertyPath: path });
  const validName = (name, path) => {
    if (typeof name !== "string" || !name || name.length > 1024 || /[\u0000-\u001f\u007f]/.test(name)) {
      issue("PARAMETER_NAME_UNSUPPORTED", "A parameter name is missing or outside the supported text contract", path);
      return false;
    }
    return true;
  };
  const use = (name, path, allowedTypes, rule, ruleBasis) => {
    if (validName(name, path)) parameterUses.push({ domain: "animator", unowned: true, name, allowedTypes: [...allowedTypes], rule, property: path, source: source(path), ...ruleBasis ? { ruleBasis } : {} });
  };
  const records = (value2, path) => {
    if (!Array.isArray(value2)) {
      issue("PARAMETER_LIST_UNAVAILABLE", "The expected serialized sequence is unavailable", path);
      return null;
    }
    return value2;
  };
  if (object.classId === "91") {
    const rows = records(p.m_AnimatorParameters, "/m_AnimatorParameters");
    for (const [i, row] of (rows ?? []).entries()) {
      const path = `/m_AnimatorParameters/${i}`;
      if (!map(row)) {
        issue("PARAMETER_DECLARATION_UNSUPPORTED", "The declaration is not a mapping", path);
        continue;
      }
      if (!validName(row.m_Name, path + "/m_Name")) continue;
      const type = typeof row.m_Type === "string" && own3(animatorTypes, row.m_Type) ? animatorTypes[row.m_Type] : "Unknown";
      if (type === "Unknown") issue("PARAMETER_TYPE_UNKNOWN", "Unknown serialized Animator parameter type", path + "/m_Type");
      parameters.push({ domain: "animator", name: row.m_Name, type, property: path + "/m_Name", source: source(path), serializedType: typeof row.m_Type === "string" ? row.m_Type : null });
    }
  } else if (object.classId === "1101" || object.classId === "1109") {
    const rows = records(p.m_Conditions, "/m_Conditions");
    for (const [i, row] of (rows ?? []).entries()) {
      const path = `/m_Conditions/${i}`;
      if (!map(row)) {
        issue("CONDITION_UNSUPPORTED", "A transition condition is not a mapping", path);
        continue;
      }
      const mode = typeof row.m_ConditionMode === "string" ? row.m_ConditionMode : "unknown", allowed = own3(conditions, mode) ? conditions[mode] : [];
      if (!allowed.length) issue("CONDITION_MODE_UNKNOWN", "Unknown transition condition mode; no type constraint asserted", path + "/m_ConditionMode");
      use(row.m_ConditionEvent, path + "/m_ConditionEvent", allowed, `unity.transition-condition.${mode}`, conditionBasis);
    }
  } else if (object.classId === "206") {
    const mode = p.m_BlendType, known = ["0", "1", "2", "3", "4"].includes(mode);
    if (!known) issue("BLEND_TYPE_UNKNOWN", "Unknown BlendTree mode; no type constraint asserted", "/m_BlendType");
    if (mode === "4") {
      const rows = records(p.m_Childs, "/m_Childs");
      for (const [i, row] of (rows ?? []).entries()) if (map(row)) use(row.m_DirectBlendParameter, `/m_Childs/${i}/m_DirectBlendParameter`, ["Float"], "unity.blendtree.direct-weight", blendBasis);
      else issue("BLEND_CHILD_UNSUPPORTED", "A BlendTree child is not a mapping", `/m_Childs/${i}`);
    } else {
      use(p.m_BlendParameter, "/m_BlendParameter", known ? ["Float"] : [], "unity.blendtree.axis-x", blendBasis);
      if (mode !== "0" && (known || own3(p, "m_BlendParameterY"))) use(p.m_BlendParameterY, "/m_BlendParameterY", known ? ["Float"] : [], "unity.blendtree.axis-y", blendBasis);
    }
  } else if (object.classId === "1102") {
    for (const part of ["Speed", "CycleOffset", "Mirror", "Time"]) {
      const active = p[`m_${part}ParameterActive`], path = `/m_${part}Parameter`;
      if (active === void 0 || active === "0") continue;
      if (active !== "1") {
        issue("STATE_PARAMETER_ACTIVE_UNKNOWN", "Unknown active flag; no type constraint asserted", path + "Active");
        continue;
      }
      issue("STATE_PARAMETER_RULE_UNVERIFIED", `${part} usage is recorded; its target-version type rule is not yet verified`, path);
      use(p[`m_${part}Parameter`], path, [], `unity.state.${part.toLowerCase()}.unverified`);
    }
  } else if (object.classId === "114" && own3(p, "parameters")) {
    const script = p.m_Script;
    if (!map(script) || typeof script.guid !== "string" || script.guid.toLowerCase() !== EXPRESSION_SCHEMA.scriptGuid || script.fileID !== EXPRESSION_SCHEMA.scriptFileId || script.type !== "3") {
      issue("EXPRESSION_SCHEMA_UNRECOGNIZED", "A parameters field alone does not identify the VRChat Expression schema", "/m_Script");
    } else {
      const rows = records(p.parameters, "/parameters"), allowedFields = /* @__PURE__ */ new Set(["name", "valueType", "saved", "defaultValue", "networkSynced"]);
      for (const [i, row] of (rows ?? []).entries()) {
        const path = `/parameters/${i}`;
        if (!map(row) || Object.keys(row).length !== allowedFields.size || Object.keys(row).some((k) => !allowedFields.has(k))) {
          issue("EXPRESSION_SCHEMA_UNSUPPORTED", "The row does not match the verified five-field Expression profile", path);
          continue;
        }
        if (!validName(row.name, path + "/name")) continue;
        if (!["0", "1"].includes(row.saved) || !["0", "1"].includes(row.networkSynced) || typeof row.defaultValue !== "string" || !/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(row.defaultValue) || !Number.isFinite(Number(row.defaultValue))) {
          issue("EXPRESSION_SETTINGS_UNSUPPORTED", "Expression flags/default are not supported serialized values", path);
          continue;
        }
        const type = typeof row.valueType === "string" && own3(expressionTypes, row.valueType) ? expressionTypes[row.valueType] : "Unknown";
        if (type === "Unknown") issue("PARAMETER_TYPE_UNKNOWN", "Unknown serialized Expression parameter type", path + "/valueType");
        parameters.push({ domain: "vrchat-expression", name: row.name, type, property: path + "/name", source: source(path), schemaIdentity: { ...EXPRESSION_SCHEMA }, serializedType: typeof row.valueType === "string" ? row.valueType : null, defaultValue: row.defaultValue, saved: row.saved === "1", networkSynced: row.networkSynced === "1" });
      }
    }
  }
  if (object.classId === "1107" && p.m_StateMachineTransitions && Object.keys(p.m_StateMachineTransitions).length) issue("OWNER_LAYOUT_UNSUPPORTED", "Nonempty StateMachineTransitions ownership layout is not yet verified", "/m_StateMachineTransitions");
  return { parameters, parameterUses, issues };
}
var jsonPointerPart = pointerPart;

// ../pages-adjustment/docs/shared/unity-analysis/text.mjs
var TEXT_PARSER_VERSION = "unity-text-subset/1";
var TEXT_LIMITS = Object.freeze({ maxTextBytes: 4 * 1024 * 1024, maxCodeUnits: 4 * 1024 * 1024, maxLines: 262144, maxNodes: 262144, maxDocuments: 65536, maxDepth: 64, maxPath: 1024 });
var own4 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
var roots = Object.freeze({ "1": "GameObject", "4": "Transform", "74": "AnimationClip", "91": "AnimatorController", "95": "Animator", "114": "MonoBehaviour", "206": "BlendTree", "1101": "AnimatorStateTransition", "1102": "AnimatorState", "1107": "AnimatorStateMachine", "1109": "AnimatorTransition", "221": "AnimatorOverrideController" });
var SyntaxIssue = class extends Error {
  constructor(code, message, start, end, related = []) {
    super(message);
    this.code = code;
    this.start = start;
    this.end = end;
    this.related = related;
  }
};
var fault = (code, message, start, end = start + 1, related = []) => {
  throw new SyntaxIssue(code, message, start, end, related);
};
var limit = (code) => {
  throw new RangeError(code);
};
var unsupportedPrefix = (v) => /^[&*!|>@`?:]/.test(v);
function textContext(text2) {
  if (typeof text2 !== "string") throw TypeError("TEXT_STRING_REQUIRED");
  if (text2.length > TEXT_LIMITS.maxCodeUnits) limit("TEXT_CODE_UNIT_LIMIT");
  if (new TextEncoder().encode(text2).byteLength > TEXT_LIMITS.maxTextBytes) limit("TEXT_BYTE_LIMIT");
  const lines = [], starts = [0];
  let at = 0;
  while (at < text2.length) {
    if (lines.length >= TEXT_LIMITS.maxLines) limit("TEXT_LINE_LIMIT");
    const newline = text2.indexOf("\n", at), next = newline < 0 ? text2.length : newline + 1;
    let end = newline < 0 ? text2.length : newline;
    if (end > at && text2[end - 1] === "\r") end--;
    const raw = text2.slice(at, end), bom = at === 0 && raw.startsWith("\uFEFF") ? 1 : 0, indent = /^ */.exec(raw.slice(bom))[0].length;
    lines.push({ start: at, end, next, contentStart: at + bom + indent, indent, content: raw.slice(bom + indent) });
    if (newline >= 0) starts.push(next);
    at = next;
  }
  const locate = (offset) => {
    let lo = 0, hi = starts.length;
    while (lo + 1 < hi) {
      const mid = lo + hi >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid;
    }
    return { line: lo + 1, column: offset - starts[lo] + 1 };
  };
  const source = (start, end) => {
    const a = locate(start), b = locate(end);
    return { start, end, line: a.line, column: a.column, endLine: b.line, endColumn: b.column };
  };
  const issue = (e) => ({ code: e.code, message: e.message, source: source(e.start, e.end), ...e.related.length ? { relatedSources: e.related.map((r) => source(r.start, r.end)) } : {} });
  return { text: text2, lines, source, issue, nodes: 0 };
}
function parseSubset(context, start, end, issues) {
  const { text: text2, source } = context;
  const lines = [];
  let first = 0, stop = context.lines.length;
  while (first < stop) {
    const middle = first + stop >> 1;
    if (context.lines[middle].start < start) first = middle + 1;
    else stop = middle;
  }
  for (let i = first; i < context.lines.length && context.lines[i].start < end; i++) {
    const l = context.lines[i];
    if (l.content.trim() && !l.content.startsWith("#")) lines.push(l);
  }
  let at = 0, duplicate = false;
  const checkDepth = (depth) => {
    if (depth > TEXT_LIMITS.maxDepth) limit("YAML_DEPTH_LIMIT");
  };
  const node = (kind, value2, begin, finish) => {
    if (++context.nodes > TEXT_LIMITS.maxNodes) limit("YAML_NODE_LIMIT");
    return { kind, value: value2, start: begin, end: finish };
  };
  const scalar = (value2, begin, finish) => node("scalar", value2, begin, finish);
  const problem = (code, message, begin, finish = begin + 1) => fault(code, message, begin, Math.min(finish, end));
  const keyValue = (raw, begin, finish) => {
    if (!raw || unsupportedPrefix(raw) || raw === "<<") problem("YAML_KEY_UNSUPPORTED", "Unsupported alias, tag, merge or complex mapping key", begin, finish);
    let key;
    try {
      key = parseUnityScalar(raw);
    } catch (e) {
      problem("YAML_KEY_UNSUPPORTED", e.message, begin, finish);
    }
    if (!key || key.length > TEXT_LIMITS.maxPath) limit("YAML_KEY_LIMIT");
    if (["__proto__", "prototype", "constructor"].includes(key)) problem("YAML_KEY_UNSUPPORTED", "Reserved mapping key is outside this subset", begin, finish);
    return key;
  };
  const add = (mapping2, key, keyStart, keyEnd, value2) => {
    const prior = mapping2.keys.get(key);
    if (prior) {
      duplicate = true;
      issues.push({ code: "YAML_DUPLICATE_KEY", message: `Duplicate mapping key: ${key}`, source: source(keyStart, keyEnd), relatedSources: [source(prior.start, prior.end)] });
    } else mapping2.keys.set(key, { start: keyStart, end: keyEnd });
    if (++context.nodes > TEXT_LIMITS.maxNodes) limit("YAML_NODE_LIMIT");
    mapping2.value.push({ key, keyStart, keyEnd, node: value2 });
    mapping2.end = Math.max(mapping2.end, value2.end);
  };
  const mapping = (begin) => ({ ...node("map", [], begin, begin), keys: /* @__PURE__ */ new Map() });
  function quoted(begin) {
    const quote = text2[begin];
    let cursor = begin + 1;
    while (cursor < end) {
      const c = text2[cursor];
      if (c === "\n" || c === "\r") problem("YAML_MULTILINE_QUOTE_UNSUPPORTED", "Multiline quoted scalars are outside this subset", begin, cursor);
      if (c === "\\" && quote === '"') {
        cursor += 2;
        continue;
      }
      if (c === quote) {
        if (quote === "'" && text2[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        cursor++;
        let value2;
        try {
          value2 = parseUnityScalar(text2.slice(begin, cursor));
        } catch (e) {
          problem("YAML_SCALAR_UNSUPPORTED", e.message, begin, cursor);
        }
        return scalar(value2, begin, cursor);
      }
      cursor++;
    }
    problem("YAML_UNCLOSED_QUOTE", "Quoted scalar is not closed", begin, end);
  }
  function ws(cursor) {
    while (cursor < end) {
      if (/[ \t\r\n]/.test(text2[cursor])) {
        cursor++;
        continue;
      }
      if (text2[cursor] === "#") {
        while (cursor < end && text2[cursor] !== "\n") cursor++;
        continue;
      }
      break;
    }
    return cursor;
  }
  function flow(begin, depth) {
    checkDepth(depth);
    const open = text2[begin], close = open === "{" ? "}" : "]";
    let cursor = ws(begin + 1);
    const result = open === "{" ? mapping(begin) : node("seq", [], begin, begin);
    if (text2[cursor] === close) {
      result.end = cursor + 1;
      return result;
    }
    while (cursor < end) {
      if (open === "{") {
        const keyStart = cursor;
        let keyEnd, key;
        if (text2[cursor] === '"' || text2[cursor] === "'") {
          const k = quoted(cursor);
          keyEnd = k.end;
          key = keyValue(text2.slice(cursor, k.end), cursor, k.end);
          cursor = ws(k.end);
        } else {
          while (cursor < end && text2[cursor] !== ":" && !/[\n\r,\[\]{}#]/.test(text2[cursor])) cursor++;
          keyEnd = cursor;
          const raw = text2.slice(keyStart, keyEnd).trim();
          key = keyValue(raw, keyStart, keyEnd);
        }
        if (text2[cursor] !== ":") problem("YAML_FLOW_MAPPING_UNSUPPORTED", "A flow mapping key needs a colon", keyStart, cursor);
        cursor = ws(cursor + 1);
        const v = flowValue(cursor, depth + 1);
        add(result, key, keyStart, keyEnd, v);
        cursor = ws(v.end);
      } else {
        const v = flowValue(cursor, depth + 1);
        result.value.push(v);
        result.end = v.end;
        cursor = ws(v.end);
      }
      if (text2[cursor] === close) {
        result.end = cursor + 1;
        return result;
      }
      if (text2[cursor] !== ",") problem("YAML_FLOW_UNSUPPORTED", "Expected a flow comma or closing delimiter", cursor);
      cursor = ws(cursor + 1);
      if (text2[cursor] === close) problem("YAML_FLOW_TRAILING_COMMA_UNSUPPORTED", "Trailing flow commas are outside this subset", cursor);
    }
    problem("YAML_UNCLOSED_FLOW", "Flow collection is not closed", begin, end);
  }
  function flowValue(begin, depth) {
    checkDepth(depth);
    const c = text2[begin];
    if (c === "{" || c === "[") return flow(begin, depth);
    if (c === '"' || c === "'") return quoted(begin);
    let cursor = begin;
    while (cursor < end && !/[,\]}\r\n]/.test(text2[cursor]) && !(text2[cursor] === "#" && (cursor === begin || /\s/.test(text2[cursor - 1])))) cursor++;
    const raw = text2.slice(begin, cursor).trim();
    if (!raw) problem("YAML_FLOW_VALUE_UNSUPPORTED", "Empty flow values are outside this subset", begin, cursor + 1);
    if (unsupportedPrefix(raw) || /[\[{}]/.test(raw) || /:\s/.test(raw)) problem("YAML_SCALAR_UNSUPPORTED", "Unsupported flow scalar syntax", begin, cursor);
    return scalar(parseUnityScalar(raw), begin, cursor);
  }
  function field(line, contentStart = line.contentStart) {
    const raw = text2.slice(contentStart, line.end);
    let colon = -1, cursor = contentStart;
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const k = quoted(contentStart);
      cursor = k.end;
      while (cursor < line.end && /[ \t]/.test(text2[cursor])) cursor++;
      if (text2[cursor] === ":") colon = cursor;
    } else for (; cursor < line.end; cursor++) if (text2[cursor] === ":" && (cursor + 1 === line.end || /[ \t]/.test(text2[cursor + 1]))) {
      colon = cursor;
      break;
    }
    if (colon < 0) return null;
    const key = keyValue(text2.slice(contentStart, colon).trim(), contentStart, colon);
    return { key, keyStart: contentStart, keyEnd: colon, valueStart: colon + 1 };
  }
  const sequence = (line) => text2[line.contentStart] === "-" && (line.contentStart + 1 === line.end || /[ \t]/.test(text2[line.contentStart + 1]));
  function inlineValue(line, valueStart, depth) {
    checkDepth(depth);
    let begin = valueStart;
    while (begin < line.end && /[ \t]/.test(text2[begin])) begin++;
    if (begin === line.end || text2[begin] === "#") return null;
    const c = text2[begin];
    let result;
    if (c === "{" || c === "[") result = flow(begin, depth);
    else if (c === '"' || c === "'") result = quoted(begin);
    else {
      const raw = text2.slice(begin, line.end);
      if (unsupportedPrefix(raw) || /^-(?:\s|$)/.test(raw) || /:\s/.test(raw)) problem("YAML_SCALAR_UNSUPPORTED", "Unsupported alias, tag, block scalar or plain scalar syntax", begin, line.end);
      result = scalar(parseUnityScalar(raw), begin, line.end);
    }
    if (c === "{" || c === "[" || c === '"' || c === "'") {
      let cursor = result.end;
      while (cursor < end && text2[cursor] !== "\n" && text2[cursor] !== "\r" && /[ \t]/.test(text2[cursor])) cursor++;
      if (cursor < end && !/[\r\n#]/.test(text2[cursor])) problem("YAML_TRAILING_CONTENT", "Unexpected text after a complete value", cursor);
    }
    while (at < lines.length && lines[at].start < result.end) at++;
    return result;
  }
  function child(line, valueStart, parentIndent, depth) {
    const direct = inlineValue(line, valueStart, depth);
    if (direct) return direct;
    const next = lines[at];
    if (next && (next.indent > parentIndent || next.indent === parentIndent && sequence(next))) return block(next.indent, depth);
    return scalar("", valueStart, line.end);
  }
  function addField(result, line, f, indent, depth) {
    const value2 = child(line, f.valueStart, indent, depth + 1);
    add(result, f.key, f.keyStart, f.keyEnd, value2);
  }
  function block(indent, depth) {
    checkDepth(depth);
    const first2 = lines[at];
    if (!first2) problem("YAML_EMPTY_DOCUMENT", "Expected a YAML value", start, end);
    const isSequence = sequence(first2), result = isSequence ? node("seq", [], first2.contentStart, first2.end) : mapping(first2.contentStart);
    while (at < lines.length && lines[at].indent === indent) {
      const line = lines[at];
      if (line.content.startsWith("	") || line.content.startsWith("%") || line.content === "..." || /^---/.test(line.content)) problem("YAML_UNSUPPORTED_LINE", "Unsupported indentation, directive or document marker", line.contentStart, line.end);
      if (isSequence) {
        if (!sequence(line)) break;
        at++;
        let begin = line.contentStart + 1;
        while (begin < line.end && /[ \t]/.test(text2[begin])) begin++;
        if (begin === line.end || text2[begin] === "#") result.value.push(child(line, begin, indent, depth + 1));
        else if (text2[begin] !== "{" && text2[begin] !== "[" && field(line, begin)) {
          if (begin !== line.contentStart + 2) problem("YAML_SEQUENCE_INDENTATION_UNSUPPORTED", "Inline item mappings need one space after the sequence dash", line.contentStart, begin);
          const item = mapping(begin), f = field(line, begin);
          addField(item, line, f, indent + 2, depth + 1);
          while (at < lines.length && lines[at].indent === indent + 2 && !sequence(lines[at])) {
            const more = lines[at++], entry = field(more);
            if (!entry) problem("YAML_MAPPING_UNSUPPORTED", "Expected an item mapping field", more.contentStart, more.end);
            addField(item, more, entry, indent + 2, depth + 1);
          }
          result.value.push(item);
        } else result.value.push(inlineValue(line, begin, depth + 1));
        result.end = result.value.at(-1).end;
      } else {
        if (sequence(line)) break;
        at++;
        const f = field(line);
        if (!f) problem("YAML_MAPPING_UNSUPPORTED", "Expected a mapping field", line.contentStart, line.end);
        addField(result, line, f, indent, depth);
      }
      if (at < lines.length && lines[at].indent > indent) problem("YAML_INDENTATION_UNSUPPORTED", "Unsupported continuation or indentation", lines[at].contentStart, lines[at].end);
    }
    return result;
  }
  for (const line of lines) if (line.content.startsWith("	")) problem("YAML_TAB_INDENTATION", "Tabs cannot indent YAML in this subset", line.contentStart, line.end);
  if (!lines.length) problem("YAML_EMPTY_DOCUMENT", "No YAML mapping was supplied", start, end);
  if (lines[0].indent !== 0) problem("YAML_ROOT_INDENTATION", "Root mapping must start at column one", lines[0].contentStart, lines[0].end);
  const ast = block(0, 0);
  if (at !== lines.length) problem("YAML_TRAILING_CONTENT", "Document was not fully consumed", lines[at].contentStart, lines[at].end);
  return { ast, duplicate };
}
function materialize(ast, context) {
  const positions = /* @__PURE__ */ Object.create(null);
  function visit(node, path) {
    if (path.length > TEXT_LIMITS.maxPath) limit("YAML_POINTER_LIMIT");
    positions[path] = context.source(node.start, node.end);
    if (node.kind === "scalar") return node.value;
    if (node.kind === "seq") return node.value.map((n, i) => visit(n, path + "/" + i));
    const result = /* @__PURE__ */ Object.create(null);
    for (const entry of node.value) result[entry.key] = visit(entry.node, path + "/" + jsonPointerPart(entry.key));
    return result;
  }
  return { value: visit(ast, ""), positions };
}
function referencesFrom(ast, context, classId, issues) {
  const result = [];
  function visit(n, path) {
    if (path.length > TEXT_LIMITS.maxPath) limit("YAML_POINTER_LIMIT");
    if (n.kind === "seq") {
      n.value.forEach((child, i) => visit(child, path + "/" + i));
      return;
    }
    if (n.kind !== "map") return;
    const values = new Map(n.value.map((e) => [e.key, e.node]));
    if (!values.has("fileID") && values.has("guid") && [...values.keys()].every((k) => ["guid", "type"].includes(k))) {
      issues.push({ code: "REFERENCE_SYNTAX_UNSUPPORTED", message: "GUID-only mapping cannot establish a Unity object reference without fileID", source: context.source(n.start, n.end), propertyPath: path });
      return;
    }
    if (values.has("fileID")) {
      const source = context.source(n.start, n.end), bad = (message) => issues.push({ code: "REFERENCE_SYNTAX_UNSUPPORTED", message, source, propertyPath: path });
      if ([...values.keys()].some((k) => !["fileID", "guid", "type"].includes(k)) || [...values.values()].some((v) => v.kind !== "scalar")) {
        bad("Object-reference-like mapping has unsupported fields");
        return;
      }
      try {
        const id = fileId(values.get("fileID").value), g = values.get("guid")?.value, type = values.get("type")?.value;
        if (g !== void 0) {
          guid(g);
          if (type === void 0 || !/^(?:0|[1-9][0-9]*)$/.test(type)) throw Error("External reference requires a numeric type");
        } else if (type !== void 0) throw Error("Reference type without GUID");
        result.push({ property: path, fileId: id, ...g !== void 0 ? { guid: g.toLowerCase(), type } : {}, source, role: referenceRole(classId, path) });
      } catch (e) {
        bad(e.message);
      }
      return;
    }
    for (const entry of n.value) visit(entry.node, path + "/" + jsonPointerPart(entry.key));
  }
  visit(ast, "");
  return result;
}
function metadata(context, path) {
  const issues = [];
  let parsed;
  try {
    parsed = parseSubset(context, 0, context.text.length, issues);
  } catch (e) {
    if (!(e instanceof SyntaxIssue)) throw e;
    issues.push(context.issue(e));
  }
  const result = { path, objects: [], coverage: "partial", issues, parserVersion: TEXT_PARSER_VERSION };
  if (!parsed || parsed.duplicate || parsed.ast.kind !== "map") {
    result.reason = "Metadata syntax is unsupported or ambiguous";
    result.rawText = context.text;
    return result;
  }
  const { value: value2, positions } = materialize(parsed.ast, context);
  let metaGuid;
  try {
    metaGuid = guid(value2.guid);
  } catch {
    issues.push({ code: "META_GUID_INVALID", message: "Metadata requires one 32-digit GUID", source: positions["/guid"] ?? context.source(0, context.text.length), propertyPath: "/guid" });
  }
  if (value2.fileFormatVersion !== "2") issues.push({ code: "META_VERSION_UNVERIFIED", message: "Only fileFormatVersion 2 has a verified metadata identity contract", source: positions["/fileFormatVersion"] ?? context.source(0, context.text.length), propertyPath: "/fileFormatVersion" });
  if (value2.folderAsset !== void 0 && !["yes", "no"].includes(value2.folderAsset)) issues.push({ code: "META_FOLDER_FLAG_UNSUPPORTED", message: "Unsupported folderAsset flag", source: positions["/folderAsset"], propertyPath: "/folderAsset" });
  if (metaGuid && !issues.length) result.meta = { guid: metaGuid, folderAsset: value2.folderAsset === "yes", properties: value2, propertySources: positions };
  if (issues.length) {
    result.reason = "Metadata identity is not fully verified";
    result.rawText = context.text;
  } else result.coverage = "meta-only";
  return result;
}
function parseUnityFile({ path, text: text2 } = {}) {
  safePath(path);
  const context = textContext(text2), issues = [], objects = [], unparsedDocuments = [];
  const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.exec(text2);
  if (controls) return { path, objects, coverage: "opaque", reason: "Unsupported text encoding/control character", issues: [{ code: "TEXT_CHARACTER_UNSUPPORTED", message: "Invalid control character or Unicode scalar", source: context.source(controls.index, controls.index + controls[0].length) }], parserVersion: TEXT_PARSER_VERSION };
  if (/\.meta$/i.test(path)) return metadata(context, path);
  const headers = context.lines.filter((l) => l.indent === 0 && l.content.startsWith("---"));
  if (headers.length > TEXT_LIMITS.maxDocuments) limit("UNITY_DOCUMENT_LIMIT");
  if (!headers.length) return { path, objects, coverage: "opaque", reason: "No Unity serialized document header", issues: [{ code: "UNITY_HEADER_MISSING", message: "Expected a Unity !u! document header", source: context.source(0, text2.length) }], rawText: text2, parserVersion: TEXT_PARSER_VERSION };
  let preambleValid = true;
  const directives = /* @__PURE__ */ new Set();
  for (const line of context.lines) {
    if (line.start >= headers[0].start) break;
    if (!line.content.trim() || line.content.startsWith("#")) continue;
    if (line.indent === 0 && ["%YAML 1.1", "%TAG !u! tag:unity3d.com,2011:"].includes(line.content) && !directives.has(line.content)) {
      directives.add(line.content);
      continue;
    }
    preambleValid = false;
    issues.push({ code: "UNITY_PREAMBLE_UNSUPPORTED", message: "Unexpected or repeated Unity preamble directive", source: context.source(line.contentStart, line.end) });
  }
  if (!preambleValid) unparsedDocuments.push({ source: context.source(0, headers[0].start), rawText: text2.slice(0, headers[0].start), reason: "Unsupported Unity preamble" });
  const ids = /* @__PURE__ */ new Map();
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i], end = headers[i + 1]?.start ?? text2.length, source = context.source(header.start, end), match = /^--- !u!([0-9]+) &(-?(?:0|[1-9][0-9]*))(?: stripped)?$/.exec(header.content);
    if (!match) {
      issues.push({ code: "UNITY_HEADER_INVALID", message: "Malformed Unity document header", source: context.source(header.start, header.end) });
      unparsedDocuments.push({ source, rawText: text2.slice(header.start, end), reason: "Malformed Unity document header" });
      continue;
    }
    const classId = match[1];
    if (classId.length > 32) limit("UNITY_CLASS_ID_LIMIT");
    let id;
    try {
      id = fileId(match[2], { zero: false });
    } catch (e) {
      issues.push({ code: "UNITY_FILE_ID_INVALID", message: e.message, source: context.source(header.start, header.end) });
      unparsedDocuments.push({ source, rawText: text2.slice(header.start, end), reason: e.message });
      continue;
    }
    const object = { fileId: id, classId, rootType: null, properties: /* @__PURE__ */ Object.create(null), propertySources: /* @__PURE__ */ Object.create(null), references: [], parameters: [], parameterUses: [], source, coverage: "partial" };
    objects.push(object);
    const same = ids.get(id) ?? [];
    same.push(object);
    ids.set(id, same);
    const localIssues = [];
    let parsed;
    try {
      parsed = parseSubset(context, header.next, end, localIssues);
    } catch (e) {
      if (!(e instanceof SyntaxIssue)) throw e;
      localIssues.push(context.issue(e));
    }
    if (parsed && !parsed.duplicate) {
      if (parsed.ast.kind !== "map" || parsed.ast.value.length !== 1 || parsed.ast.value[0].node.kind !== "map") localIssues.push({ code: "UNITY_ROOT_UNSUPPORTED", message: "A Unity document needs exactly one mapping root", source });
      else {
        const entry = parsed.ast.value[0];
        object.rootType = entry.key;
        if (own4(roots, classId) && roots[classId] !== entry.key) localIssues.push({ code: "UNITY_CLASS_ROOT_MISMATCH", message: "Unity classID and root name disagree", source });
        else {
          const data = materialize(entry.node, context);
          object.properties = data.value;
          object.propertySources = data.positions;
          if (preambleValid) {
            object.references = referencesFrom(entry.node, context, classId, localIssues);
            const rules = deriveParameterRules(object);
            object.parameters = rules.parameters;
            object.parameterUses = rules.parameterUses;
            localIssues.push(...rules.issues);
            object.ruleSetVersion = TEXT_RULES_VERSION;
            object.coverage = localIssues.length ? "partial" : "serialized";
          }
        }
      }
    }
    if (!parsed || parsed.duplicate || !preambleValid || localIssues.some((x) => x.code === "UNITY_ROOT_UNSUPPORTED" || x.code === "UNITY_CLASS_ROOT_MISMATCH")) {
      object.rawText = text2.slice(header.start, end);
      object.references = [];
      object.parameters = [];
      object.parameterUses = [];
    }
    issues.push(...localIssues);
  }
  for (const entries of ids.values()) if (entries.length > 1) {
    const first = entries[0];
    for (const o of entries) {
      o.coverage = "partial";
      o.references = [];
      o.parameters = [];
      o.parameterUses = [];
    }
    issues.push({ code: "DUPLICATE_DOCUMENT_FILE_ID", message: `Duplicate document fileID: ${first.fileId}`, source: first.source, relatedSources: entries.slice(1).map((o) => o.source) });
  }
  const coverage = issues.length || objects.some((o) => o.coverage !== "serialized") ? "partial" : "serialized";
  return { path, objects, coverage, ...coverage === "partial" ? { reason: "Some document syntax, identity or rule semantics are unresolved" } : {}, issues, unparsedDocuments, parserVersion: TEXT_PARSER_VERSION };
}

// ../pages-adjustment/docs/shared/unity-analysis/ingest-task.mjs
var PARSER_VERSION = "unity-text-1";
var isIngest = (t) => t === "unity-expand" || t === "unity-parse" || t === "unity-parse-batch";
var MAX_IN2 = 16 * 1024 * 1024;
var MAX_OUT2 = 64 * 1024 * 1024;
var MAX_TEXT = 4 * 1024 * 1024;
var PARSE_BATCH_LIMITS = Object.freeze({ maxFiles: 8, maxInputBytes: 256 * 1024, maxFileIRBytes: LIMITS.maxInputBytes, maxResultBytes: LIMITS.maxInputBytes + 64 * 1024 });
function byteArray(b) {
  if (!(b instanceof Uint8Array) || typeof SharedArrayBuffer !== "undefined" && b.buffer instanceof SharedArrayBuffer || b.buffer.resizable || b.byteLength > MAX_IN2) throw TypeError("Invalid owned ingestion bytes");
  return b;
}
function batchFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > PARSE_BATCH_LIMITS.maxFiles) throw RangeError("PARSE_BATCH_FILE_COUNT_LIMIT");
  let total = 0;
  const seen = /* @__PURE__ */ new Set();
  return files.map((file) => {
    const path = safePath2(file?.path), data = byteArray(file?.bytes), key = path.normalize("NFC").toLowerCase();
    total += data.byteLength;
    if (total > PARSE_BATCH_LIMITS.maxInputBytes) throw RangeError("PARSE_BATCH_INPUT_LIMIT");
    if (seen.has(key)) throw TypeError("PARSE_BATCH_PATH_CONFLICT");
    for (const prior of seen) if (key.startsWith(prior + "/") || prior.startsWith(key + "/")) throw TypeError("PARSE_BATCH_PATH_CONFLICT");
    seen.add(key);
    return { path, bytes: data };
  });
}
function inspectTaskRequest3(r) {
  if (!r || r.protocolVersion !== 1 || !isIngest(r.taskType) || r.taskVersion !== 1 || typeof r.jobId !== "string" || !/^[A-Za-z0-9_.:-]{1,64}$/.test(r.jobId) || !Number.isSafeInteger(r.inputRevision) || r.inputRevision < 0) throw TypeError("Invalid ingestion identity");
  const timeoutMs = r.limits?.timeoutMs ?? 3e4;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4) throw RangeError("Invalid ingestion timeout");
  const payload = r.taskType === "unity-parse-batch" ? { files: batchFiles(r.payload?.files) } : { path: safePath2(r.payload?.path), bytes: byteArray(r.payload?.bytes) };
  return { protocolVersion: 1, taskType: r.taskType, taskVersion: 1, jobId: r.jobId, inputRevision: r.inputRevision, wasmVariant: "javascript", kernelHash: null, payload, limits: { timeoutMs } };
}
var snapshotTaskRequest3 = (r) => ({ ...r, payload: r.taskType === "unity-parse-batch" ? { files: r.payload.files.map((f) => ({ path: f.path, bytes: f.bytes.slice() })) } : { path: r.payload.path, bytes: r.payload.bytes.slice() } });
var inputBytes3 = (r) => r.taskType === "unity-parse-batch" ? r.payload.files.reduce((n, f) => n + f.bytes.byteLength, 0) : r.payload.bytes.byteLength;
var kernelInfo3 = () => ({ key: PARSER_VERSION, requiresWasm: false, retainResult: false, sha256: null, variant: "javascript", abi: PARSER_VERSION });
var resultShape3 = (r) => r.taskType === "unity-parse-batch" ? { kind: "unity-parsed-batch", count: r.payload.files.length, paths: r.payload.files.map((f) => f.path), byteLengths: r.payload.files.map((f) => f.bytes.byteLength) } : { kind: r.taskType === "unity-expand" ? "unity-expanded" : "unity-parsed", path: r.payload.path, byteLength: r.payload.bytes.byteLength };
var validFile = (f, path, length) => plain(f) && f.path === path && f.byteLength === length && /^[0-9a-f]{64}$/.test(f.contentHash) && Array.isArray(f.objects) && Array.isArray(f.issues) && ["serialized", "partial", "opaque", "meta-only"].includes(f.coverage);
function validTaskResult3(t, s, r) {
  if (!r || r.kind !== s.kind || r.parserVersion !== PARSER_VERSION) return false;
  if (t === "unity-parse-batch") {
    if (!Array.isArray(r.files) || r.files.length !== s.count || s.count < 1 || s.count > PARSE_BATCH_LIMITS.maxFiles) return false;
    let total2 = 0;
    for (let i = 0; i < r.files.length; i++) {
      const f = r.files[i];
      if (!validFile(f, s.paths[i], s.byteLengths[i])) return false;
      total2 += bytes(f);
      if (total2 > PARSE_BATCH_LIMITS.maxFileIRBytes || bytes({ kind: "unity-parsed", path: f.path, parserVersion: PARSER_VERSION, file: f }) > MAX_TEXT) return false;
    }
    return bytes(r) <= PARSE_BATCH_LIMITS.maxResultBytes;
  }
  if (r.path !== s.path) return false;
  if (t === "unity-parse") return validFile(r.file, s.path, s.byteLength) && bytes(r) <= MAX_TEXT;
  if (!Array.isArray(r.files) || r.files.length > 2048) return false;
  let total = 0;
  for (const f of r.files) {
    safePath2(f.path);
    if (!(f.bytes instanceof Uint8Array) || typeof SharedArrayBuffer !== "undefined" && f.bytes.buffer instanceof SharedArrayBuffer) return false;
    total += f.bytes.byteLength;
  }
  return total <= MAX_OUT2;
}
var resultBytes3 = (r) => r?.kind === "unity-expanded" ? r.files.reduce((n, f) => n + f.bytes.byteLength, 0) : r ? bytes(r) : 0;
var freezeTaskResult3 = freezeDeep;
var transferTaskInput3 = (r) => r.taskType === "unity-parse-batch" ? [...new Set(r.payload.files.map((f) => f.bytes.buffer))] : [r.payload.bytes.buffer];
var transferTaskResult3 = (r) => r.kind === "unity-expanded" ? [...new Set(r.files.map((f) => f.bytes.buffer))] : [];
var prepareTaskModule3 = () => {
  throw Error("Ingestion has no WASM");
};
var instantiateTask3 = () => null;
async function parseFile({ path, bytes: raw }) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", raw)), (b) => b.toString(16).padStart(2, "0")).join("");
  let file;
  const supported = /\.(controller|anim|prefab|unity|asset|mat|overrideController|meta)$/i.test(path);
  if (!supported) file = { path, objects: [], coverage: "opaque", reason: "Unsupported extension; bytes inventoried", issues: [] };
  else if (raw.length > MAX_TEXT) throw RangeError("TEXT_BYTE_LIMIT");
  else {
    let text2;
    try {
      text2 = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      file = { path, objects: [], coverage: "opaque", reason: "Non UTF-8 or binary content", issues: [] };
    }
    if (text2 !== void 0) {
      if (text2.includes("\0")) file = { path, objects: [], coverage: "opaque", reason: "Binary content (NUL)", issues: [] };
      else file = parseUnityFile({ path, text: text2 });
    }
  }
  file.contentHash = hash;
  file.byteLength = raw.byteLength;
  const result = { kind: "unity-parsed", path, parserVersion: PARSER_VERSION, file };
  if (bytes(result) > MAX_TEXT) throw RangeError("FILE_IR_LIMIT");
  return result;
}
async function executeTask3(r) {
  if (r.taskType === "unity-expand") return { kind: "unity-expanded", path: r.payload.path, parserVersion: PARSER_VERSION, files: expandInput(r.payload) };
  if (r.taskType !== "unity-parse-batch") return parseFile(r.payload);
  const files = [];
  let total = 0;
  for (const input of r.payload.files) {
    const result2 = await parseFile(input);
    total += bytes(result2.file);
    if (total > PARSE_BATCH_LIMITS.maxFileIRBytes) throw RangeError("SNAPSHOT_IR_LIMIT");
    files.push(result2.file);
  }
  const result = { kind: "unity-parsed-batch", parserVersion: PARSER_VERSION, files };
  if (bytes(result) > PARSE_BATCH_LIMITS.maxResultBytes) throw RangeError("PARSE_BATCH_RESULT_LIMIT");
  return result;
}
var taskInputCount3 = inputBytes3;

// ../pages-adjustment/docs/shared/compute/tasks.mjs
var MAX_MEDIA_INPUT_BYTES = Reflect.get(registered_tasks_exports, "MAX_MEDIA_INPUT_BYTES");
var adapter = (r) => isIngest(typeof r === "string" ? r : r?.taskType) ? ingest_task_exports : isUnity(typeof r === "string" ? r : r?.taskType) ? pool_task_exports : registered_tasks_exports;
var resultAdapter = (r) => ["unity-expanded", "unity-parsed", "unity-parsed-batch"].includes(r?.kind) ? ingest_task_exports : r?.kind?.startsWith("unity-") ? pool_task_exports : registered_tasks_exports;
var inspectTaskRequest4 = (r) => adapter(r).inspectTaskRequest(r);
var kernelInfo4 = (r) => adapter(r).kernelInfo(r);
var transferTaskResult4 = (r) => resultAdapter(r).transferTaskResult(r);
var prepareTaskModule4 = (o) => adapter(o).prepareTaskModule(o);
var instantiateTask4 = (r, m) => adapter(r).instantiateTask(r, m);
var executeTask4 = (r, k) => adapter(r).executeTask(r, k);
var taskInputCount4 = (r, v) => adapter(r).taskInputCount(r, v);

// ../pages-adjustment/docs/shared/compute/pool-worker.mjs
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
  const fail2 = (error) => {
    self.postMessage({ ...identity, type: "error", message: String(error?.message ?? error).slice(0, 240) });
    cleanup();
  };
  try {
    if (data?.buildId !== BUILD_ID || !Number.isSafeInteger(data?.generation) || data.generation < 1 || data.startTogether !== void 0 && typeof data.startTogether !== "boolean") throw Error("Invalid worker identity/options");
    request = inspectTaskRequest4(data);
    const info = kernelInfo4(request);
    if (request.taskType !== "ft-magnitude-batch" && data.kernelHash !== info.sha256) throw Error("Kernel identity mismatch");
    self.postMessage({ ...identity, type: "phase", phase: "loading", bootEpochMs });
    let compileCalls = 0, wasmContentType = null;
    const startTogether = data.startTogether === true, needsWasm = info.requiresWasm !== false;
    const moduleStarted = performance.now();
    const module = needsWasm ? data.module ?? await prepareTaskModule4({ taskType: request.taskType, wasmVariant: request.wasmVariant, onCompile: () => compileCalls++, onResponse: (value2) => {
      wasmContentType = value2;
    } }) : null;
    const modulePrepareMs = performance.now() - moduleStarted, instantiateStarted = performance.now();
    kernel = needsWasm ? instantiateTask4(request, module) : null;
    const instantiateMs = needsWasm ? performance.now() - instantiateStarted : null;
    const preparedAt = performance.now();
    const compute = async () => {
      try {
        const computeStart = performance.now();
        self.postMessage({ ...identity, type: "phase", phase: "computing", instanceId: kernel?.instanceId ?? null, bootEpochMs });
        const result = await executeTask4(request, kernel), transfer = transferTaskResult4(result);
        const computeEnd = performance.now();
        self.postMessage({ ...identity, type: "result", instanceId: kernel?.instanceId ?? null, result, metrics: { buildId: BUILD_ID, wasmSha256: info.sha256, wasmVariant: info.variant, kernelAbi: info.abi, wasmContentType, bootEpochMs, modulePrepareMs: needsWasm ? modulePrepareMs : null, instantiateMs, loadMs: preparedAt - started, readyWaitMs: startTogether ? computeStart - preparedAt : 0, startTogether, computeMs: computeEnd - computeStart, computeStartEpochMs: performance.timeOrigin + computeStart, computeEndEpochMs: performance.timeOrigin + computeEnd, memoryBytes: kernel?.memory.buffer.byteLength ?? null, wasmNotApplicable: needsWasm ? null : "JavaScript parsing task", inputCount: taskInputCount4(request, result), compileCalls, moduleReuse: needsWasm && data.module instanceof WebAssembly.Module, arena: kernel?.resourceStats?.() ?? null, memoryMeasurement: null } }, transfer);
        cleanup();
      } catch (error) {
        fail2(error);
      }
    };
    if (startTogether) {
      pending = { identity, run: compute };
      self.postMessage({ ...identity, type: "phase", phase: "ready", instanceId: kernel?.instanceId ?? null, bootEpochMs });
    } else await compute();
  } catch (error) {
    fail2(error);
  }
};
