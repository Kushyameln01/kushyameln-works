// Cleanup is based on current Layer graphs, not every retained YAML document.
// Motion data stays byte-identical; only declarations, defaults, and the proven
// obsolete EyeX reset operation are changed. No parameter hash computation.
import { buildStructureIndex } from './structure-index.mjs';
import { collectParameterFacts, buildParameterContract, emitParameterContract, validateParameterContract } from './parameter-contract.mjs';
import { splitUnityDocuments, joinUnityDocuments, extractReferences,
  extractAnimatorParameters, parseUnityScalar } from './unity-text.mjs';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const SDK = '67cc4cb7839cd3741b63733d5adf0442';
const assert = (ok, message) => { if (!ok) throw new Error(`Parameter cleanup: ${message}`); };
const sorted = values => [...new Set(values)].sort();
const identity = (guid, fileId) => `${guid.toLowerCase()}:${fileId}`;

function field(text, name, indent = 2) {
  const matches = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}${name}:([^\\r\\n]*)`, 'gm'))];
  assert(matches.length === 1, `Missing/ambiguous field ${name}`);
  return parseUnityScalar(matches[0][1]);
}
function section(text, name, indent = 2) {
  const fields = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'))];
  const indices = fields.flatMap((m, i) => m[1] === name ? [i] : []);
  assert(indices.length === 1, `Missing/ambiguous section ${name}`);
  const i = indices[0], start = fields[i].index, end = fields[i + 1]?.index ?? text.length;
  return { start, end, text: text.slice(start, end) };
}
function items(text, name) {
  const block = section(text, name).text;
  const value = field(block, name);
  assert(value === '' || value === '[]', `Unsupported sequence ${name}`);
  const result = block.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm) ?? [];
  assert(value !== '[]' || result.length === 0, `Nonempty ${name} with []`);
  return result;
}
const itemField = (text, name) => field(text.replace(/^  - /, '    '), name, 4);
function replaceItems(text, name, replacements) {
  const original = section(text, name), nl = original.text.includes('\r\n') ? '\r\n' : '\n';
  const value = `  ${name}:${replacements.length ? '' : ' []'}${nl}` + replacements.join('');
  return text.slice(0, original.start) + value + text.slice(original.end);
}
function script(doc) {
  if (doc.classId !== '114') return null;
  const refs = extractReferences(field(doc.text, 'm_Script'));
  assert(refs.length === 1 && refs[0].guid, 'Invalid MonoBehaviour script reference');
  return identity(refs[0].guid, refs[0].fileId);
}
function documents(assets) {
  return assets.flatMap(asset => splitUnityDocuments(dec.decode(asset.asset)).documents.map(doc => ({ asset, doc })));
}
function menuParameters(allDocs) {
  const result = new Set();
  for (const { doc } of allDocs) if (script(doc) === identity(SDK, '-340790334')) {
    for (const item of items(doc.text, 'controls')) {
      const normalized = item.replace(/^  - /, '    ');
      const parameter = section(normalized, 'parameter', 4).text;
      const name = field(parameter, 'name', 6); if (name) result.add(name);
      const sub = section(normalized, 'subParameters', 4).text;
      for (const match of sub.matchAll(/^    - name:([^\r\n]*)/gm)) {
        const value = parseUnityScalar(match[1]); if (value) result.add(value);
      }
    }
  }
  return result;
}
function validateBehaviours(index, allDocs) {
  const byId = new Map(allDocs.map(n => [identity(n.asset.guid, n.doc.fileId), n]));
  for (const object of index.objects.filter(o => o.class_id === '114' && o.reachability === 'layer_reference_reachable')) {
    const node = byId.get(object.object_id), id = script(node.doc);
    assert([identity(SDK, '-706344726'), identity(SDK, '1852460640'), identity(SDK, '-646210727')].includes(id),
      `Unknown live behaviour requires explicit parameter analysis: ${id}`);
    if (id === identity(SDK, '1852460640')) assert(field(node.doc.text, 'outputParamHash') === '0',
      'Nonzero layer-control output hash requires explicit parameter analysis');
    if (object.parameter_driver) for (const op of object.parameter_driver.operations)
      assert([0, 1, 2, 3].includes(op.type), `Unknown ParameterDriver operation ${op.type}`);
  }
}
function controllerUsage(controller, menus) {
  const reasons = new Map();
  function add(name, reason) {
    if (!name) return;
    const set = reasons.get(name) ?? new Set(); set.add(reason); reasons.set(name, set);
  }
  for (const layer of controller.layers) {
    for (const name of layer.read_parameters) add(name, 'live_read');
    for (const output of layer.clip_outputs) if (output.kind === 'animator_parameter') add(output.attribute, 'live_clip_write');
    for (const driver of layer.parameter_driver_operations) for (const op of driver.operations) add(op.destination, 'live_driver_write');
  }
  for (const name of menus) add(name, 'menu');
  return reasons;
}
/** Call after asset organization/Installer construction, before README/folders.
 * Stages every byte edit and commits only after all checks pass. */
export function cleanupFtParameters(assets, { outputRoot, channels } = {}) {
  assert(Array.isArray(assets) && assets.every(a => a.asset instanceof Uint8Array), 'Expected serialized assets, before documentation/folders');
  const draft = assets.map(a => ({ ...a }));
  let allDocs = documents(draft);
  const menus = menuParameters(allDocs);
  const before = buildStructureIndex(draft, { outputRoot }).index;
  validateBehaviours(before, allDocs);
  const originalFacts = collectParameterFacts(draft, { outputRoot, channels });
  const report = { analysis: 'current_layer_references_and_menu_parameters',
    excludes: ['retained_unreachable_objects', 'inactive_blend_fields', 'disabled_state_parameter_fields'],
    controllers: [], registrations: [], removed_driver_operations: [], defaults: [],
    runtime: 'UNVERIFIED' };

  // EyeX is an explicitly requested obsolete endpoint. Generic writer-only
  // removal would destroy externally useful outputs, so this exception is narrow.
  const consumers = new Set(before.controllers.flatMap(c => c.layers.flatMap(l => l.read_parameters)));
  const clipWrites = new Set(before.controllers.flatMap(c => c.layers.flatMap(l => l.clip_outputs
    .filter(o => o.kind === 'animator_parameter').map(o => o.attribute))));
  const removeEyeXReset = !consumers.has('v2/EyeX') && !clipWrites.has('v2/EyeX') && !menus.has('v2/EyeX');
  const liveDrivers = new Set(before.objects.filter(o => o.parameter_driver && o.reachability === 'layer_reference_reachable').map(o => o.object_id));
  const replacements = new Map();
  if (removeEyeXReset) for (const { asset, doc } of allDocs) {
    if (!liveDrivers.has(identity(asset.guid, doc.fileId))) continue;
    const list = items(doc.text, 'parameters'), kept = [];
    for (const item of list) {
      if (itemField(item, 'name') !== 'v2/EyeX') { kept.push(item); continue; }
      assert(itemField(item, 'type') === '0' && Number(itemField(item, 'value')) === 0 && itemField(item, 'source') === '',
        'EyeX has a non-reset Driver operation; cannot remove automatically');
      report.removed_driver_operations.push({ path: asset.path, file_id: doc.fileId, name: 'v2/EyeX',
        evidence: 'Set(0); no current Layer reader, Clip output, or Menu binding' });
    }
    if (kept.length !== list.length) replacements.set(identity(asset.guid, doc.fileId), replaceItems(doc.text, 'parameters', kept));
  }
  function commitDocuments(changes) {
    for (const asset of draft) {
      const split = splitUnityDocuments(dec.decode(asset.asset));
      const changed = split.documents.some(d => changes.has(identity(asset.guid, d.fileId)));
      if (changed) asset.asset = enc.encode(joinUnityDocuments(split.preamble,
        split.documents.map(d => changes.get(identity(asset.guid, d.fileId)) ?? d.text)));
    }
  }
  commitDocuments(replacements);
  const current = replacements.size ? buildStructureIndex(draft, { outputRoot }).index : before;
  const usage = new Map(current.controllers.map(c => [identity(c.guid, c.file_id), controllerUsage(c, menus)]));
  const edits = new Map();
  allDocs = documents(draft);
  for (const { asset, doc } of allDocs) {
    const id = identity(asset.guid, doc.fileId);
    if (doc.classId === '91') {
      const parameters = extractAnimatorParameters(doc.text), used = usage.get(id);
      assert(used, `Missing controller usage ${id}`);
      const removed = parameters.filter(p => !used.has(p.name)), kept = parameters.filter(p => used.has(p.name));
      const blocks = kept.map(p => p.text);
      edits.set(id, replaceItems(doc.text, 'm_AnimatorParameters', blocks));
      report.controllers.push({ path: asset.path, before: parameters.length, after: blocks.length,
        removed_count: removed.length, removed: removed.map(p => p.name),
        removal_evidence: 'No current Layer read, Clip write, Driver write, or Menu binding in this controller',
        retained: kept.map(p => ({ name: p.name, evidence: sorted(used.get(p.name)) })),
        preexisting_undeclared_live_parameters: sorted([...used.keys()].filter(n => !menus.has(n) && !parameters.some(p => p.name === n))) });
      continue;
    }
  }
  commitDocuments(edits);
  const after = buildStructureIndex(draft, { outputRoot }).index;
  for (const c of after.controllers) {
    const expected = usage.get(identity(c.guid, c.file_id));
    assert(c.parameters.every(p => expected.has(p.name)), `Unused declaration survived in ${c.path}`);
    const original = before.controllers.find(o => o.guid === c.guid && o.file_id === c.file_id);
    const expectedNames = original.parameters.filter(p => expected.has(p.name)).map(p => p.name);
    assert(JSON.stringify(c.parameters.map(p => p.name)) === JSON.stringify(expectedNames), `Live declaration lost/reordered in ${c.path}`);
  }
  const facts = collectParameterFacts(draft, { outputRoot, channels });
  facts.source_observations = originalFacts.source_observations;
  const contract = buildParameterContract(facts);
  emitParameterContract(draft, contract);
  const validation = validateParameterContract(draft, contract);
  const finalFacts = collectParameterFacts(draft, { outputRoot, channels });
  const budget = rows => rows.reduce((n, p) => n + (p.network_synced ? p.type === 'Bool' ? 1 : 8 : 0), 0);
  for (const final of finalFacts.source_observations.registrations) {
    const prior = originalFacts.source_observations.registrations.find(r => r.kind === final.kind);
    const oldNames = new Set(prior.parameters.map(p => p.name)), newNames = new Set(final.parameters.map(p => p.name));
    const removed = prior.parameters.filter(p => !newNames.has(p.name)).map(p => p.name);
    const added = final.parameters.filter(p => !oldNames.has(p.name)).map(p => ({ ...p,
      evidence: contract.parameters.find(c => c.name === p.name).decision_reason }));
    const changed = final.parameters.flatMap(p => {
      const previous = prior.parameters.find(q => q.name === p.name); if (!previous) return [];
      const fields = ['type', 'default_value', 'saved', 'network_synced'].filter(k => p[k] !== previous[k]);
      return fields.length ? [{ name: p.name, fields, before: previous, after: p,
        evidence: contract.parameters.find(c => c.name === p.name).decision_reason }] : [];
    });
    report.registrations.push({ kind: final.kind, path: final.path, file_id: final.file_id,
      before: prior.parameters.length, after: final.parameters.length, removed_count: removed.length, removed,
      added_count: added.length, added, changed_count: changed.length, changed,
      network_bits_before: budget(prior.parameters), network_bits_after: budget(final.parameters),
      removal_evidence: 'No required external read path in the adopted parameter contract; writer-only destinations are not OSC inputs',
      retained: final.parameters.map(p => p.name) });
    report[`${final.kind}_missing_eye_inputs`] = ['v2/EyeLeftX', 'v2/EyeRightX', 'v2/EyeY', 'EyeTrackingActive'].filter(n => !newNames.has(n));
  }
  for (const parameter of contract.parameters) if (['v2/EyeLidLeft', 'v2/EyeLidRight'].includes(parameter.name)) {
    for (const observation of parameter.source_observations.animator) report.defaults.push({ kind: 'Animator', path: observation.controller_path,
      name: parameter.name, before: observation.default_value, after: parameter.external.default_value });
    for (const observation of parameter.source_observations.registrations) report.defaults.push({ kind: observation.kind, path: observation.path,
      name: parameter.name, before: observation.default_value, after: parameter.external.default_value });
  }
  report.contract = contract;
  report.validation = validation;
  assert(after.reachability.serialized_objects === before.reachability.serialized_objects, 'Cleanup changed object count');
  report.serialized_objects_preserved = after.reachability.serialized_objects;
  report.removed_declarations = report.controllers.reduce((sum, x) => sum + x.removed_count, 0);
  report.removed_registrations = report.registrations.reduce((sum, x) => sum + x.removed_count, 0);
  report.added_registrations = report.registrations.reduce((sum, x) => sum + x.added_count, 0);
  for (let i = 0; i < assets.length; i++) assets[i].asset = draft[i].asset;
  return report;
}
