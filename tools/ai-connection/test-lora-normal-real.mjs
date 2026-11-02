#!/usr/bin/env node
// Host for normal real-File LoRA transactions with separately reused diagnostics. Original files are supplied
// as local browser File inputs, never HTTP payloads or host readFile buffers.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPOSITORY = 'https://github.com/Kushyameln01/kushyameln-works';
const MANAGER_COMMIT = '8849891f19124df31847bd691503c2491278eaa8';
const NATIVE_OWNER_COMMIT = '48ff155988d995fc2569e495c8d8820273bd472c';
const ORACLE = Object.freeze({source: 'a80db72feea60b9bd69e292e4716665c6f0ee77f',
  peer: '7ee36228030ba3bb544a90b1d4b528702a7bae32', manifestBytes: 21434,
  manifestSHA256: '04e643dfddf37337c44d210d20c44b9eefe0d2328efbc7833a0903d59c0167ef'});
const MAX_ARTIFACT = 2 * 1024 * 1024;
const KERNEL = Object.freeze({byteLength: 5051, sha256: '3ab8e4c5cba71083f5457e7b9d6d0ac6aec92c7d76ec1360b3c1547e16eddb24'});
const USAGE = 'node tools/ai-connection/test-lora-normal-real.mjs --base-file <local LOW base.safetensors> --file <local light LOW.safetensors> --oracle-root <source-pinned controlled oracle directory> --diffusion-root <normal consumer checkout> --diffusion-commit <full native SHA> --manager-root <884 checkout> --out <new empty private directory> [--timeout-ms <positive milliseconds>]';
const within = (file, directory) => file === directory || file.startsWith(directory + path.sep);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identity = stat => Object.fromEntries(['size', 'mtimeNs', 'ctimeNs', 'ino', 'dev'].map(key => [key, String(stat[key])]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const safeName = name => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(name) && !name.endsWith('.safetensors');
const safePath = value => typeof value === 'string' && !value.includes('\\') && !value.includes('\0')
  && value.split('/').every(part => part && part !== '.' && part !== '..');
const errorText = error => String(error?.stack ?? error);
async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error(label + ' timeout')), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function argumentsOf(argv) {
  const known = ['base-file', 'file', 'oracle-root', 'diffusion-root', 'diffusion-commit', 'manager-root', 'out', 'timeout-ms'];
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!argv[i]?.startsWith('--') || !known.includes(key) || !argv[i + 1] || Object.hasOwn(args, key))
      throw Error('Explicit unique known argument/value required.\n' + USAGE);
    args[key] = argv[i + 1];
  }
  for (const key of known.filter(key => key !== 'timeout-ms')) if (!args[key]) throw Error('Missing --' + key + '\n' + USAGE);
  if (!/^[a-f0-9]{40}$/.test(args['diffusion-commit'])) throw Error('Explicit full --diffusion-commit required');
  if (args['diffusion-commit'] !== NATIVE_OWNER_COMMIT) throw Error('This normal transaction fixture requires the fixed Diffusion owner48ff source');
  const timeout = args['timeout-ms'] === undefined ? 3_600_000 : Number(args['timeout-ms']);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 86_400_000) throw Error('Bounded positive --timeout-ms required');
  return {...args, timeout};
}

async function mapLimit(items, concurrency, action) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await action(items[index]); }
  }));
  return output;
}

// Only the host Node process and this explicitly launched Chromium tree count.
// Linux /proc stat identity prevents unrelated/reused PIDs from being attached.
async function createRssSampler() {
  const intervalMs = 500, maxSamples = 7200, processes = new Map(), owned = new Map(), samples = [], errors = [];
  let chromiumRoot = null, stopped = false, pending = null, skipped = 0, dropped = 0, churn = 0, incompleteSamples = 0, unprovenAncestry = 0;
  let peak = null, interval = null, errorCount = 0;
  const startedUTC = new Date().toISOString(), started = performance.now();
  const note = (operation, error) => { errorCount++; if (errors.length < 200) errors.push({operation, error: String(error?.message ?? error)}); };
  async function statOf(pid) {
    try {
      const text = await fs.readFile(`/proc/${pid}/stat`, 'utf8'), close = text.lastIndexOf(')'), open = text.indexOf('(');
      const parts = text.slice(close + 2).trim().split(/\s+/);
      if (open < 0 || close < open || parts.length < 22 || !/^\d+$/.test(parts[19])) throw Error('Invalid proc stat');
      return {pid, ppid: Number(parts[1]), startTimeTicks: parts[19], name: text.slice(open + 1, close)};
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) churn++; else note('stat:' + pid, error);
      return null;
    }
  }
  const host = await statOf(process.pid);
  if (!host) throw Error('Cannot anchor host process identity for RSS sampling');
  function remember(value, role) {
    const key = value.pid + ':' + value.startTimeTicks;
    if (!processes.has(key)) processes.set(key, {...value, role, samples: 0, observedPeakRssBytes: null});
    return key;
  }
  remember(host, 'host-node');
  async function rssOf(value, role) {
    try {
      const before = await statOf(value.pid);
      if (!before || before.startTimeTicks !== value.startTimeTicks) return null;
      const status = await fs.readFile(`/proc/${value.pid}/status`, 'utf8'), match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
      const after = await statOf(value.pid);
      if (!after || after.startTimeTicks !== value.startTimeTicks) return null;
      if (!match) throw Error('VmRSS unavailable');
      const rssBytes = Number(match[1]) * 1024;
      if (!Number.isSafeInteger(rssBytes) || rssBytes < 0) throw Error('Invalid VmRSS');
      const key = remember(after, role), entry = processes.get(key);
      entry.samples++; entry.observedPeakRssBytes = Math.max(entry.observedPeakRssBytes ?? 0, rssBytes);
      entry.lastPpid = after.ppid;
      return {pid: value.pid, startTimeTicks: value.startTimeTicks, ppid: after.ppid, role, rssBytes};
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) churn++; else note('rss:' + value.pid, error);
      return null;
    }
  }
  async function collect() {
    const began = performance.now();
    try {
      const names = (await fs.readdir('/proc')).filter(name => /^\d+$/.test(name));
      const all = (await mapLimit(names, 16, name => statOf(Number(name)))).filter(Boolean), byPid = new Map(all.map(value => [value.pid, value]));
      const current = new Map();
      for (const [key, prior] of owned) if (byPid.get(prior.pid)?.startTimeTicks === prior.startTimeTicks) current.set(key, byPid.get(prior.pid));
      if (chromiumRoot && byPid.get(chromiumRoot.pid)?.startTimeTicks === chromiumRoot.startTimeTicks)
        current.set(chromiumRoot.pid + ':' + chromiumRoot.startTimeTicks, byPid.get(chromiumRoot.pid));
      let changed = true;
      while (changed) {
        changed = false; const parents = new Map([...current.values()].map(value => [value.pid, value]));
        for (const value of all) {
          const key = value.pid + ':' + value.startTimeTicks, parent = parents.get(value.ppid);
          if (current.has(key) || !parent) continue;
          // Prove the parent identity around a fresh child observation. A global
          // proc sweep alone can mix an exited parent's PID with a reused PID.
          const before = await statOf(parent.pid), child = await statOf(value.pid), after = await statOf(parent.pid);
          if (before?.startTimeTicks !== parent.startTimeTicks || after?.startTimeTicks !== parent.startTimeTicks
            || child?.startTimeTicks !== value.startTimeTicks || child.ppid !== parent.pid) { unprovenAncestry++; continue; }
          current.set(key, child); changed = true;
        }
      }
      for (const [key, value] of current) owned.set(key, value);
      const selected = [{...host, role: 'host-node'}, ...[...current.values()].map(value => ({...value, role: 'owned-chromium'}))];
      const observations = (await mapLimit(selected, 8, value => rssOf(value, value.role))).filter(Boolean);
      const hostRssBytes = observations.find(value => value.role === 'host-node')?.rssBytes ?? null;
      const chromiumObservations = observations.filter(value => value.role === 'owned-chromium');
      const chromiumRssBytesSum = chromiumObservations.reduce((total, value) => total + value.rssBytes, 0);
      const sample = {elapsedMs: performance.now() - started, utc: new Date().toISOString(),
        sweepDurationMs: performance.now() - began, expectedProcesses: selected.length, observedProcesses: observations.length,
        completeForDiscoveredTree: observations.length === selected.length,
        hostRssBytes, chromiumRssBytesSum,
        selectedProcessRssBytesSum: hostRssBytes === null ? null : hostRssBytes + chromiumRssBytesSum,
        processes: observations};
      if (!sample.completeForDiscoveredTree) incompleteSamples++;
      if (sample.selectedProcessRssBytesSum !== null && (!peak || sample.selectedProcessRssBytesSum > peak.selectedProcessRssBytesSum)) peak = sample;
      samples.push(sample); if (samples.length > maxSamples) { samples.shift(); dropped++; }
    } catch (error) { note('sweep', error); }
  }
  function sample() {
    if (pending) { skipped++; return pending; }
    pending = collect().finally(() => pending = null); return pending;
  }
  await sample();
  interval = setInterval(() => { if (!stopped) void sample(); }, intervalMs);
  return {
    async anchorChromium(pid) {
      if (!Number.isSafeInteger(pid) || pid <= 0 || chromiumRoot) throw Error('One explicit owned Chromium PID required');
      const value = await statOf(pid); if (!value) throw Error('Cannot anchor owned Chromium process identity');
      chromiumRoot = {...value, capturedUTC: new Date().toISOString()};
      owned.set(pid + ':' + value.startTimeTicks, value); await sample();
    }, sample,
    async stop() {
      stopped = true; clearInterval(interval); if (pending) await pending; await sample();
      const usage = process.resourceUsage();
      return {schemaVersion: 'lora-owned-process-rss/0.1-draft.1', hostPid: process.pid,
        hostIdentity: host, ownedChromiumRoot: chromiumRoot, intervalMs, startedUTC,
        finishedUTC: new Date().toISOString(), elapsedMs: performance.now() - started,
        measurementStatus: !chromiumRoot ? 'HOST_ONLY_NO_CHROMIUM_ANCHOR'
          : errorCount || incompleteSamples ? 'PARTIAL_SAMPLED_OBSERVATION' : 'SAMPLED_OBSERVATION',
        retainedSamples: samples.length, droppedSamples: dropped, skippedOverlappingSweeps: skipped, incompleteSamples,
        processChurnReads: churn, excludedUnprovenAncestryObservations: unprovenAncestry, errorCount, retainedErrors: errors,
        processTreeSampledRssSumPeakBytes: peak?.selectedProcessRssBytesSum ?? null,
        sampledPeakObservation: peak, processRecords: [...processes.values()], samples,
        nodeProcess: {rssBytesAtEnd: process.memoryUsage().rss, resourceUsageMaxRSSKiB: usage.maxRSS,
          resourceUsageMaxRSSBytes: usage.maxRSS * 1024, resourceUsageMeasurementPlatform: process.platform},
        definition: 'At each noninstantaneous sweep: host Node VmRSS plus sum of only anchored owned Chromium-tree VmRSS; peak is max of those sums, not sum of individual PID peaks.',
        limits: ['RSS sum can count shared pages more than once.', '500ms sampling can miss short peaks and short-lived or undiscovered orphan processes.',
          'Chromium startup before the PID/starttime anchor is not covered.', 'Sweeps are not atomic and incomplete observations remain marked.',
          'Other host children and sibling browsers are excluded.', 'Global file cache, GPU/device memory and full pipeline allocator peaks are not measured.',
          'Final evidence JSON serialization/write occurs after this sampling window.'],
        OSOrDevicePeakMeasured: false};
    }
  };
}

async function main(args) {
  const started = performance.now(), requestedOut = path.resolve(args.out);
  const FIXED = Object.freeze({diffusion: args['diffusion-commit'], manager: MANAGER_COMMIT});
  const roots = {receiver: root, lora: root,
    diffusion: await fs.realpath(args['diffusion-root']), manager: await fs.realpath(args['manager-root'])};
  const oracleRoot = await fs.realpath(args['oracle-root']);
  const loraPath = await fs.realpath(args.file), basePath = await fs.realpath(args['base-file']);
  for (const directory of new Set(Object.values(roots))) {
    if ([loraPath, basePath, oracleRoot, requestedOut].some(value => within(value, directory)))
      throw Error('Private inputs/oracle/output must stay outside source repositories');
  }
  if (within(requestedOut, oracleRoot) || within(oracleRoot, requestedOut)) throw Error('New output must not contain or overwrite oracle input');
  await fs.mkdir(requestedOut, {recursive: true, mode: 0o700});
  const out = await fs.realpath(requestedOut);
  for (const directory of [...new Set(Object.values(roots)), oracleRoot]) if (within(out, directory)) throw Error('Resolved output escapes into source/oracle');
  if ((await fs.readdir(out)).length) throw Error('Use a new empty private --out directory');
  await fs.chmod(out, 0o700);
  const actualDir = path.join(out, 'actual'); await fs.mkdir(actualDir, {mode: 0o700});
  const report = {dateUTC: new Date().toISOString(), status: 'FAIL_BEFORE_BROWSER_DISPATCH',
    scope: 'normal light/LOW real-File weight transactions; independent controlled K4 diagnostics separately reused; no management P4 snapshot admission',
    completeAdapter: false, modelInference: false, generationReady: false, browserInvocationDispatched: false,
    baseWholeFileBufferedByHost: false, baseWholeFileHashComputedByHost: false,
    originalWholeFileHashComputedByHost: false, expectationsGeneratedByHost: false,
    privateOriginalHTTPServingEnabled: false};
  const records = new Map(), artifacts = [], requests = [], serverErrors = [], pageErrors = [], cleanupErrors = [], serving = new Set();
  let server, browserServer, browser, sampler, timeoutTimer;
  const git = (...argv) => execFileSync('git', argv, {cwd: root, maxBuffer: 64 * 1024 * 1024});
  const sourceCache = new Map(), oracleFiles = new Map(), oracleIdentities = new Map();
  let loraStat, baseStat, manifestStat;
  try {
    sampler = await createRssSampler();
    const ownCommit = git('rev-parse', 'HEAD').toString().trim();
    report.receiverCommit = ownCommit; report.fixedCommits = {...FIXED, lora: ownCommit};
    for (const owner of ['diffusion', 'manager']) {
      const observed = execFileSync('git', ['-C', roots[owner], 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
      if (observed !== FIXED[owner]) throw Error(owner + ' checkout differs from the fixed commit');
    }
    async function source(owner, repoPath, reason = 'preflight') {
      if (!safePath(repoPath)) throw Error('Unsafe fixed source path');
      const key = owner + ':' + repoPath;
      if (!sourceCache.has(key)) {
        const commit = ['receiver', 'lora'].includes(owner) ? ownCommit : FIXED[owner];
        const file = path.resolve(roots[owner], repoPath), real = await fs.realpath(file);
        if (!within(real, roots[owner]) || real === roots[owner]) throw Error('Source path escapes owner root');
        const bytes = await fs.readFile(real), pinned = git('show', commit + ':' + repoPath);
        if (!bytes.equals(pinned)) throw Error('Source bytes differ from fixed Git object: ' + key);
        sourceCache.set(key, bytes);
        records.set(key, {owner, commit, path: repoPath, bytes: bytes.length, sha256: sha(bytes),
          gitBlobSha: git('rev-parse', commit + ':' + repoPath).toString().trim(), servedRequests: 0,
          executedByHost: owner === 'receiver' && repoPath === 'tools/ai-connection/test-lora-normal-real.mjs'});
      }
      if (reason === 'http') records.get(key).servedRequests++;
      return sourceCache.get(key);
    }
    const runner = await source('receiver', 'tools/ai-connection/test-lora-normal-real.mjs');
    await source('receiver', 'tools/ai-connection/lora-normal-real-browser.mjs');
    report.runnerSourceSHA256 = sha(runner);
    const pinPaths = {
      sdk: ['lora', 'docs/shared/inference/lora/sdk-v2.mjs'],
      planner: ['lora', 'docs/shared/inference/lora/planner-v2.mjs'],
      adapter: ['lora', 'docs/shared/inference/lora/diffusion-p4-adapter.mjs'],
      sourceBindings: ['lora', 'docs/shared/inference/lora/p4-source-bindings.mjs'],
      kernel: ['lora', 'docs/shared/inference/lora/kernel/lora.wasm'],
      diffusion: ['diffusion', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/weights.mjs'],
      stage: ['diffusion', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/stage.mjs'],
      conditioning: ['diffusion', 'docs/shared/diffusion-models/ort-bridge/post-self-attention/conditioning.mjs'],
      queue: ['manager', 'docs/shared/ai-connection/queue.mjs']
    };
    const sourcePins = {};
    for (const [role, [owner, repoPath]] of Object.entries(pinPaths)) {
      const bytes = await source(owner, repoPath), record = records.get(owner + ':' + repoPath);
      sourcePins[role] = {repository: REPOSITORY, commit: record.commit, path: repoPath,
        byteLength: bytes.length, sha256: record.sha256};
    }
    if (sourcePins.kernel.byteLength !== KERNEL.byteLength || sourcePins.kernel.sha256 !== KERNEL.sha256) throw Error('Corrected fixed5051-byte LoRA kernel required');
    report.sourcePins = sourcePins;
    loraStat = await fs.stat(loraPath, {bigint: true}); baseStat = await fs.stat(basePath, {bigint: true});
    if (!loraStat.isFile() || !baseStat.isFile()) throw Error('Actual regular local LoRA/base Files required');
    const manifestPath = path.join(oracleRoot, 'manifest.json');
    if (!within(await fs.realpath(manifestPath), oracleRoot)) throw Error('Oracle manifest escapes its root');
    manifestStat = await fs.stat(manifestPath, {bigint: true});
    if (!manifestStat.isFile() || manifestStat.size > BigInt(MAX_ARTIFACT)) throw Error('Bounded oracle manifest required');
    const manifestBytes = await fs.readFile(manifestPath), oracleManifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(manifestBytes));
    if (manifestBytes.length !== ORACLE.manifestBytes || sha(manifestBytes) !== ORACLE.manifestSHA256) throw Error('Exact previously generated a80 oracle manifest required; do not regenerate expected values');
    if (!same(identity(manifestStat), identity(await fs.stat(manifestPath, {bigint: true})))) throw Error('Oracle manifest changed while reading');
    if (oracleManifest.schemaVersion !== 'lora-p4-controlled-oracle/0.1-draft.1' || oracleManifest.scope !== 'controlled-caller-input-n2-k4'
      || oracleManifest.selection?.pairId !== 'light' || oracleManifest.selection?.side !== 'LOW'
      || oracleManifest.selection?.noise !== 'low' || !same(oracleManifest.selection.rows, [0, 4])
      || !same(oracleManifest.selection.columns, [0, 5120]) || !hex(oracleManifest.original?.expectedSha256)
      || oracleManifest.selection.weightId !== 'blocks.0.cross_attn.q.weight'
      || oracleManifest.selection.biasWeightId !== 'blocks.0.cross_attn.q.bias'
      || !same(oracleManifest.selection.fullWeightShape, [5120, 5120])
      || !same(oracleManifest.selection.fullBiasShape, [5120]) || !hex(oracleManifest.original.headerSha256)
      || String(oracleManifest.original.byteLength) !== String(loraStat.size)
      || oracleManifest.original.wholeHashVerifiedByOracle !== false
      || !Array.isArray(oracleManifest.files) || !oracleManifest.files.length) throw Error('Explicit source-pinned controlled light/LOW Q4 oracle required');
    const execution = oracleManifest.executionSource;
    if (execution?.commit !== ORACLE.source || execution.peerCommit !== ORACLE.peer
      || !safePath(execution.path) || !safePath(execution.corePath) || !hex(execution.sha256)
      || !hex(execution.coreSha256) || !hex(execution.planSha256)) throw Error('Reused oracle must retain original a80/7ee identities');
    const historicalWrapper = git('show', ORACLE.source + ':' + execution.path);
    const historicalCore = git('show', ORACLE.peer + ':' + execution.corePath);
    const historicalPlan = git('show', ORACLE.peer + ':' + execution.planPath);
    if (sha(historicalWrapper) !== execution.sha256 || sha(historicalCore) !== execution.coreSha256
      || sha(historicalPlan) !== execution.planSha256) throw Error('Reused historical oracle source/plan bytes differ from Git');
    report.reusedOracleSources = [{commit: ORACLE.source, path: execution.path,
      bytes: historicalWrapper.length, sha256: sha(historicalWrapper)},
      {commit: ORACLE.peer, path: execution.corePath, bytes: historicalCore.length, sha256: sha(historicalCore)},
      {commit: ORACLE.peer, path: execution.planPath, bytes: historicalPlan.length, sha256: sha(historicalPlan)}];
    const oracleProof = [];
    for (const descriptor of oracleManifest.files) {
      if (!safeName(descriptor.file) || descriptor.file === 'manifest.json' || oracleFiles.has(descriptor.file)
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0 || descriptor.bytes > MAX_ARTIFACT || !hex(descriptor.sha256)) throw Error('Explicit unique bounded oracle descriptor required');
      const file = path.join(oracleRoot, descriptor.file), real = await fs.realpath(file);
      if (!within(real, oracleRoot) || real === oracleRoot) throw Error('Oracle reference escapes root');
      const before = await fs.stat(real, {bigint: true});
      if (!before.isFile() || String(before.size) !== String(descriptor.bytes)) throw Error('Oracle reference size mismatch');
      const bytes = await fs.readFile(real);
      if (bytes.length !== descriptor.bytes || sha(bytes) !== descriptor.sha256
        || !same(identity(before), identity(await fs.stat(real, {bigint: true})))) throw Error('Oracle reference bytes/hash or immutable identity mismatch');
      oracleFiles.set(descriptor.file, bytes); oracleIdentities.set(descriptor.file, identity(before));
      oracleProof.push({...descriptor, verified: true});
    }
    if (!oracleManifest.candidatePlan || oracleManifest.candidatePlan.sha256 !== execution.planSha256
      || !oracleFiles.has(oracleManifest.candidatePlan.file)
      || sha(oracleFiles.get(oracleManifest.candidatePlan.file)) !== execution.planSha256) throw Error('Oracle candidate plan is not in the immutable manifest file set');
    const allDescriptors = [oracleManifest.candidatePlan, oracleManifest.controlledInputArtifact,
      oracleManifest.gateArtifact, oracleManifest.sourceProof,
      oracleManifest.inputs?.residual, oracleManifest.inputs?.timeAct1,
      oracleManifest.inputs?.conditioning, oracleManifest.inputs?.conditioningMask,
      oracleManifest.base?.weight, oracleManifest.base?.bias, ...oracleManifest.cases.flatMap(c => [c.weight, c.bias, c.expectedOutput, c.forwardReference, c.independentPatchArtifact])];
    for (const descriptor of allDescriptors) if (!descriptor || !oracleFiles.has(descriptor.file)
      || descriptor.sha256 !== sha(oracleFiles.get(descriptor.file)) || descriptor.bytes !== oracleFiles.get(descriptor.file).length) throw Error('Oracle input/case references an undeclared or mismatched file');
    if (!same(oracleManifest.cases.map(c => c.strength), [0, 1, -1])) throw Error('Oracle diagnostic strengths must be explicit0,+1,-1');
    if (!same(oracleManifest.gates?.weight, {absolute: 1e-5, relative: 1e-4})
      || !same(oracleManifest.gates?.bias, {absolute: 0, relative: 0})
      || !same(oracleManifest.gates?.projection, {absolute: 0.01, relative: 0.001})
      || oracleManifest.gates?.projectionGateId !== 'p4-cross-ffn-composed-f32-v1') throw Error('Fixed predeclared controlled-oracle gates required');
    report.oracle = {manifestFile: 'manifest.json', byteLength: manifestBytes.length, sha256: sha(manifestBytes),
      executionSource: execution, selection: oracleManifest.selection, original: oracleManifest.original,
      baseIdentity: oracleManifest.base.identity, gates: oracleManifest.gates,
      controlledDeclaration: oracleManifest.inputs.declaration, files: oracleProof,
      newExpectationsGeneratedByHost: false, reuseOfOriginalOracle: true, oracleGenerationSourceUnchanged: true};
    report.inputSelection = {pairId: 'light', side: 'LOW', loraFileName: path.basename(loraPath),
      loraBytes: Number(loraStat.size), expectedLoRaSha256: oracleManifest.original.expectedSha256,
      baseFileName: path.basename(basePath), baseBytes: Number(baseStat.size),
      fullBaseHashComputedByThisHost: false, baseAuthentication: 'fixed native header/selected ranges; prior full-base receipt remains historical',
      historicalFourOriginalsRequired: false};
    report.basePriorEvidence = oracleManifest.base.identity;

    async function serve(req, res) {
      try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        requests.push({method: req.method, path: pathname});
        res.setHeader('Cache-Control', 'no-store');
        if (pathname === '/acceptance' && req.method === 'GET') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><input id="lora" type="file"><input id="base" type="file">'); return;
        }
        if (pathname.startsWith('/artifact/') && req.method === 'POST') {
          const name = pathname.slice('/artifact/'.length);
          if (!safeName(name) || !/\.(f32|f64|json|bin)$/.test(name)) throw Error('Unsafe selected output filename');
          let count = 0; const chunks = [];
          for await (const chunk of req) { count += chunk.length; if (count > MAX_ARTIFACT) throw Error('Per-artifact private output budget exceeded'); chunks.push(chunk); }
          const bytes = Buffer.concat(chunks);
          await fs.writeFile(path.join(actualDir, name), bytes, {mode: 0o600, flag: 'wx'});
          artifacts.push({file: name, bytes: bytes.length, sha256: sha(bytes)}); res.end('saved privately'); return;
        }
        if (req.method !== 'GET') { res.writeHead(405).end(); return; }
        if (pathname.startsWith('/oracle/')) {
          const name = pathname.slice('/oracle/'.length), bytes = safeName(name) ? oracleFiles.get(name) : null;
          if (!bytes) { res.writeHead(404).end(); return; }
          res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'application/octet-stream'); res.end(bytes); return;
        }
        let owner, repoPath;
        if (pathname.startsWith('/lora/shared/')) { owner = 'lora'; repoPath = 'docs/shared/' + pathname.slice('/lora/shared/'.length); }
        else if (pathname.startsWith('/diffusion/shared/')) { owner = 'diffusion'; repoPath = 'docs/shared/' + pathname.slice('/diffusion/shared/'.length); }
        else if (pathname.startsWith('/management/shared/')) { owner = 'manager'; repoPath = 'docs/shared/' + pathname.slice('/management/shared/'.length); }
        else if (pathname.startsWith('/receiver/tools/ai-connection/lora-normal-') && pathname.endsWith('.mjs')) { owner = 'receiver'; repoPath = pathname.slice('/receiver/'.length); }
        else { res.writeHead(404).end(); return; }
        if (!safePath(repoPath) || !['.mjs', '.js', '.wasm', '.json'].includes(path.extname(repoPath))) { res.writeHead(404).end(); return; }
        const bytes = await source(owner, repoPath, 'http'), ext = path.extname(repoPath);
        res.setHeader('Content-Type', ['.mjs', '.js'].includes(ext) ? 'text/javascript' : ext === '.wasm' ? 'application/wasm' : 'application/json'); res.end(bytes);
      } catch (error) { serverErrors.push(errorText(error)); if (!res.headersSent) res.writeHead(500); res.end('Pinned bounded request failed'); }
    }
    server = http.createServer((req, res) => {
      const task = serve(req, res); serving.add(task);
      void task.then(() => serving.delete(task), error => { serving.delete(task); serverErrors.push(errorText(error)); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const {chromium} = require(process.env.LORA_PLAYWRIGHT_MODULE ?? '/opt/codex/cua_node/lib/node_modules/playwright');
    browserServer = await chromium.launchServer({headless: true, timeout: 120_000,
      executablePath: process.env.LORA_CHROMIUM_PATH ?? '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage']});
    const child = browserServer.process(); if (!child?.pid) throw Error('Owned Chromium PID unavailable');
    await sampler.anchorChromium(child.pid);
    browser = await chromium.connect(browserServer.wsEndpoint(), {timeout: 120_000});
    report.browser = browser.version();
    const page = await browser.newPage(); page.setDefaultTimeout(120_000);
    page.on('pageerror', error => pageErrors.push(errorText(error)));
    page.on('console', message => { if (message.text().startsWith('LORA-NORMAL ')) console.log(message.text()); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/acceptance');
    // A connected Playwright browser can upload file paths through its protocol.
    // Native CDP File inputs avoid reading/streaming the15GB base in this host.
    const cdp = await page.context().newCDPSession(page);
    try {
      const document = await cdp.send('DOM.getDocument', {depth: 0});
      for (const [selector, file] of [['#lora', loraPath], ['#base', basePath]]) {
        const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: document.root.nodeId, selector});
        if (!nodeId) throw Error('Missing native file-picker input');
        await cdp.send('DOM.setFileInputFiles', {nodeId, files: [file]});
      }
    } finally { await cdp.detach(); }
    const picked = await page.evaluate(() => Object.fromEntries(['lora', 'base'].map(key => {
      const file = document.querySelector('#' + key).files[0]; return [key, file ? {name: file.name, size: file.size} : null];
    })));
    if (picked.lora?.size !== Number(loraStat.size) || picked.base?.size !== Number(baseStat.size)
      || picked.lora.name !== path.basename(loraPath) || picked.base.name !== path.basename(basePath)) throw Error('Browser native File picker metadata mismatch');
    report.browserFileInputs = {...picked, transport: 'CDP DOM.setFileInputFiles local path; no host payload upload', fullBaseArrayBufferReadByHost: false};
    report.browserInvocationDispatched = true;
    const executionPromise = page.evaluate(async ({oracleManifest, sourcePins}) => {
      try {
        const {runLoraNormalRealCases} = await import('/receiver/tools/ai-connection/lora-normal-real-browser.mjs');
        return await runLoraNormalRealCases({loraFile: document.querySelector('#lora').files[0],
          baseFile: document.querySelector('#base').files[0], oracleManifest, sourcePins});
      } catch (error) { return {status: 'FAIL', error: String(error?.stack ?? error), generationReady: false}; }
    }, {oracleManifest, sourcePins});
    const timeout = new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(Error('Normal LoRA real-File verification timeout')), args.timeout); });
    Object.assign(report, await Promise.race([executionPromise, timeout])); clearTimeout(timeoutTimer);
    report.inputFileUnchanged = same(identity(loraStat), identity(await fs.stat(loraPath, {bigint: true})));
    report.baseFileUnchanged = same(identity(baseStat), identity(await fs.stat(basePath, {bigint: true})));
    report.oracleManifestUnchanged = same(identity(manifestStat), identity(await fs.stat(manifestPath, {bigint: true})));
    report.oracleFilesUnchanged = (await Promise.all([...oracleIdentities].map(async ([name, before]) =>
      same(before, identity(await fs.stat(path.join(oracleRoot, name), {bigint: true})))))).every(Boolean);
    if (!report.inputFileUnchanged || !report.baseFileUnchanged || !report.oracleManifestUnchanged || !report.oracleFilesUnchanged)
      throw Error('Captured input/oracle File identities changed across execution');
    if (report.status !== 'PASS_LORA_NORMAL_REAL_PARTIAL' || report.generationReady !== false || report.completeAdapter !== false || report.modelInference !== false) {
      report.browserReportedStatus = report.status; report.status = 'FAIL';
      report.acceptanceError = 'Browser status or PARTIAL/generation/model scope invariant failed'; process.exitCode = 1;
    }
  } catch (error) {
    report.status = 'FAIL'; report.error = errorText(error); process.exitCode = 1;
  } finally {
    clearTimeout(timeoutTimer);
    try { await bounded(sampler?.sample(), 5000, 'Final RSS sample'); } catch (error) { cleanupErrors.push(errorText(error)); }
    try { await bounded(browser?.close(), 10_000, 'Browser connection close'); } catch (error) { cleanupErrors.push(errorText(error)); }
    try { await bounded(browserServer?.close(), 10_000, 'Owned Chromium close'); } catch (error) {
      cleanupErrors.push(errorText(error)); report.forcedChromiumKillRequested = true;
      try { await bounded(browserServer?.kill(), 3000, 'Owned Chromium kill'); }
      catch (failure) {
        cleanupErrors.push(errorText(failure));
        try { const child = browserServer?.process(); if (child && child.exitCode === null) child.kill('SIGKILL'); }
        catch (lastError) { cleanupErrors.push(errorText(lastError)); }
      }
    }
    try { report.hostResourceObservation = await bounded(sampler?.stop(), 5000, 'RSS sampler stop') ?? null; }
    catch (error) { cleanupErrors.push(errorText(error)); report.hostResourceObservation = null; }
    if (server) {
      server.closeAllConnections();
      try { await bounded(new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())), 5000, 'Private HTTP server close'); }
      catch (error) { cleanupErrors.push(errorText(error)); }
      try { await bounded(Promise.allSettled([...serving]), 5000, 'Private HTTP request drain'); }
      catch (error) { cleanupErrors.push(errorText(error)); }
    }
    report.pageErrors = pageErrors; report.serverErrors = serverErrors; report.cleanupErrors = cleanupErrors;
    report.privateInputHTTPRequests = requests.filter(request => request.method === 'GET'
      && (request.path.endsWith('.safetensors') || request.path.includes(path.basename(loraPath)) || request.path.includes(path.basename(basePath))));
    report.loadedSources = [...records.values()].filter(record => record.executedByHost || record.servedRequests > 0);
    report.preverifiedSources = [...records.values()]; report.selectedArtifacts = artifacts;
    report.requestSummary = {total: requests.length, oracle: requests.filter(request => request.path.startsWith('/oracle/')).length,
      selectedArtifactPosts: requests.filter(request => request.method === 'POST' && request.path.startsWith('/artifact/')).length};
    report.hostElapsedMs = performance.now() - started;
    report.hostResourceScope = 'Node PID and explicitly owned Chromium descendant sampled RSS; browser WASM/ORT/feed capacities are separate and must not be added as an OS/device peak';
    if (pageErrors.length || serverErrors.length || cleanupErrors.length || report.privateInputHTTPRequests.length) { report.status = 'FAIL'; process.exitCode = 1; }
    await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  }
  console.log(JSON.stringify({status: report.status, receiverCommit: report.receiverCommit,
    normalTransactions: report.normalTransactions?.length, diagnosticForwardCalls: report.diagnostics?.runtimeCalls?.length, artifacts: artifacts.length,
    sampledRssSumPeakBytes: report.hostResourceObservation?.processTreeSampledRssSumPeakBytes ?? null,
    generationReady: report.generationReady, result: path.join(out, 'result.json'), error: report.error}));
}

if (process.argv.length === 3 && process.argv[2] === '--help') console.log(USAGE);
else await main(argumentsOf(process.argv.slice(2)));
