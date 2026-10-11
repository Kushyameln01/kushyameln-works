// One adopted parameter specification feeds Animator defaults and both external
// registration formats. Source observations are evidence, not synchronization policy.
import { buildStructureIndex } from './structure-index.mjs';
import { ordinaryNames } from './naming.mjs';
import { splitUnityDocuments, joinUnityDocuments, extractReferences,
  extractAnimatorParameters, parseUnityScalar } from './unity-text.mjs';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const SDK = '67cc4cb7839cd3741b63733d5adf0442', MA = '71a96d4ea0c344f39e277d82035bf9bd';
const TYPES = { '1': 'Float', '3': 'Int', '4': 'Bool', '9': 'Trigger' };
const EYES = new Set(['v2/EyeLeftX', 'v2/EyeRightX', 'v2/EyeY']);
const LIDS = new Set(['v2/EyeLidLeft', 'v2/EyeLidRight']);
const TRACKING = new Set(['EyeTrackingActive', 'ExpressionTrackingActive', 'LipTrackingActive']);
// Only engine inputs encountered by this supported profile, plus Viseme used by
// the live-reader regression fixtures. Unknown names are not presumed built-ins.
const BUILTINS = new Set(['IsLocal', 'AFK', 'InStation', 'Seated', 'Viseme']);
const UNDECLARED_WRITER = 'v2/MouthRaiserLower';
const assert = (ok, message) => { if (!ok) throw new Error(`Parameter contract: ${message}`); };
const unique = values => [...new Set(values)].sort();
const id = (guid, fileId) => `${guid.toLowerCase()}:${fileId}`;
function field(text, key, indent = 2, optional = false) {
  const matches = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}${key}:([^\\r\\n]*)`, 'gm'))];
  if (!matches.length && optional) return null;
  assert(matches.length === 1, `Missing/ambiguous field ${key}`);
  return parseUnityScalar(matches[0][1]);
}
function section(text, key, indent = 2) {
  const fields = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'))];
  const indices = fields.flatMap((m, i) => m[1] === key ? [i] : []);
  assert(indices.length === 1, `Missing/ambiguous section ${key}`);
  const i = indices[0], start = fields[i].index, end = fields[i + 1]?.index ?? text.length;
  return { start, end, text: text.slice(start, end) };
}
function items(text, key) {
  const block = section(text, key).text, value = field(block, key);
  assert(value === '' || value === '[]', `Unsupported sequence ${key}`);
  return block.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm) ?? [];
}
const itemField = (text, key) => field(text.replace(/^  - /, '    '), key, 4);
function replaceItems(text, key, rows) {
  const old = section(text, key), nl = old.text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, old.start) + `  ${key}:${rows.length ? '' : ' []'}${nl}` + rows.join('') + text.slice(old.end);
}
function setItemField(text, key, value) {
  itemField(text, key);
  return text.replace(new RegExp(`^((?:  - |    )${key}:)[^\\r\\n]*`, 'm'), (_, prefix) => `${prefix} ${value}`);
}
function script(doc) {
  if (doc.classId !== '114') return null;
  const refs = extractReferences(field(doc.text, 'm_Script'));
  assert(refs.length === 1 && refs[0].guid, 'Invalid script reference');
  return id(refs[0].guid, refs[0].fileId);
}
function numeric(value, label) {
  const n = Number(value); assert(value !== null && value !== '' && Number.isFinite(n), `Invalid number ${label}`); return n;
}
function boolean(value, label) {
  assert(value === '0' || value === '1', `Invalid Boolean ${label}`); return value === '1';
}
function declaration(p, controller) {
  const type = TYPES[p.type]; assert(type, `Unknown Animator type ${p.name}: ${p.type}`);
  return { name: p.name, controller_guid: controller.guid, controller_file_id: controller.file_id,
    controller_path: controller.path, type,
    default_value: type === 'Float' ? p.default_float : type === 'Int' ? p.default_int : Number(p.default_bool) };
}
function registration(doc, asset) {
  const kind = script(doc) === id(MA, '11500000') ? 'MA_Parameters'
    : script(doc) === id(SDK, '-1506855854') ? 'ExpressionParameters' : null;
  if (!kind) return null;
  const ma = kind === 'MA_Parameters', seen = new Set();
  const rows = items(doc.text, 'parameters').map(row => {
    const name = itemField(row, ma ? 'nameOrPrefix' : 'name');
    assert(name && !seen.has(name), `Missing/duplicate ${kind} name ${name}`); seen.add(name);
    if (ma) {
      assert(itemField(row, 'isPrefix') === '0' && itemField(row, 'remapTo') === '', `MA prefix/remap needs explicit analysis: ${name}`);
      assert(itemField(row, 'internalParameter') === '0', `MA internal rename needs explicit analysis: ${name}`);
    }
    const typeValue = itemField(row, ma ? 'syncType' : 'valueType');
    const type = (ma ? { '0': 'AnimatorOnly', '1': 'Int', '2': 'Float', '3': 'Bool' }
      : { '0': 'Int', '1': 'Float', '2': 'Bool' })[typeValue];
    assert(type, `Unknown ${kind} type for ${name}`);
    return { name, type, default_value: numeric(itemField(row, 'defaultValue'), name),
      saved: boolean(itemField(row, 'saved'), `${name}.saved`),
      network_synced: ma ? !boolean(itemField(row, 'localOnly'), `${name}.localOnly`) && type !== 'AnimatorOnly'
        : boolean(itemField(row, 'networkSynced'), `${name}.networkSynced`),
      ...(ma ? { explicit_default: boolean(itemField(row, 'hasExplicitDefaultValue'), `${name}.explicit_default`),
        override_animator_defaults: boolean(itemField(row, 'm_overrideAnimatorDefaults'), `${name}.override`) } : {}) };
  });
  return { kind, guid: asset.guid, file_id: doc.fileId, path: asset.path, parameters: rows };
}
function checkedChannels(channels) {
  assert(Array.isArray(channels) && channels.length, 'Explicit source channels are required');
  const seen = new Set(), bitNames = new Set();
  return channels.map(c => {
    assert(typeof c.input === 'string' && c.input.startsWith('v2/') && !seen.has(c.input), `Invalid/duplicate channel ${c.input}`);
    seen.add(c.input); assert(typeof c.active === 'boolean' && typeof c.signed === 'boolean', `Channel flags required: ${c.input}`);
    assert(Array.isArray(c.bits) && (!c.active || c.bits.length > 0), `Missing bit facts: ${c.input}`);
    const bits = c.bits.map(b => {
      assert(typeof b.parameter === 'string' && b.parameter && !bitNames.has(b.parameter), `Invalid/duplicate bit ${b.parameter}`);
      assert(Number.isFinite(b.weight) && b.weight > 0, `Invalid source bit weight: ${b.parameter}`);
      bitNames.add(b.parameter); return { parameter: b.parameter, weight: b.weight };
    });
    if (c.signed) {
      assert(typeof c.signParameter === 'string' && c.signParameter && !bitNames.has(c.signParameter), `Explicit source sign parameter required: ${c.input}`);
      bitNames.add(c.signParameter);
    }
    return { input: c.input, active: c.active, bits, signed: c.signed,
      ...(c.signed ? { signParameter: c.signParameter } : {}) };
  });
}

/** Read-only observations from serialized assets. No synchronization policy is
 * inferred from a copied registration flag or from a missing target Mesh. */
export function collectParameterFacts(assets, { outputRoot, channels } = {}) {
  assert(Array.isArray(assets) && assets.every(a => a.asset instanceof Uint8Array), 'Expected serialized assets before documentation/folders');
  const sourceChannels = checkedChannels(channels), index = buildStructureIndex(assets, { outputRoot }).index;
  const docs = new Map(), registrations = [], menus = [];
  for (const asset of assets) for (const doc of splitUnityDocuments(dec.decode(asset.asset)).documents) {
    const key = id(asset.guid, doc.fileId); docs.set(key, { doc, asset });
    const reg = registration(doc, asset); if (reg) registrations.push(reg);
    if (script(doc) === id(SDK, '-340790334')) for (const row of items(doc.text, 'controls')) {
      const normalized = row.replace(/^  - /, '    ');
      const name = field(section(normalized, 'parameter', 4).text, 'name', 6);
      if (name) menus.push({ name, object_id: key, path: asset.path });
      for (const match of section(normalized, 'subParameters', 4).text.matchAll(/^    - name:([^\r\n]*)/gm)) {
        const sub = parseUnityScalar(match[1]); if (sub) menus.push({ name: sub, object_id: key, path: asset.path });
      }
    }
  }
  for (const kind of ['MA_Parameters', 'ExpressionParameters'])
    assert(registrations.filter(r => r.kind === kind).length === 1, `Expected one ${kind} definition`);
  const layer = name => {
    const found = index.controllers.flatMap(c => c.layers).filter(l => l.name === name);
    assert(found.length === 1, `Expected supported ${name} layer`); return found[0];
  };
  const binary = layer('Binary'), decode = layer('Decode'), smooth = layer('Smooth');
  const localTransitions = index.objects.filter(o => o.layer_owners.includes(smooth.layer_id) && ['1101', '1109'].includes(o.class_id));
  assert(localTransitions.length === 2 && smooth.states.length === 2, 'Unsupported Smooth state/transition branching');
  const scopeEntries = {};
  for (const node of localTransitions) {
    const text = docs.get(node.object_id).doc.text, conditions = items(text, 'm_Conditions');
    assert(conditions.some(c => itemField(c, 'm_ConditionEvent') === 'IsLocal'), 'Smooth transition lacks its IsLocal gate');
    assert(conditions.length === 1, 'IsLocal scope requires an unambiguous single-condition transition');
    const mode = itemField(conditions[0], 'm_ConditionMode'), scope = mode === '1' ? 'local' : mode === '2' ? 'remote' : null;
    assert(scope && !scopeEntries[scope], 'Unknown/ambiguous IsLocal scope');
    assert(field(text, 'm_Mute') === '0' && field(text, 'm_IsExit') === '0' && field(text, 'm_HasExitTime') === '0',
      'Disabled/exit/time-gated IsLocal scope transition');
    const ref = extractReferences(field(text, 'm_DstState'))[0];
    const state = smooth.states.find(s => s.guid === (ref.guid ?? node.guid) && s.file_id === ref.fileId);
    assert(state?.motion_kind === 'blend_tree', `Missing ${scope} Smooth state Motion`);
    const entry = index.entry_trees.find(e => e.guid === state.motion.guid && e.file_id === state.motion.file_id);
    assert(entry, `Missing ${scope} Smooth entry tree`);
    scopeEntries[scope] = { entry, transition: node.object_id, state: id(state.guid, state.file_id) };
  }
  assert(scopeEntries.local && scopeEntries.remote, 'Local and Remote Smooth scopes must both be established by IsLocal transitions');
  const readers = [], writers = [];
  for (const o of index.objects.filter(o => o.reachability === 'layer_reference_reachable')) {
    const { doc } = docs.get(o.object_id), entryScopes = ['local', 'remote'].filter(s =>
      o.entry_tree_owners.includes(id(scopeEntries[s].entry.guid, scopeEntries[s].entry.file_id)));
    if (o.class_id === '114') {
      const behaviour = script(doc);
      assert([id(SDK, '-706344726'), id(SDK, '1852460640'), id(SDK, '-646210727')].includes(behaviour),
        `Unknown live behaviour requires explicit parameter analysis: ${behaviour}`);
      if (behaviour === id(SDK, '1852460640')) assert(field(doc.text, 'outputParamHash') === '0',
        'Nonzero layer-control output hash requires explicit parameter analysis');
    }
    const scope = entryScopes.length === 1 ? entryScopes[0] : 'both';
    const addRead = (name, kind) => { if (name) readers.push({ name, object_id: o.object_id, path: o.path,
      layer_ids: o.layer_owners, scope, kind }); };
    for (const name of o.blend_tree?.read_parameters ?? []) addRead(name, 'blend_tree');
    if (['1101', '1109'].includes(o.class_id)) for (const match of doc.text.matchAll(/^    m_ConditionEvent:([^\r\n]*)/gm)) addRead(parseUnityScalar(match[1]), 'transition');
    if (o.class_id === '1102') for (const stem of ['Speed', 'Mirror', 'CycleOffset', 'Time'])
      if (field(doc.text, `m_${stem}ParameterActive`) === '1') addRead(field(doc.text, `m_${stem}Parameter`), 'active_state_field');
    for (const curve of o.animation_clip?.curves ?? []) if (curve.kind === 'animator_parameter')
      writers.push({ name: curve.attribute, object_id: o.object_id, path: o.path, layer_ids: o.layer_owners, scope, kind: 'clip', values: curve.clip_key_values });
    if (o.parameter_driver) {
      const localOnly = boolean(field(doc.text, 'localOnly'), 'ParameterDriver.localOnly');
      for (const op of o.parameter_driver.operations) {
        assert([0, 1, 2, 3].includes(op.type), `Unknown Driver operation ${op.type}`);
        writers.push({ name: op.destination, object_id: o.object_id, path: o.path, layer_ids: o.layer_owners,
          scope: localOnly ? 'local' : scope, kind: 'driver', operation: op.type, value: op.value, local_only: localOnly });
        if (op.type === 3) addRead(op.source, 'driver_copy_source');
      }
    }
  }
  const animator = index.controllers.flatMap(c => c.parameters.map(p => declaration(p, c)));
  return { schema_version: 1, output_root: outputRoot, channels: sourceChannels, index,
    readers, writers, menus, scopes: { local: scopeEntries.local, remote: scopeEntries.remote },
    layers: { binary, decode, smooth },
    source_observations: { animator, registrations } };
}

function outputs(entry) { return new Set(entry.clip_outputs.filter(o => o.kind === 'animator_parameter').map(o => o.attribute)); }
function validateChannelPaths(facts) {
  const { index, channels, layers, scopes } = facts;
  const objects = new Map(index.objects.map(o => [o.object_id, o]));
  const childCurves = start => {
    const seen = new Set(), todo = [start], curves = [];
    while (todo.length) {
      const key = todo.pop(); if (seen.has(key)) continue; seen.add(key);
      const node = objects.get(key); assert(node, `Unresolved parameter path ${key}`);
      curves.push(...(node.animation_clip?.curves ?? []));
      for (const ref of node.references) if (ref.traversed && ref.target?.class_id && ref.field !== 'm_Script') todo.push(id(ref.target.guid, ref.target.file_id));
    }
    return curves;
  };
  const binaryReads = new Set(layers.binary.read_parameters), expectedBits = new Set();
  for (const c of channels.filter(c => c.active)) {
    const names = ordinaryNames(c.input);
    assert(scopes.local.entry.read_parameters.includes(c.input), `Active source lacks Local raw reader: ${c.input}`);
    assert(scopes.remote.entry.read_parameters.includes(names.decoded), `Active source lacks Remote decoded reader: ${c.input}`);
    assert(outputs(scopes.local.entry).has(names.output) && outputs(scopes.remote.entry).has(names.output), `Missing Local/Remote Proxy writer: ${c.input}`);
    assert(layers.decode.read_parameters.includes(names.magnitude) && layers.decode.read_parameters.includes(names.cartesian)
      && outputs(layers.decode).has(names.decoded), `Broken Decode supply: ${c.input}`);
    for (const bit of [...c.bits, ...(c.signed ? [{ parameter: c.signParameter, weight: 1, sign: true }] : [])]) {
      expectedBits.add(bit.parameter); assert(binaryReads.has(bit.parameter), `Source bit is not read by Binary: ${bit.parameter}`);
      const trees = index.objects.filter(o => o.layer_owners.includes(layers.binary.layer_id) && o.blend_tree?.read_parameters.includes(bit.parameter));
      assert(trees.length === 1 && trees[0].blend_tree.blend_type === 0, `Ambiguous bit/sign reader: ${bit.parameter}`);
      const destination = bit.sign ? names.cartesian : names.magnitude;
      const curves = childCurves(trees[0].object_id).filter(curve => curve.kind === 'animator_parameter' && curve.attribute === destination);
      const values = unique(curves.flatMap(curve => curve.clip_key_values)).map(Number).sort((a, b) => a - b);
      assert(JSON.stringify(values) === JSON.stringify([0, bit.weight]), `Bit/sign weight or destination changed: ${bit.parameter}`);
    }
  }
  for (const name of binaryReads) if (name !== 'OSCm/BlendSet') assert(expectedBits.has(name), `Binary reader missing from source channel facts: ${name}`);
  return expectedBits;
}

function observedFor(facts, name) {
  return { animator: facts.source_observations.animator.filter(p => p.name === name),
    registrations: facts.source_observations.registrations.flatMap(r => r.parameters.filter(p => p.name === name)
      .map(p => ({ kind: r.kind, path: r.path, guid: r.guid, file_id: r.file_id, ...p }))) };
}
function consensus(values, label, fallback) {
  const different = unique(values.map(v => JSON.stringify(v)));
  assert(different.length <= 1, `Conflicting ${label}: ${different.join(', ')}`);
  assert(different.length || fallback !== undefined, `No source evidence for ${label}`);
  return different.length ? JSON.parse(different[0]) : fallback;
}

/** Pure decision stage. Required names come from the live read paths, never
 * from the current MA/Expression rows or from a fixed synchronization count. */
export function buildParameterContract(facts) {
  const bits = validateChannelPaths(facts), active = new Map(facts.channels.filter(c => c.active).map(c => [c.input, c]));
  const signs = new Set(facts.channels.filter(c => c.active && c.signed).map(c => c.signParameter));
  const inactive = new Map(facts.channels.filter(c => !c.active).map(c => [c.input, ordinaryNames(c.input)]));
  const menus = new Set(facts.menus.map(m => m.name)), reads = new Set(facts.readers.map(r => r.name));
  const live = unique([...reads, ...facts.writers.map(w => w.name), ...menus]);
  const parameters = [], knownExceptions = [];
  for (const name of live) {
    const readers = facts.readers.filter(r => r.name === name), writers = facts.writers.filter(w => w.name === name);
    const observations = observedFor(facts, name);
    // Current declarations are separate from source provenance (which includes
    // declarations removed by cleanup and the original unpatched defaults).
    const declarations = facts.index.controllers.flatMap(c => c.parameters.filter(p => p.name === name).map(p => declaration(p, c)));
    const writerOnly = !readers.length && !menus.has(name);
    if (!declarations.length) {
      assert(name === UNDECLARED_WRITER && writerOnly && writers.every(w => w.kind === 'driver' && w.operation === 0),
        `Live parameter has no Animator declaration: ${name}`);
      knownExceptions.push({ name, reason: 'Pre-existing isolated Driver Set destination; no live reader. No declaration or external registration added.', writers });
    }
    let role, type = null, synced = false, required = false, reason, local = 'internal_evaluation', remote = 'internal_evaluation';
    if (bits.has(name)) {
      role = signs.has(name) ? 'network_sign' : 'network_bit'; type = 'Bool'; synced = required = true;
      reason = 'Live Binary input supplies Decode and Remote Smooth; no target Mesh evidence permits synchronization removal.';
      local = 'osc_bit_or_sign'; remote = 'network_to_binary_decode';
    } else if (active.has(name) && readers.length) {
      assert(readers.every(r => r.scope === 'local'), `Ordinary raw input has an unexplained non-Local reader: ${name}`);
      role = 'local_osc_raw'; type = 'Float'; required = true;
      reason = 'Local Smooth reads the raw OSC input; Remote reads its decoded bit representation.';
      local = 'osc_raw'; remote = 'corresponding_network_bits_to_decode';
    } else if (EYES.has(name) && readers.length) {
      role = 'eye_axis'; type = 'Float'; synced = required = true;
      reason = 'Live EyeXY/Additive direct axis readers also run for Remote.';
      local = 'osc_raw'; remote = 'network_direct';
    } else if (TRACKING.has(name) && readers.length) {
      role = 'tracking_status'; type = 'Bool'; synced = required = true;
      reason = 'Existing Local/Remote transitions require the owner tracking-status value.';
      local = 'osc_status'; remote = 'network_direct';
    } else if (menus.has(name)) {
      role = 'menu'; required = synced = true;
      type = consensus([...observations.registrations.map(p => p.type), ...observations.animator.map(p => p.type)], `${name} menu type`);
      reason = 'Live Menu control and existing graph use this shared control value.';
      local = 'expression_menu'; remote = 'network_direct';
    } else if (BUILTINS.has(name)) {
      role = 'builtin'; reason = 'VRChat supplies this engine parameter; it is not an external custom registration.';
      local = remote = 'vrchat_builtin';
    } else if (writerOnly) {
      role = 'writer_only'; reason = 'A retained live writer alone does not establish an OSC input requirement.';
      local = remote = 'retained_writer';
    } else {
      assert(!name.startsWith('v2/'), `Unclassified external reader: ${name}`);
      const dormant = [...inactive.values()].find(n => [n.decoded, n.output, n.remoteCoefficient].includes(name));
      if (dormant) {
        assert(readers.every(r => r.scope === 'remote'), `Dormant input gained a consumer outside Remote smoothing: ${name}`);
        assert(!facts.readers.some(r => r.name === dormant.output && r.scope !== 'remote'), `Dormant Proxy gained an output consumer: ${name}`);
        role = 'preserved_dormant'; reason = 'Inactive source retains the original Remote smoothing graph without a downstream expression consumer.';
        local = 'not_read'; remote = name === dormant.decoded ? 'preserved_default_without_active_decoder' : 'preserved_internal';
      } else {
        assert(writers.length || name === 'OSCm/BlendSet', `Unclassified reader has no supply: ${name}`);
        assert(!readers.some(r => r.scope !== 'local') || writers.some(w => w.scope !== 'local') || name === 'OSCm/BlendSet',
          `Remote internal reader has only Local writers: ${name}`);
        role = 'internal'; reason = 'Animator Clip/Driver or an explicit constant supplies the value; no external registration is needed.';
      }
    }
    let defaultValue = null, saved = false;
    if (required) {
      assert(['Float', 'Bool', 'Int'].includes(type), `Unsupported external type ${name}: ${type}`);
      for (const observation of observations.registrations) assert(observation.type === type, `Conflicting external type for ${name}: ${observation.type} versus ${type}`);
      for (const declaration of declarations) assert(declaration.type === type || (bits.has(name) && declaration.type === 'Float'),
        `Unsupported Animator/external type boundary: ${name} ${declaration.type}/${type}`);
      defaultValue = LIDS.has(name) ? 0.75 : consensus([...observations.registrations.map(p => p.default_value),
        ...observations.animator.map(p => p.default_value)], `${name} default`, EYES.has(name) ? 0 : TRACKING.has(name) ? 1 : undefined);
      if (EYES.has(name)) assert(defaultValue === 0, `Eye-axis default must remain zero: ${name}`);
      if (TRACKING.has(name)) assert(defaultValue === 1, `Tracking-status default must remain true: ${name}`);
      if (type === 'Bool') assert(defaultValue === 0 || defaultValue === 1, `Non-Boolean external default: ${name}`);
      saved = consensus(observations.registrations.map(p => p.saved), `${name} saved`, false);
    }
    const animator = declarations.map(p => ({ controller_guid: p.controller_guid, controller_file_id: p.controller_file_id,
      controller_path: p.controller_path, type: p.type, default_value: required ? defaultValue : p.default_value,
      conversion: required ? (p.type === type ? 'identity' : 'bool_to_float_0_1') : null }));
    parameters.push({ name, role, external: required ? { required, type, default_value: defaultValue, saved, network_synced: synced } : { required: false },
      animator, supply: { local, remote }, readers, writers, source_observations: observations, decision_reason: reason });
  }
  const external = parameters.filter(p => p.external.required);
  return { schema_version: 1, output_root: facts.output_root, profile: 'reviewed_nk_binary_decode_local_remote',
    channels: facts.channels, parameters, source_observations: facts.source_observations,
    scope_evidence: Object.fromEntries(['local', 'remote'].map(s => [s, { transition: facts.scopes[s].transition,
      state: facts.scopes[s].state, entry_tree: id(facts.scopes[s].entry.guid, facts.scopes[s].entry.file_id) }])),
    known_exceptions: knownExceptions, external_parameter_count: external.length,
    network_bits: external.reduce((n, p) => n + (p.external.network_synced ? p.external.type === 'Bool' ? 1 : 8 : 0), 0),
    limitations: ['No target Mesh/AvatarDescriptor input; shape emptiness and existing-avatar collisions are not evaluated.',
      'IsLocal scopes and parameter supply are statically checked for this supported graph, not a general Animator runtime simulation.',
      'Raw EyeLid defaults are 0.75; bit/Decoded/Proxy defaults and initial unreceived behavior are unchanged.',
      'Unity import, MA build, OSC and Remote runtime behavior remain unverified.'] };
}

function registrationRow(kind, parameter) {
  const { name, external: e } = parameter;
  if (kind === 'MA_Parameters') return `  - nameOrPrefix: ${name}\n    remapTo: \n    internalParameter: 0\n    isPrefix: 0\n    syncType: ${{ Int: 1, Float: 2, Bool: 3 }[e.type]}\n    localOnly: ${e.network_synced ? 0 : 1}\n    defaultValue: ${e.default_value}\n    saved: ${Number(e.saved)}\n    hasExplicitDefaultValue: 1\n    m_overrideAnimatorDefaults: 0\n`;
  return `  - name: ${name}\n    valueType: ${{ Int: 0, Float: 1, Bool: 2 }[e.type]}\n    saved: ${Number(e.saved)}\n    defaultValue: ${e.default_value}\n    networkSynced: ${Number(e.network_synced)}\n`;
}

/** Applies the adopted values without changing any Motion, Clip or Driver.
 * Bytes are committed together only after all candidate edits are serialized. */
export function emitParameterContract(assets, contract) {
  const external = contract.parameters.filter(p => p.external.required), byName = new Map(contract.parameters.map(p => [p.name, p]));
  assert(byName.size === contract.parameters.length, 'Duplicate contract parameter');
  const changes = assets.map(asset => {
    const split = splitUnityDocuments(dec.decode(asset.asset)); let changed = false;
    const texts = split.documents.map(doc => {
      const reg = registration(doc, asset);
      if (reg) { changed = true; return replaceItems(doc.text, 'parameters', external.map(p => registrationRow(reg.kind, p))); }
      if (doc.classId !== '91') return doc.text;
      const rows = extractAnimatorParameters(doc.text).map(p => {
        const item = byName.get(p.name)?.animator.find(a => a.controller_guid === asset.guid && a.controller_file_id === doc.fileId);
        if (!item) return p.text;
        assert(TYPES[p.fields.m_Type] === item.type, `Emitter cannot silently change Animator type: ${p.name}`);
        const key = item.type === 'Float' ? 'm_DefaultFloat' : item.type === 'Int' ? 'm_DefaultInt' : 'm_DefaultBool';
        return Number(itemField(p.text, key)) === item.default_value ? p.text : setItemField(p.text, key, String(item.default_value));
      });
      changed = true; return replaceItems(doc.text, 'm_AnimatorParameters', rows);
    });
    return changed ? enc.encode(joinUnityDocuments(split.preamble, texts)) : asset.asset;
  });
  for (let i = 0; i < assets.length; i++) assets[i].asset = changes[i];
}

/** Independent output reread, including requirements reconstructed from the
 * final reader graph. Deleting both a registration and its contract entry fails. */
export function validateParameterContract(assets, contract) {
  assert(contract?.schema_version === 1, 'Unsupported contract schema');
  const facts = collectParameterFacts(assets, { outputRoot: contract.output_root, channels: contract.channels });
  // Reuse original observations solely for adopted value decisions. The final
  // graph, declarations, readers, writers and menus are freshly read above.
  const expected = buildParameterContract({ ...facts, source_observations: contract.source_observations });
  const byName = new Map(contract.parameters.map(p => [p.name, p]));
  assert(byName.size === contract.parameters.length, 'Duplicate contract parameter');
  for (const e of expected.parameters) {
    const actual = byName.get(e.name); assert(actual, `Final reader/writer is missing from contract: ${e.name}`);
    assert(JSON.stringify(actual.external) === JSON.stringify(e.external), `Contract decision differs from final reader requirement: ${e.name}`);
    assert(actual.role === e.role, `Contract role differs from final reader requirement: ${e.name}`);
    assert(JSON.stringify(actual.animator) === JSON.stringify(e.animator), `Contract Animator declaration differs from final graph: ${e.name}`);
  }
  assert(expected.parameters.length === contract.parameters.length, 'Contract contains a parameter absent from the final live graph');
  const external = contract.parameters.filter(p => p.external.required);
  for (const registration of facts.source_observations.registrations) {
    assert(registration.parameters.length === external.length, `${registration.kind} registration count mismatch`);
    const rows = new Map(registration.parameters.map(p => [p.name, p]));
    for (const parameter of external) {
      const actual = rows.get(parameter.name), e = parameter.external;
      assert(actual, `Missing ${registration.kind} registration: ${parameter.name}`);
      for (const key of ['type', 'default_value', 'saved', 'network_synced'])
        assert(actual[key] === e[key], `${registration.kind} ${key} mismatch: ${parameter.name}`);
      if (registration.kind === 'MA_Parameters') assert(actual.explicit_default && !actual.override_animator_defaults,
        `MA default flags mismatch: ${parameter.name}`);
    }
  }
  for (const p of contract.parameters) for (const a of p.animator) {
    const actual = facts.source_observations.animator.find(o => o.name === p.name && o.controller_guid === a.controller_guid && o.controller_file_id === a.controller_file_id);
    assert(actual, `Missing Animator declaration: ${p.name}`);
    assert(actual.type === a.type, `Animator type mismatch: ${p.name}`);
    assert(actual.default_value === a.default_value, `Animator default mismatch: ${p.name}`);
  }
  assert(contract.external_parameter_count === external.length && contract.network_bits === expected.network_bits, 'Contract counts do not match derived definitions');
  return { status: 'PASS', external_parameter_count: external.length, network_bits: expected.network_bits,
    required_inputs_rederived_from_final_graph: true, animator_declarations_checked: contract.parameters.reduce((n, p) => n + p.animator.length, 0),
    local_remote_supply: 'STATIC_SUPPORTED_GRAPH_CHECKED', runtime: 'UNVERIFIED' };
}
