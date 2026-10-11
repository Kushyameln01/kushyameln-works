// Read-only structural inventory of final serialized Unity assets. Browser/Node,
// no filesystem, YAML rewrite, runtime simulation or parameter-name inference.
import {
  splitUnityDocuments, extractReferences, extractAnimatorLayers,
  extractAnimatorParameters, parseUnityScalar,
} from './unity-text.mjs';

const decoder = new TextDecoder('utf-8', { fatal: true });
const keyOf = (guid, id) => `${guid.toLowerCase()}:${id}`;
const sort = values => [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
const unique = values => sort(new Set(values));
const assert = (ok, message) => { if (!ok) throw new Error(`Structure index: ${message}`); };
const HUMANOID_PARTS = ['Root', 'Body', 'Head', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm',
  'LeftFingers', 'RightFingers', 'LeftFootIK', 'RightFootIK', 'LeftHandIK', 'RightHandIK'];
const EYE_MUSCLES = new Set(['Left Eye Down-Up', 'Left Eye In-Out', 'Right Eye Down-Up', 'Right Eye In-Out']);
const PARAMETER_DRIVER_SCRIPT = { guid: '67cc4cb7839cd3741b63733d5adf0442', fileId: '-706344726' };

function field(text, name, indent = 2, required = false) {
  const matches = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}${name}:([^\\r\\n]*)`, 'gm'))];
  assert(matches.length <= 1 && (!required || matches.length === 1), `Ambiguous or missing field ${name}`);
  return matches.length ? parseUnityScalar(matches[0][1]) : null;
}
function section(text, name, indent = 2) {
  const fields = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}([A-Za-z_][A-Za-z_0-9]*):[^\\r\\n]*(?:\\r?\\n|$)`, 'gm'))];
  const i = fields.findIndex(m => m[1] === name);
  return i < 0 ? '' : text.slice(fields[i].index, fields[i + 1]?.index ?? text.length);
}
function items(text, name) {
  const block = section(text, name);
  return block.match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm) ?? [];
}
function itemField(text, name, required = false) {
  return field(text.replace(/^  - /, '    '), name, 4, required);
}
function number(value, label) {
  assert(value !== null && value !== '' && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value), `Invalid ${label}`);
  const n = Number(value); assert(Number.isFinite(n), `Non-finite ${label}`); return n;
}
function refField(text, name, indent = 2) {
  const value = field(text, name, indent, true);
  if (value) {
    const refs = extractReferences(value);
    assert(refs.length === 1, `Expected one reference for ${name}`); return refs[0];
  }
  const refs = extractReferences(section(text, name, indent));
  assert(refs.length === 1, `Expected one block reference for ${name}`); return refs[0];
}
function referenceField(text, reference) {
  const prefix = text.slice(0, reference.start);
  return /([A-Za-z_][A-Za-z_0-9]*):[ \t]*(?:\r?\n[ \t]*)?$/.exec(prefix)?.[1] ?? null;
}
function asRef(node) {
  return { guid: node.guid, file_id: node.doc.fileId, path: node.path,
    name: node.name, class_id: node.doc.classId };
}
function maskDetails(node) {
  assert(node.doc.classId === '319', `Layer mask is not AvatarMask: ${node.path}`);
  const data = field(node.doc.text, 'm_Mask', 2, true);
  assert(/^(?:[0-9a-fA-F]{8}){13}$/.test(data), `Unsupported Humanoid mask encoding: ${node.path}`);
  const flags = [];
  for (let offset = 0; offset < data.length; offset += 8) {
    const bytes = data.slice(offset, offset + 8).match(/../g);
    flags.push(Number.parseInt([...bytes].reverse().join(''), 16));
  }
  return { ...asRef(node), humanoid_flags: flags,
    humanoid_parts: HUMANOID_PARTS.map((name, index) => ({ index, name, flag: flags[index] })),
    transform_paths: items(node.doc.text, 'm_Elements').map(item => ({
      path: itemField(item, 'm_Path'), weight: itemField(item, 'm_Weight'),
    })) };
}
function blendDetails(node) {
  const text = node.doc.text, type = number(field(text, 'm_BlendType', 2, true), 'BlendTree type');
  assert([0, 1, 2, 3, 4].includes(type), `Unsupported BlendTree type ${type}`);
  const children = items(text, 'm_Childs');
  const read = type === 4 ? children.map(c => itemField(c, 'm_DirectBlendParameter', true))
    : [field(text, 'm_BlendParameter', 2, true), ...(type === 0 ? [] : [field(text, 'm_BlendParameterY', 2, true)])];
  return { blend_type: type, read_parameters: unique(read.filter(Boolean)),
    child_thresholds: children.map(c => number(itemField(c, 'm_Threshold', true), 'child threshold')),
    child_positions: children.map(c => {
      const value = itemField(c, 'm_Position', true);
      if (value === '') {
        const block = section(c.replace(/^  - /, '    '), 'm_Position', 4);
        assert(/^    m_Position:[ \t]*\r?\n      x:[^\r\n]+\r?\n      y:[^\r\n]+(?:\r?\n)?$/.test(block),
          `Unsupported BlendTree child position block: ${node.path}`);
        return { x: number(field(block, 'x', 6, true), 'child x'),
          y: number(field(block, 'y', 6, true), 'child y') };
      }
      const m = /^\{x:\s*([^,]+),\s*y:\s*([^}]+)\}$/.exec(value);
      assert(m, `Unsupported BlendTree child position ${value}`);
      return { x: number(m[1], 'child x'), y: number(m[2], 'child y') };
    }),
    child_motions: children.map(c => refField(c.replace(/^  - /, '    '), 'm_Motion', 4)),
  };
}
function clipDetails(node, declared) {
  const text = node.doc.text;
  assert(field(text, 'm_Compressed') !== '1', `Compressed clip requires explicit analysis: ${node.path}`);
  const curves = items(text, 'm_FloatCurves').map(item => {
    const attribute = itemField(item, 'attribute', true), path = itemField(item, 'path', true);
    const classId = itemField(item, 'classID', true);
    const values = [...item.matchAll(/^        value: ([^\r\n]*)/gm)].map(m => number(m[1], 'curve value'));
    const kind = classId === '137' && attribute.startsWith('blendShape.') ? 'blendshape'
      : classId === '95' && declared.has(attribute) ? 'animator_parameter'
      : classId === '95' && EYE_MUSCLES.has(attribute) ? 'humanoid_muscle' : 'serialized_property';
    return { kind, attribute, binding_path: path, binding_class_id: classId,
      clip_key_range: values.length ? { min: Math.min(...values), max: Math.max(...values) } : null,
      key_count: values.length, clip_key_values: [...new Set(values)].sort((a, b) => a - b) };
  });
  const nonFloat = ['m_RotationCurves', 'm_CompressedRotationCurves', 'm_EulerCurves',
    'm_PositionCurves', 'm_ScaleCurves', 'm_PPtrCurves'].filter(name => {
    const value = field(text, name); return value !== null && value !== '[]';
  });
  return { curves, other_curve_sections: nonFloat,
    range_semantics: 'clip_key_range is serialized key extrema, not evaluated curve extrema or achievable runtime range' };
}
function driverDetails(node) {
  if (node.doc.classId !== '114') return null;
  const script = refField(node.doc.text, 'm_Script');
  if (script.guid?.toLowerCase() !== PARAMETER_DRIVER_SCRIPT.guid || script.fileId !== PARAMETER_DRIVER_SCRIPT.fileId) return null;
  return { script: { guid: script.guid, file_id: script.fileId },
    operations: items(node.doc.text, 'parameters').map(item => ({
      type: number(itemField(item, 'type', true), 'driver operation type'),
      destination: itemField(item, 'name', true), source: itemField(item, 'source'),
      value: number(itemField(item, 'value', true), 'driver value'),
      value_min: number(itemField(item, 'valueMin', true), 'driver minimum'),
      value_max: number(itemField(item, 'valueMax', true), 'driver maximum'),
      convert_range: itemField(item, 'convertRange'),
    })) };
}
function compactParameters(parameters) {
  const groups = new Map();
  for (const name of parameters) {
    const parts = name.split('/');
    const prefix = parts.length > 2 ? `${parts.slice(0, -1).join('/')}/*` : parts.length === 2 ? `${parts[0]}/*` : name;
    groups.set(prefix, (groups.get(prefix) ?? 0) + 1);
  }
  return [...groups].map(([name, count]) => `${name}${count > 1 ? ` (${count})` : ''}`).join(', ') || '—';
}
const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

/** Read-only inventory. Input is final Unity YAML assets, before adding README/JSON/folders. */
export function buildStructureIndex(assets, { outputRoot, parameterContract } = {}) {
  assert(Array.isArray(assets), 'assets must be an array');
  assert(typeof outputRoot === 'string' && outputRoot.startsWith('Assets/'), 'outputRoot must be an Assets path');
  const nodes = new Map(), assetGuids = new Set(), controllerNodes = [];
  for (const asset of [...assets].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    assert(asset.asset instanceof Uint8Array, `Expected serialized asset data: ${asset.path}`);
    assert(!assetGuids.has(asset.guid.toLowerCase()), `Duplicate GUID ${asset.guid}`);
    assetGuids.add(asset.guid.toLowerCase());
    const text = decoder.decode(asset.asset), documents = splitUnityDocuments(text).documents;
    for (const doc of documents) {
      const node = { guid: asset.guid.toLowerCase(), path: asset.path, doc, assetText: text,
        name: field(doc.text, 'm_Name') ?? '', owners: new Set(), entryOwners: new Set() };
      node.key = keyOf(node.guid, doc.fileId); nodes.set(node.key, node);
      if (doc.classId === '91') controllerNodes.push(node);
    }
  }
  const resolve = (reference, source) => {
    if (reference.fileId === '0') return null;
    return nodes.get(keyOf(reference.guid ?? source.guid, reference.fileId)) ?? null;
  };
  const describe = (reference, source) => {
    if (reference.fileId === '0') return null;
    const target = resolve(reference, source);
    return target ? asRef(target) : { guid: reference.guid ?? source.guid, file_id: reference.fileId,
      path: null, name: null, class_id: null, resolution: 'external_dependency' };
  };
  const externalDependencies = new Map();
  for (const node of nodes.values()) {
    node.references = extractReferences(node.doc.text).filter(r => r.fileId !== '0').map(r => ({
      raw: r, field: referenceField(node.doc.text, r), target: resolve(r, node),
    }));
    for (const edge of node.references) if (!edge.target) {
      assert(edge.field === 'm_Script' && edge.raw.kind === 'external' && !assetGuids.has(edge.raw.guid.toLowerCase()),
        `Unresolved reference ${node.path}/${node.doc.fileId} -> ${edge.raw.guid ?? node.guid}/${edge.raw.fileId}`);
      externalDependencies.set(keyOf(edge.raw.guid, edge.raw.fileId), describe(edge.raw, node));
    }
  }
  function closure(roots) {
    const seen = new Set(), queue = [...roots];
    while (queue.length) {
      const node = queue.pop(); if (!node || seen.has(node.key)) continue;
      seen.add(node.key);
      for (const edge of node.references) if (edge.field !== 'm_Controller' && edge.target) queue.push(edge.target);
    }
    return seen;
  }
  const declared = new Set();
  for (const node of controllerNodes) for (const p of extractAnimatorParameters(node.assetText, { controllerFileId: node.doc.fileId })) declared.add(p.name);
  for (const node of nodes.values()) {
    if (node.doc.classId === '206') node.blend = blendDetails(node);
    if (node.doc.classId === '74') node.clip = clipDetails(node, declared);
    if (node.doc.classId === '319') node.mask = maskDetails(node);
    node.driver = driverDetails(node);
  }
  function reads(keys) {
    const result = [];
    for (const key of keys) {
      const node = nodes.get(key), text = node.doc.text;
      if (node.blend) result.push(...node.blend.read_parameters);
      if (['1101', '1109'].includes(node.doc.classId)) result.push(...[...text.matchAll(/^    m_ConditionEvent:([^\r\n]*)/gm)].map(m => parseUnityScalar(m[1])));
      if (node.doc.classId === '1102') for (const stem of ['Speed', 'Mirror', 'CycleOffset', 'Time']) {
        if (field(text, `m_${stem}ParameterActive`) === '1') result.push(field(text, `m_${stem}Parameter`) ?? '');
      }
      if (node.driver) for (const op of node.driver.operations) if (op.type === 3 && op.source) result.push(op.source);
    }
    return unique(result.filter(Boolean));
  }
  function outputs(keys) {
    const map = new Map(), behaviours = [];
    for (const key of keys) {
      const node = nodes.get(key);
      for (const curve of node.clip?.curves ?? []) {
        const k = JSON.stringify([curve.kind, curve.binding_class_id, curve.binding_path, curve.attribute]);
        if (!map.has(k)) map.set(k, { ...curve, key_count: 0, clip_key_range: null, clip_key_values: [], clips: [] });
        const out = map.get(k); out.clips.push(node.key); out.key_count += curve.key_count;
        out.clip_key_values = [...new Set([...out.clip_key_values, ...curve.clip_key_values])].sort((a, b) => a - b);
        if (curve.clip_key_range) out.clip_key_range = out.clip_key_range ? {
          min: Math.min(out.clip_key_range.min, curve.clip_key_range.min), max: Math.max(out.clip_key_range.max, curve.clip_key_range.max),
        } : { ...curve.clip_key_range };
      }
      if (node.driver) behaviours.push({ behaviour: asRef(node), operations: node.driver.operations });
    }
    return { clip_outputs: [...map.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en')),
      parameter_driver_operations: behaviours };
  }
  const entries = new Map(), controllers = [], layerLookup = new Map();
  for (const controller of controllerNodes) {
    const layers = extractAnimatorLayers(controller.assetText, { controllerFileId: controller.doc.fileId });
    const indexedLayers = [];
    for (const [layerIndex, layer] of layers.entries()) {
      assert(layer.fields.m_SyncedLayerIndex === '-1', `Synchronized layer requires explicit support: ${layer.name}`);
      assert(section(controller.doc.text, 'm_AnimatorLayers'), 'Missing Animator layers');
      const layerId = `${controller.key}/layer/${layerIndex}`;
      layerLookup.set(layerId, { controller: asRef(controller), layer_index: layerIndex, layer_name: layer.name });
      const layerRefs = extractReferences(layer.text).filter(r => r.fileId !== '0' && referenceField(layer.text, r) !== 'm_Controller');
      const reached = closure(layerRefs.map(r => resolve(r, controller)));
      for (const key of reached) nodes.get(key).owners.add(layerId);
      const stateMachine = resolve(extractReferences(layer.fields.m_StateMachine)[0], controller);
      const maskRef = extractReferences(layer.fields.m_Mask)[0];
      const maskNode = resolve(maskRef, controller);
      const states = [], visitedMachines = new Set();
      function machineStates(machine) {
        if (!machine || visitedMachines.has(machine.key)) return;
        assert(machine.doc.classId === '1107', `Not an AnimatorStateMachine: ${machine.path}/${machine.doc.fileId}`);
        visitedMachines.add(machine.key);
        for (const item of items(machine.doc.text, 'm_ChildStates')) {
          const reference = refField(item.replace(/^  - /, '    '), 'm_State', 4), state = resolve(reference, machine);
          assert(state?.doc.classId === '1102', `Unresolved child State in ${machine.path}`);
          const motionRef = refField(state.doc.text, 'm_Motion'), motion = resolve(motionRef, state);
          const stateRecord = { ...asRef(state), state_machine: asRef(machine), motion: describe(motionRef, state),
            motion_kind: motion?.doc.classId === '206' ? 'blend_tree' : motion?.doc.classId === '74' ? 'animation_clip' : motionRef.fileId === '0' ? 'none' : 'other' };
          states.push(stateRecord);
          if (motion?.doc.classId === '206') {
            if (!entries.has(motion.key)) entries.set(motion.key, { node: motion, owners: [] });
            entries.get(motion.key).owners.push({ controller: asRef(controller), layer_index: layerIndex,
              layer_name: layer.name, state: asRef(state) });
          }
        }
        for (const item of items(machine.doc.text, 'm_ChildStateMachines')) {
          const reference = refField(item.replace(/^  - /, '    '), 'm_StateMachine', 4);
          machineStates(resolve(reference, machine));
        }
      }
      machineStates(stateMachine);
      indexedLayers.push({ layer_id: layerId, index: layerIndex, name: layer.name,
        state_machine: stateMachine ? asRef(stateMachine) : null,
        mask: maskNode ? maskDetails(maskNode) : null, states,
        entry_trees: [...new Map(states.filter(s => s.motion_kind === 'blend_tree').map(s => [keyOf(s.motion.guid, s.motion.file_id), s.motion])).values()],
        reachable_object_count: reached.size, read_parameters: reads(reached), ...outputs(reached) });
    }
    controllers.push({ ...asRef(controller), parameters: extractAnimatorParameters(controller.assetText, { controllerFileId: controller.doc.fileId }).map(p => ({
      name: p.name, type: p.fields.m_Type, default_float: Number(p.fields.m_DefaultFloat),
      default_int: Number(p.fields.m_DefaultInt), default_bool: p.fields.m_DefaultBool === '1',
    })), layers: indexedLayers });
  }
  const entryTrees = [];
  for (const [key, { node, owners }] of entries) {
    const reached = closure([node]);
    for (const target of reached) nodes.get(target).entryOwners.add(key);
    entryTrees.push({ ...asRef(node), owners, dependency_object_count: reached.size - 1,
      read_parameters: reads(reached), ...outputs(reached) });
  }
  const indexedObjects = [...nodes.values()].map(node => ({ ...asRef(node), object_id: node.key,
    reachability: node.owners.size ? 'layer_reference_reachable' : 'not_reached_from_layer_references',
    layer_owners: sort(node.owners), entry_tree_owners: sort(node.entryOwners),
    references: node.references.map(edge => ({ field: edge.field, target: describe(edge.raw, node),
      traversed: edge.field !== 'm_Controller' && Boolean(edge.target) })),
    ...(node.blend ? { blend_tree: { ...node.blend, child_motions: node.blend.child_motions.map(r => describe(r, node)) } } : {}),
    ...(node.clip ? { animation_clip: node.clip } : {}), ...(node.mask ? { avatar_mask: node.mask } : {}),
    ...(node.driver ? { parameter_driver: node.driver } : {}),
  }));
  const reachable = indexedObjects.filter(o => o.reachability === 'layer_reference_reachable');
  const retainedControllers = controllers.map(c => {
    const objects = indexedObjects.filter(o => o.guid === c.guid && o.class_id !== '91');
    const unvisited = objects.filter(o => o.reachability === 'not_reached_from_layer_references');
    return { controller: { guid: c.guid, file_id: c.file_id, path: c.path, name: c.name, class_id: c.class_id },
      serialized_subobjects: objects.length, not_reached_from_layer_references: unvisited.length,
      by_class: Object.fromEntries(unique(unvisited.map(o => o.class_id)).map(id => [id, unvisited.filter(o => o.class_id === id).length])) };
  });
  const index = { schema_version: 1, generated_from: 'final_serialized_asset_references', output_root: outputRoot,
    analysis_scope: 'Static Layer reference graph. m_Controller owner backlinks are excluded; runtime state reachability and parameter-mediated effects are not evaluated.',
    range_semantics: 'clip_key_range describes key extrema, not interpolated extrema or achievable runtime range; BlendTree thresholds and positions are separate.',
    controllers, entry_trees: entryTrees, masks: indexedObjects.filter(o => o.class_id === '319').map(o => o.avatar_mask),
    layer_owners: [...layerLookup].map(([id, owner]) => ({ id, ...owner })),
    reachability: { serialized_objects: nodes.size, layer_reference_reachable: reachable.length,
      not_reached_from_layer_references: nodes.size - reachable.length, controller_subobjects: retainedControllers },
    shared_resources: indexedObjects.filter(o => o.layer_owners.length > 1 || o.entry_tree_owners.length > 1).map(o => ({
      object_id: o.object_id, guid: o.guid, file_id: o.file_id, path: o.path, name: o.name, class_id: o.class_id,
      layer_owners: o.layer_owners, entry_tree_owners: o.entry_tree_owners,
    })), external_dependencies: [...externalDependencies.values()], objects: indexedObjects,
    limitations: ['No Unity Editor or VRChat runtime verification.',
      'not_reached_from_layer_references does not mean unused or safe to delete; non-Layer roots and indirect parameter relationships are outside this traversal.',
      'Other non-float curve sections are listed but their runtime output is not evaluated.',
      'Animator parameter classification uses declarations across these controllers; unidentified Animator properties remain serialized_property.'] };
  return { index, readme: buildReadme(index, parameterContract) };
}

function buildReadme(index, parameterContract) {
  const relative = path => path?.startsWith(index.output_root + '/') ? path.slice(index.output_root.length + 1) : path ?? '—';
  const lines = ['この文書は、最終生成物の参照を解析してAIが自動生成した構造案内です。', '',
    '# FaceTracking 生成物の入口', '',
    '`Source` は構成部品の保存先です。原本バックアップという意味ではありません。',
    '導入には `Installer/ARKit_FT_Installed.prefab` をアバター直下へ配置します。FXとAdditive、およびFaceTracking SubMenuを同じPrefabで追加します。',
    '構成の調整は `Modules/Controllers` のControllerから、内容物の調整は同階層の `Modules/Source` から始めてください。',
    '共有の空Clipは `Modules/Source/Shared/Empty(nonloop).anim` です。0秒・非ループ・0frame Eventを持ちます。最適化後の保持はUnity側で確認してください。',
    '対象Avatarは元のMeshパスとARKit Shape bindingに適合し、VRChat SDKとModular Avatarが導入されている必要があります。対象Meshの空Shape検査や既存Avatarとの競合検査はブラウザでは行っていません。',
    '標準のMA導入では、付属Expression Parameters assetをDescriptorへ別途割り当てる必要はありません。MA Parametersが必要な外部登録を追加します。付属Expression assetは同じ設定の手動導入・確認用です。手動導入ではFX・Additive・Menuも別途設定します。',
    '`v2/EyeLidLeft` / `v2/EyeLidRight` のMA・Animator・Expression初期値は0.75です。目線の `v2/EyeLeftX` / `v2/EyeRightX` / `v2/EyeY` は同期Float、Eye/Expression/LipTrackingActiveは同期Bool・初期値trueとして生成します。bitと内部値の初期値、既存の未接続時設定は維持します。',
    'MA・Expression・Animatorの設定は共通のParameter仕様から生成し、完成した参照構造と照合します。Binary入力は外部Bool、Animator Floatの0/1という型対応を保持します。採用値・同期理由・元設定は `GenerationSpec.json`、原本との差分はgeneration-report.jsonを参照してください。',
    ...(parameterContract ? [`この構成の外部登録は${parameterContract.parameters.filter(p => p.external.required).length}項目です。同期bit数は生成結果の登録設定から集計します。対象Avatarの他の登録やSDK既定項目を含む総量はMA統合後に確認してください。`] : []),
    '静的検査の合格はUnity Import・MAビルド・OSC/Remote実動作の確認とは別です。特にEyeXY_Shape_RootとFaceTrack_Additive_RootはUnityでMotion実体とState参照を確認してください。',
    '入口はStateの `m_Motion` が直接参照するBlendTreeです。項目別の子Rootとは区別しています。', '',
    '| Controller / Layer / State | 入口BlendTree | 保存先 |', '| --- | --- | --- |'];
  for (const entry of index.entry_trees) lines.push(`| ${cell(entry.owners.map(o => `${o.controller.name} / ${o.layer_name} / ${o.state.name}`).join('; '))} | ${cell(entry.name)} | ${cell(relative(entry.path))} |`);
  lines.push('', '## 全Layer・Mask・入出力', '',
    '読取り欄の `*` は共通接頭辞の省略表示です。正確なParameter名・Clip・binding先は `StructureIndex.json` を参照してください。',
    '空LayerとClipを直接参照するStateも索引に含め、分類のためのBlendTreeは追加していません。', '',
    '| Controller / Layer | State / 入口数 | Mask保存先 | 読取りParameter | Clip出力 / Driver書込み |', '| --- | --- | --- | --- | --- |');
  for (const controller of index.controllers) for (const layer of controller.layers) {
    const kinds = new Map();
    for (const out of layer.clip_outputs) kinds.set(out.kind, (kinds.get(out.kind) ?? 0) + 1);
    const drivers = unique(layer.parameter_driver_operations.flatMap(b => b.operations.map(op => op.destination)));
    const output = [...kinds].map(([kind, count]) => `${kind}: ${count}`).join(', ') || 'Clip出力なし';
    lines.push(`| ${cell(`${controller.name} / ${layer.name}`)} | ${layer.states.length} / ${layer.entry_trees.length} | ${cell(relative(layer.mask?.path))} | ${cell(compactParameters(layer.read_parameters))} | ${cell(`${output}; Driver: ${drivers.length}`)} |`);
  }
  lines.push('', '## 数値の読み方と検証範囲', '',
    '- JSONの `clip_key_range` は保存されたキーフレーム値の最小・最大です。補間後の極値、合成後の値、実行時に達する範囲とは区別します。',
    '- BlendTreeのthreshold・2D座標は `objects[].blend_tree` に別記しています。Maskの13 Humanoid flagsとTransform設定も保存しています。');
  const smooth = index.controllers.flatMap(c => c.layers).filter(l => l.name === 'Smooth');
  for (const layer of smooth) for (const state of layer.states) {
    if (state.motion_kind !== 'blend_tree') continue;
    const entry = index.entry_trees.find(e => e.guid === state.motion.guid && e.file_id === state.motion.file_id);
    lines.push(`- Smooth / ${state.name} の実参照にある読取り: ${compactParameters(entry.read_parameters)}。LocalとRemoteを同一の直列経路とは扱いません。`);
  }
  const thresholdObjects = index.objects.filter(o => o.reachability === 'layer_reference_reachable' && o.blend_tree?.child_thresholds.includes(-1.1) && o.blend_tree.child_thresholds.includes(1.1));
  if (thresholdObjects.length) lines.push(`- −1.1 / +1.1のthresholdを持つ到達可能なBlendTreeは${thresholdObjects.length}個です。このthresholdはClipのキーフレーム値そのものではありません。`);
  const eye = index.controllers.flatMap(c => c.layers).filter(l => l.name === 'EyeXY_Para');
  const eyeRanges = unique(eye.flatMap(l => l.clip_outputs.filter(o => o.clip_key_range).map(o => `${o.attribute}: [${o.clip_key_range.min}, ${o.clip_key_range.max}]`)));
  if (eyeRanges.length) lines.push(`- EyeXY_ParaのClipキー範囲: ${eyeRanges.join('; ')}。実際のキー値の集合: ${unique(eye.flatMap(l => l.clip_outputs.flatMap(o => o.clip_key_values))).sort((a, b) => a - b).join(', ')}。拡張値を通常系統の±1へ読み替えません。`);
  lines.push('- Unity EditorでのImportとVRChat実動作は、この索引によって検証済みになるものではありません。', '', '## 参照到達性と共有資源', '',
    `全${index.reachability.serialized_objects}オブジェクトのうち、Layerの参照から到達するものは${index.reachability.layer_reference_reachable}個です。`,
    'JSONの `objects` にはGUID・fileID・保存先・所有Layer・参照先を、`shared_resources` には複数のLayerまたは入口から共有される構造を記載しています。',
    '未到達は `not_reached_from_layer_references` と表記します。未使用や削除可能という意味ではありません。Controllerへの所有逆参照は探索から除き、Parameterを介した間接関係や実際のState遷移は評価していません。', '');
  for (const count of index.reachability.controller_subobjects) lines.push(`- ${count.controller.name}: 内部サブオブジェクト${count.serialized_subobjects}個、Layer参照から未到達${count.not_reached_from_layer_references}個。削除せずfileID付きで索引化しています。`);
  return lines.join('\n') + '\n';
}
