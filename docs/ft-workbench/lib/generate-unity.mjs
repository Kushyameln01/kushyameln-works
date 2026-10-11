// Browser/Node generator for the reviewed source packages. No filesystem or network.
// Source text is cloned; calculations and binding hashes use the actual Hike kernel.
import {
  splitUnityDocuments, joinUnityDocuments, extractReferences, replaceReferences,
  replaceDocumentFileId, extractAnimatorLayers, replaceAnimatorLayers,
  extractAnimatorParameters, appendAnimatorParameters,
  parseUnityScalar, canonicalizeObjectReferences,
} from './unity-text.mjs';
import { organizeFtAssets } from './organize-assets.mjs';
import { buildStructureIndex } from './structure-index.mjs';
import { cleanupFtParameters } from './parameter-cleanup.mjs';
import { ordinaryNames, canonicalizeExisting, assertNoParameterCollisions } from './naming.mjs';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
const PREAMBLE = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
const OUTPUT = 'Assets/KushyamelnFT_Hike_r11';
const GUID_NAMESPACE = 'ft-hike-r11';
// Keep the published asset identity stable across parameter-policy revisions.
export const GENERATOR_REVISION = 13;
const CONSTANT_WEIGHT = 'OSCm/BlendSet';
export const SOURCE_PACKAGES = Object.freeze({
  arkit: { name: 'ARKIT.unitypackage', sha256: '2d8b7042975cbcd98e9c8e9ab50e68901b2631a68e9f562312c61fdaa198eda1' },
  dontHave: { name: 'DontHaveARKIT.unitypackage', sha256: '0234ab3eccd48cb1398e237f0834ba339626a61de3c2eb11230c39a5c2343d35' },
  proxy: { name: 'FT_PARAMETER_PROXY.unitypackage', sha256: '10cdef9e7652656adb7983fabc0d81147958f32ee2edbd520e02495f0006ef34' },
  decode: { name: 'DecodeParameter_Sample_ver1.01.unitypackage', sha256: 'eab86b104825e7c7b64802a272893fa255e49bc6b236a0be9a12397310b75e77' },
});
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyPackageBytes(inputs) {
  for (const [key, spec] of Object.entries(SOURCE_PACKAGES)) {
    if (!(inputs[key] instanceof Uint8Array) || await sha256(inputs[key]) !== spec.sha256)
      throw new Error(`対応原本と一致しません: ${spec.name}`);
  }
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const scalar = parseUnityScalar;
function field(text, key, indent = 2) {
  const found = [...text.matchAll(new RegExp(`^${' '.repeat(indent)}${key}:([^\\n\\r]*)`, 'gm'))];
  assert(found.length === 1, `Expected one field ${key}`);
  return scalar(found[0][1].trim());
}
function setField(text, key, value, indent = 2) {
  field(text, key, indent);
  return text.replace(new RegExp(`^(${' '.repeat(indent)}${key}:)[^\\n\\r]*`, 'm'), (_, p) => `${p} ${value}`);
}
function ref(value) {
  const list = extractReferences(value); assert(list.length === 1 && list[0].text === value, `Invalid reference ${value}`);
  return list[0];
}
const externalRef = (asset, fileId) => `{fileID: ${fileId}, guid: ${asset.guid}, type: 2}`;
function documentMap(text) { return new Map(splitUnityDocuments(text).documents.map(d => [d.fileId, d])); }
function childBlocks(text) {
  const m = /^  m_Childs:\n([\s\S]*?)(?=^  [a-zA-Z_])/m.exec(text);
  if (!m && /^  m_Childs: \[\]$/m.test(text)) return [];
  assert(m, 'Missing BlendTree children');
  return m[1].match(/^  - [\s\S]*?(?=^  - |$(?![\s\S]))/gm) ?? [];
}
function replaceChildren(text, children) {
  assert(children.length > 0, 'Cannot create an empty motion slot');
  return text.replace(/^  m_Childs:(?: \[\])?\n[\s\S]*?(?=^  [a-zA-Z_])/m,
    '  m_Childs:\n' + children.join(''));
}
function renamedParameters(text, map) {
  return text.replace(/^(\s*(?:- )?(?:m_Name|m_BlendParameter|m_BlendParameterY|m_DirectBlendParameter|m_SpeedParameter|m_MirrorParameter|m_CycleOffsetParameter|m_TimeParameter|m_ConditionEvent|name):) ?([^\r\n]*)/gm,
    (all, prefix, value) => map.has(scalar(value)) ? `${prefix} ${map.get(scalar(value))}` : all);
}
function oneAsset(index, suffix) {
  const matches = [...index.values()].filter(a => a.path.endsWith(suffix));
  assert(matches.length === 1, `Expected one asset: ${suffix}`); return matches[0];
}
function assetText(a) { assert(a?.asset, 'Missing source asset'); return dec.decode(a.asset); }
function docsClosure(docs, roots) {
  const seen = new Set(), queue = [...roots];
  while (queue.length) {
    const id = queue.pop(); if (id === '0' || id === '9100000' || seen.has(id)) continue;
    const doc = docs.get(id); assert(doc, `Missing local document ${id}`); seen.add(id);
    for (const r of extractReferences(doc.text)) if (r.kind === 'local') queue.push(r.fileId);
  }
  return [...seen];
}
function motionSourceChannels(text) {
  const docs = documentMap(text), channels = [];
  const root = docs.get('1311336736799136580'); assert(root && field(root.text, 'm_BlendType') === '4', 'Unexpected Binary root');
  const active = new Set(childBlocks(root.text).map(c => ref(field(c, 'm_Motion', 4)).fileId));
  for (const doc of docs.values()) {
    if (doc.classId !== '206') continue;
    const match = /^Binary_(v2\/.+)_Root$/.exec(field(doc.text, 'm_Name')); if (!match) continue;
    const branches = childBlocks(doc.text), positive = branches.find(c => field(c, 'm_Threshold', 4) === '0');
    assert(positive, 'No positive branch');
    const pos = docs.get(ref(field(positive, 'm_Motion', 4)).fileId);
    const bits = childBlocks(pos.text).map(c => {
      const tree = docs.get(ref(field(c, 'm_Motion', 4)).fileId), children = childBlocks(tree.text);
      assert(field(tree.text, 'm_BlendType') === '0' && children.length === 2, 'Invalid bit tree');
      const curves = children.map(ch => {
        const clip = docs.get(ref(field(ch, 'm_Motion', 4)).fileId);
        const attrs = [...clip.text.matchAll(/^    attribute: (.+)$/gm)].map(m => scalar(m[1]));
        const values = [...clip.text.matchAll(/^        value: (.+)$/gm)].map(m => Number(m[1]));
        assert(attrs.length === 2 && attrs.every(v => v === `OSCm/Decoded/${match[1]}`), 'Invalid source bit destination');
        assert(values.length === 2 && values[0] === values[1] && Number.isFinite(values[0]), 'Not a constant bit curve');
        return { threshold: Number(field(ch, 'm_Threshold', 4)), value: values[0] };
      });
      assert(curves[0].threshold === 0 && curves[0].value === 0 && curves[1].threshold === 1, 'Invalid bit endpoints');
      return { parameter: field(tree.text, 'm_BlendParameter'), weight: curves[1].value, child: c };
    });
    const negative = branches.find(c => field(c, 'm_Threshold', 4) === '1');
    const input = match[1];
    assert(bits.every((bit, i) => bit.parameter === input + String(2 ** i)), 'Unexpected bit sequence');
    const signed = Boolean(negative);
    if (signed) assert(field(doc.text, 'm_BlendParameter') === `${input}Negative`, 'Unexpected sign name');
    channels.push({ input, active: active.has(doc.fileId), bits, signed, positive: pos, source: doc });
  }
  assert(channels.filter(c => c.active).length === 30 && channels.filter(c => c.active && c.signed).length === 6, 'Source active channels changed');
  return { docs, channels, root };
}

export async function generateFtAssets(packages, kernel) {
  assert(typeof kernel?.animatorHash === 'function', 'Real Hike kernel is required');
  const arkitAsset = oneAsset(packages.arkit, '/ARKit_FT_FX.controller');
  const baseText = assetText(arkitAsset);
  assert(await sha256(arkitAsset.asset) === '1713cbcf6c4a9bfa47920a7b7f11dd38ba776410c15733539f1b5fcaa1d928f8', 'Wrong ARKIT Controller');
  const { docs, channels, root } = motionSourceChannels(baseText);
  const sampleAsset = oneAsset(packages.decode, '/Decode_Parameter.controller');
  const sampleText = assetText(sampleAsset), sampleDocs = documentMap(sampleText);
  const eyeAsset = oneAsset(packages.dontHave, '/ThreusMaho_NK_BaseFX_GestureSuppress.controller');
  const eyeText = assetText(eyeAsset), eyeDocs = documentMap(eyeText);
  const assets = [], paths = new Set(), sourceCopies = [], externalScripts = new Set();
  const usedIds = new Set(docs.keys()); let nextId = 8100000000000000000n;
  const allocate = () => { do { nextId++; } while (usedIds.has(String(nextId))); usedIds.add(String(nextId)); return String(nextId); };
  async function makeAsset(relative, text, fileId, meta = null) {
    const path = `${OUTPUT}/${relative}`;
    assert(!paths.has(path), `Output path collision: ${path}`); paths.add(path);
    const guid = (await sha256(enc.encode(`${GUID_NAMESPACE}:${path}`))).slice(0, 32);
    const value = { guid, path, asset: enc.encode(text), meta: meta
      ? meta.replace(/^guid: [a-f0-9]{32}$/m, `guid: ${guid}`)
      : `fileFormatVersion: 2\nguid: ${guid}\nNativeFormatImporter:\n  externalObjects: {}\n  mainObjectFileID: ${fileId}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n` };
    assets.push(value); return value;
  }
  const rawSample = guid => assetText(packages.decode.get(guid));
  async function copyClosure(indexes, rootGuids, folder, redirects = new Map()) {
    const found = new Map(), queue = [...rootGuids];
    while (queue.length) {
      const guid = queue.pop(); if (found.has(guid) || redirects.has(guid)) continue;
      const alternatives = indexes.map(idx => idx.get(guid)).filter(Boolean);
      assert(alternatives.length, `Unresolved dependency ${guid}`);
      const source = alternatives[0], text = assetText(source);
      for (const alt of alternatives.slice(1)) assert(assetText(alt) === text, `Conflicting source GUID ${guid}`);
      found.set(guid, source);
      for (const r of extractReferences(text)) if (r.kind === 'external') {
        // DLL-backed MonoScripts use their own fileIDs, not 11500000. Only
        // references actually in m_Script may remain as installed SDK dependencies.
        const prefix = text.slice(text.lastIndexOf('\n', r.start - 1) + 1, r.start);
        if (/^\s*m_Script:\s*$/.test(prefix) && !indexes.some(i => i.has(r.guid))) externalScripts.add(r.guid);
        else queue.push(r.guid);
      }
    }
    const map = new Map(redirects), copies = [];
    for (const [guid, source] of found) {
      const original = assetText(source), fileId = splitUnityDocuments(original).documents[0].fileId;
      const relative = typeof folder === 'function'
        ? folder(source)
        : `${folder}/${guid}/${source.path.split('/').pop()}`;
      const copy = await makeAsset(relative, original, fileId, source.meta);
      map.set(guid, copy.guid); copies.push([source, copy]);
    }
    for (const [source, copy] of copies) {
      copy.asset = enc.encode(replaceReferences(assetText(source), { guidReferences: map }));
      sourceCopies.push({ source_guid: source.guid, output_guid: copy.guid, source_path: source.path, output_path: copy.path,
        source_sha256: await sha256(source.asset), changes: 'external_GUID_remap_only' });
    }
    return map;
  }
  const maskMap = await copyClosure([packages.decode], ['a7a725179d9762f44bfc62a836b6041e'],
    source => `Modules/Source/Masks/${source.path.split('/').pop()}`);
  const sampleMask = `{fileID: 31900000, guid: ${maskMap.get('a7a725179d9762f44bfc62a836b6041e')}, type: 2}`;
  // Fresh standalone assets retain every template field except named bindings/values/identity.
  function standalone(text, name, fileId) {
    const doc = splitUnityDocuments(text).documents; assert(doc.length === 1, 'Expected one template document');
    let result = replaceDocumentFileId(doc[0].text, fileId);
    result = setField(result, 'm_Name', name); result = setField(result, 'm_ObjectHideFlags', '0');
    return PREAMBLE + result;
  }
  async function clip(relative, parameter, value) {
    let text = rawSample('2f804f1167c851447979ae334ca321ff');
    assert(kernel.animatorHash('Answer_a') === Number(/^      attribute: (\d+)$/m.exec(text)?.[1]), 'Unexpected template binding hash');
    assert([...text.matchAll(/^    attribute: Answer_a$/gm)].length === 2, 'Unexpected template curves');
    text = text.replace(/^    attribute: Answer_a$/gm, `    attribute: ${parameter}`)
      .replace(/^      attribute: \d+$/m, `      attribute: ${kernel.animatorHash(parameter)}`)
      .replace(/^        value: 0$/gm, `        value: ${value}`);
    return makeAsset(`${relative}.anim`, standalone(text, relative.split('/').pop(), '7400000'), '7400000');
  }
  async function tree(relative, sourceText, nameMap, children = null) {
    let text = renamedParameters(sourceText, nameMap);
    if (children) text = replaceChildren(text, children);
    text = standalone(text, relative.split('/').pop(), '20600000');
    return makeAsset(`${relative}.asset`, text, '20600000');
  }
  const common = new Map([['AlwaysOne', CONSTANT_WEIGHT]]);
  const outputs = new Map(), channelReport = [], newParams = [];
  function newFloat(name) { return `  - m_Name: ${name}\n    m_Type: 1\n    m_DefaultFloat: 0\n    m_DefaultInt: 0\n    m_DefaultBool: 0\n    m_Controller: {fileID: 9100000}\n`; }
  const bitTemplate = rawSample('b38132c1528a5d04984f4a0d65e695e9');
  const negativeTemplate = rawSample('9e6e649f704d0b44eb147149c433dfcf');
  const decodeTemplate = rawSample('4d517d43e3e5a3a46aaeef3c868974b3');
  const smoothDriver = rawSample('df8db2700b4000b4ea701ce04917a823');
  const smoothFeedback = rawSample('8a211cb9f58d14749a71f9c9d9eabb5f');
  const smoothInput = rawSample('1885a3a19ff4dbb4880cb59b53bc2448');
  for (const channel of channels.filter(c => c.active)) {
    const { input, bits, positive, signed } = channel, names = ordinaryNames(input), weights = bits.map(b => b.weight);
    newParams.push(newFloat(names.magnitude), newFloat(names.cartesian));
    const path = `Modules/Source/${input}`, label = input.slice('v2/'.length), bitChildren = [];
    for (let i = 0; i < bits.length; i++) {
      const weight = kernel.magnitude(2 ** i, weights); assert(weight === bits[i].weight, 'Hike source weight mismatch');
      const zero = await clip(`${path}/Binary/Bit${2 ** i}_Off`, names.magnitude, 0);
      const one = await clip(`${path}/Binary/Bit${2 ** i}_On`, names.magnitude, weight);
      const children = childBlocks(bitTemplate).map((c, j) => setField(c, 'm_Motion', externalRef(j ? one : zero, '7400000'), 4));
      const b = await tree(`${path}/Binary/Bit${2 ** i}`, bitTemplate,
        new Map([...common, [field(bitTemplate, 'm_BlendParameter'), bits[i].parameter]]), children);
      bitChildren.push(setField(bits[i].child, 'm_Motion', externalRef(b, '20600000'), 4));
    }
    const signZero = await clip(`${path}/Binary/Sign0`, names.cartesian, 0);
    let signMotion = externalRef(signZero, '7400000');
    if (signed) {
      const signOne = await clip(`${path}/Binary/Sign1`, names.cartesian, 1);
      const children = childBlocks(negativeTemplate).map((c, j) => setField(c, 'm_Motion', externalRef(j ? signOne : signZero, '7400000'), 4));
      signMotion = externalRef(await tree(`${path}/Binary/Sign`, negativeTemplate,
        new Map([...common, ['DecodeNegative', `${input}Negative`]]), children), '20600000');
    }
    bitChildren.push(setField(bits[0].child, 'm_Motion', signMotion, 4));
    const binary = await tree(`${path}/Binary/${label}_Binary_Root`, positive.text, new Map(), bitChildren);
    const anchors = kernel.anchors(1), decoderChildren = [], decodeClips = new Map();
    for (const value of [0, 1, -1]) decodeClips.set(value, await clip(`${path}/Decode/Value${value}`, names.decoded, value));
    childBlocks(decodeTemplate).forEach((c, i) => {
      const p = anchors[i]; assert(field(c, 'm_Position', 4) === `{x: ${p.x}, y: ${p.y}}`, 'Decode anchors differ from template');
      decoderChildren.push(setField(c, 'm_Motion', externalRef(decodeClips.get(p.value), '7400000'), 4));
    });
    const decode = await tree(`${path}/Decode/${label}_Decode_Root`, decodeTemplate,
      new Map([...common, ['Decode_Output', names.magnitude], ['Decode_Cartesian', names.cartesian]]), decoderChildren);
    const smoothClips = [];
    for (const value of [-1, 0, 1]) smoothClips.push(await clip(`${path}/Smooth/Value${value}`, names.output, value));
    const smooth = {};
    const smoothDriverChildren = childBlocks(smoothDriver).map(c => {
      const threshold = Number(field(c, 'm_Threshold', 4));
      return setField(c, 'm_Threshold', threshold < 0 ? '-1.1' : threshold > 0 ? '1.1' : '0', 4);
    });
    const smoothDriverExtended = replaceChildren(smoothDriver, smoothDriverChildren);
    const smoothDriverRange = setField(setField(smoothDriverExtended, 'm_MinThreshold', '-1.1'), 'm_MaxThreshold', '1.1');
    for (const [side, signal] of [['Local', input], ['Remote', names.decoded]]) {
      const map = new Map([...common, ['Answer_a', signal], ['Answer_c', names.output]]);
      const leafChildren = source => childBlocks(source).map((c, i) => setField(c, 'm_Motion', externalRef(smoothClips[i], '7400000'), 4));
      const feedback = await tree(`${path}/Smooth/${side}_Feedback`, smoothFeedback, map, leafChildren(smoothFeedback));
      const direct = await tree(`${path}/Smooth/${side}_Input`, smoothInput, map, leafChildren(smoothInput));
      const children = childBlocks(smoothDriverRange).map(c => setField(c, 'm_Motion', externalRef(
        field(c, 'm_Threshold', 4) === '0' ? direct : feedback, '20600000'), 4));
      smooth[side] = await tree(`${path}/Smooth/${label}_Smooth_${side}_Root`, smoothDriverRange, map, children);
    }
    outputs.set(input, { binary, decode, smooth });
    channelReport.push({ input, bits: bits.length, signed, source_weights: weights,
      source_weight_sum: kernel.magnitude(2 ** bits.length - 1, weights), names,
      binary_guid: binary.guid, decode_guid: decode.guid, local_guid: smooth.Local.guid, remote_guid: smooth.Remote.guid });
  }
  const outer = {};
  for (const stage of ['binary', 'decode']) {
    const children = childBlocks(root.text).map(c => {
      const channel = channels.find(x => x.source.fileId === ref(field(c, 'm_Motion', 4)).fileId);
      return setField(c, 'm_Motion', externalRef(outputs.get(channel.input)[stage], '20600000'), 4);
    });
    const label = stage === 'binary' ? 'Binary' : 'Decode';
    outer[stage] = await tree(`Modules/Source/${label}/${label}_Root`, root.text, new Map(), children);
  }
  // Replace only active Local/Remote motions first; the layout pass externalizes these roots.
  const replacements = new Map();
  for (const [side, id] of [['Local', '-5597768112116283364'], ['Remote', '-7551295231623863851']]) {
    const doc = docs.get(id), children = childBlocks(doc.text).map(c => {
      const old = docs.get(ref(field(c, 'm_Motion', 4)).fileId);
      const match = /^OSCm\/(?:Local|Remote)\/(v2\/.+)Smoother$/.exec(field(old.text, 'm_BlendParameter'));
      assert(match, 'Unknown smoothing coefficient route');
      if (!outputs.has(match[1])) return c; // preserve all four existing dormant Remote readers
      return setField(c, 'm_Motion', externalRef(outputs.get(match[1]).smooth[side], '20600000'), 4);
    });
    assert(children.length === (side === 'Local' ? 30 : 34), 'Smoothing connectivity changed');
    replacements.set(id, setField(replaceChildren(doc.text, children), 'm_Name', `Smooth_${side}_Root`));
  }
  const addedDocs = [], addedLayers = [];
  const sampleLayers = extractAnimatorLayers(sampleText);
  for (const name of ['Binary', 'Decode']) {
    const layer = sampleLayers.find(l => l.name === name);
    const ids = docsClosure(sampleDocs, [ref(layer.fields.m_StateMachine).fileId]);
    const localMap = new Map(ids.map(id => [id, allocate()]));
    for (const id of ids) {
      const source = sampleDocs.get(id); let text = source.text;
      if (source.classId === '1102') text = setField(text, 'm_Motion', externalRef(outer[name.toLowerCase()], '20600000'));
      text = replaceDocumentFileId(text, localMap.get(id));
      addedDocs.push(replaceReferences(text, { localFileIds: localMap }));
    }
    let text = replaceReferences(layer.text, { localFileIds: localMap, guidReferences: maskMap });
    addedLayers.push(text);
  }
  const oldLayers = extractAnimatorLayers(baseText);
  const oldSmooth = oldLayers.find(l => l.name === 'NK_OSCmooth_Smoothing_Gen');
  let smoothLayer = setField(oldSmooth.text, 'm_Name', 'Smooth', 4);
  smoothLayer = setField(smoothLayer, 'm_Mask', sampleMask, 4);
  replacements.set('-1939805381514598841', setField(docs.get('-1939805381514598841').text, 'm_Name', 'Smooth'));
  const chosenEyeLayers = extractAnimatorLayers(eyeText).filter(l => ['EyeXY_Para', 'EyeXY_Shape'].includes(l.name));
  assert(chosenEyeLayers.map(x => x.name).join(',') === 'EyeXY_Para,EyeXY_Shape', 'Unexpected EyeXY order');
  const eyeLocalIds = docsClosure(eyeDocs, chosenEyeLayers.flatMap(l => [ref(l.fields.m_StateMachine).fileId, ref(l.fields.m_Mask).fileId]));
  const eyeLocalMap = new Map(eyeLocalIds.map(id => [id, allocate()]));
  const closureForLayer = layerName => {
    const layer = chosenEyeLayers.find(l => l.name === layerName);
    const localIds = docsClosure(eyeDocs, [ref(layer.fields.m_StateMachine).fileId, ref(layer.fields.m_Mask).fileId]);
    const roots = localIds.flatMap(id => extractReferences(eyeDocs.get(id).text)
      .filter(r => r.kind === 'external').map(r => r.guid));
    const indexes = [packages.dontHave, packages.proxy];
    const found = new Set(), queue = [...roots];
    while (queue.length) {
      const guid = queue.pop(); if (found.has(guid)) continue;
      const source = indexes.map(index => index.get(guid)).find(Boolean);
      assert(source, `Unresolved ${layerName} source GUID ${guid}`);
      found.add(guid);
      for (const r of extractReferences(assetText(source))) if (r.kind === 'external' && indexes.some(index => index.has(r.guid))) queue.push(r.guid);
    }
    return found;
  };
  const paraClosure = closureForLayer('EyeXY_Para'), shapeClosure = closureForLayer('EyeXY_Shape');
  const sharedEyeGuids = [...paraClosure].filter(guid => shapeClosure.has(guid));
  const eyeGuidMap = await copyClosure([packages.dontHave, packages.proxy],
    [...new Set([...paraClosure, ...shapeClosure])], source => {
      const layer = paraClosure.has(source.guid) && shapeClosure.has(source.guid) ? 'Shared'
        : paraClosure.has(source.guid) ? 'Para' : 'Shape';
      return `Modules/Source/EyeXY/${layer}/${source.path.split('/').pop()}`;
    });
  for (const id of eyeLocalIds) addedDocs.push(replaceReferences(replaceDocumentFileId(eyeDocs.get(id).text, eyeLocalMap.get(id)),
    { localFileIds: eyeLocalMap, guidReferences: eyeGuidMap }));
  const finalLayers = [oldLayers[0], ...addedLayers, smoothLayer, ...oldLayers.slice(3),
    ...chosenEyeLayers.map(l => replaceReferences(l.text, { localFileIds: eyeLocalMap, guidReferences: eyeGuidMap }))];
  let generated = joinUnityDocuments(splitUnityDocuments(baseText).preamble,
    [...docs.values()].map(d => replacements.get(d.fileId) ?? d.text).concat(addedDocs));
  generated = replaceAnimatorLayers(generated, finalLayers);
  // Only known existing coefficient names are standardized; their defaults survive.
  const oldParams = extractAnimatorParameters(generated), coefficientMap = new Map();
  for (const p of oldParams) {
    const canonical = canonicalizeExisting(p.name); if (canonical !== p.name) coefficientMap.set(p.name, canonical);
  }
  assertNoParameterCollisions(oldParams.map(p => coefficientMap.get(p.name) ?? p.name));
  for (const p of coefficientMap.keys()) assert(!generated.includes(`attribute: ${p}\n`), 'Coefficient curve requires a dedicated hash rewrite');
  generated = renamedParameters(generated, coefficientMap);
  const eyeParams = extractAnimatorParameters(eyeText);
  for (const [list, name] of [[oldParams, CONSTANT_WEIGHT], [eyeParams, 'AlwaysOne']]) {
    const p = list.find(p => p.name === name);
    assert(p && field(p.text, 'm_Type', 4) === '1' && field(p.text, 'm_DefaultFloat', 4) === '1', `Constant weight must be Float=1: ${name}`);
  }
  for (const name of ['v2/EyeLeftX', 'v2/EyeRightX', 'v2/EyeY', 'EyeLeftX_Proxy', 'EyeRightX_Proxy', 'EyeY_Proxy', 'EyeTrackingActive']) {
    const p = eyeParams.find(p => p.name === name); assert(p, `Missing EyeXY declaration ${name}`); newParams.push(p.text);
  }
  generated = appendAnimatorParameters(generated, newParams);
  const controllerDoc = documentMap(generated).get('9100000');
  generated = generated.replace(controllerDoc.text, setField(controllerDoc.text, 'm_Name', 'ARKit_FT_FX_Hike'));
  const fx = await makeAsset('Modules/Controllers/ARKit_FT_FX_Hike.controller', generated, '9100000', arkitAsset.meta);
  const additive = oneAsset(packages.dontHave, '/Additive+C_Maho.controller');
  const additiveMap = await copyClosure([packages.dontHave, packages.proxy], [additive.guid], source => {
    const doc = splitUnityDocuments(assetText(source)).documents[0];
    const category = ({ '74': 'Clips', '206': 'BlendTrees', '319': 'Masks', '1107': 'Controllers' })[doc.classId];
    assert(category, `Unexpected Additive asset class ${doc.classId}: ${source.path}`);
    if (category === 'Controllers') return `Modules/Controllers/${source.path.split('/').pop()}`;
    return `Modules/Source/Additive/${category}/${source.path.split('/').pop()}`;
  });
  // NK already produced this prefab/menu/parameter setup. Copy it, only retarget FX/assets.
  const prefab = oneAsset(packages.arkit, '/ARKit_FT_Installed.prefab');
  const installMap = await copyClosure([packages.arkit],
    [prefab.guid], source => `Installer/${source.path.split('/').pop()}`,
    new Map([[arkitAsset.guid, fx.guid]]))
    .catch(error => { throw new Error(`Installer dependency: ${error.message}`); });
  // One prefab installs both playable controllers and one grouped menu entry.
  // SDK 3.8.2 enum evidence: AnimLayerType Additive=2 / FX=5, SubMenu=103.
  const installedPrefab = assets.find(a => a.guid === installMap.get(prefab.guid));
  const prefabSplit = splitUnityDocuments(assetText(installedPrefab));
  const mergeDocs = prefabSplit.documents.filter(d => /^  layerType: 5$/m.test(d.text) && /^  animator:/m.test(d.text));
  assert(mergeDocs.length === 1, 'Expected one original MA FX merge component');
  const fxMerge = mergeDocs[0], additiveComponentId = allocate();
  assert(!prefabSplit.documents.some(d => d.fileId === additiveComponentId), 'Prefab component fileID collision');
  const additiveOutput = assets.find(a => a.guid === additiveMap.get(additive.guid));
  let additiveMerge = replaceDocumentFileId(fxMerge.text, additiveComponentId);
  additiveMerge = setField(setField(additiveMerge, 'layerType', '2'), 'animator', externalRef(additiveOutput, '9100000'));
  const gameObjectId = ref(field(fxMerge.text, 'm_GameObject')).fileId;
  const menuInstaller = prefabSplit.documents.find(d => /^  menuToAppend:/m.test(d.text));
  assert(menuInstaller, 'MA Menu Installer is missing');
  const innerMenu = assets.find(a => a.guid === ref(field(menuInstaller.text, 'menuToAppend')).guid);
  assert(innerMenu && /^  controls:\n  - name: EyeTracking\n/m.test(assetText(innerMenu)), 'Unexpected source menu');
  let wrapperText = setField(assetText(innerMenu), 'm_Name', 'RootMenu');
  wrapperText = wrapperText.replace(/^  controls:\n[\s\S]*$/m,
    `  controls:\n  - name: FaceTracking\n    icon: {fileID: 0}\n    type: 103\n    parameter:\n      name: \n    value: 0\n    style: 0\n    subMenu: ${externalRef(innerMenu, '11400000')}\n    subParameters: []\n    labels: []\n`);
  const rootMenu = await makeAsset('Installer/RootMenu.asset', wrapperText, '11400000');
  const installedDocs = prefabSplit.documents.map(d => {
    if (d.fileId === gameObjectId) {
      assert(d.text.includes(`  - component: {fileID: ${fxMerge.fileId}}\n`), 'FX merge is not registered on prefab');
      return d.text.replace(/^  m_Layer:/m, `  - component: {fileID: ${additiveComponentId}}\n  m_Layer:`);
    }
    if (d.fileId === menuInstaller.fileId) return setField(d.text, 'menuToAppend', externalRef(rootMenu, '11400000'));
    return d.text;
  });
  installedPrefab.asset = enc.encode(joinUnityDocuments(prefabSplit.preamble, [...installedDocs, additiveMerge]));
  const installerCopy = sourceCopies.find(c => c.output_guid === installedPrefab.guid);
  installerCopy.changes += ';Additive_merge_component;SubMenu_wrapper';
  // Apply the user-requested corrections after all source children/subassets
  // have been copied. This also covers inactive serialized parameter fields.
  const maskAdjustments = [], weightAdjustedAssets = [];
  for (const asset of assets) {
    const originalText = assetText(asset);
    assert(!/^\s*attribute: AlwaysOne\s*$/m.test(originalText), 'Constant-weight clip binding requires a hash rewrite');
    let text = renamedParameters(originalText, common);
    const changes = [];
    if (text !== originalText) {
      changes.push('AlwaysOne_to_OSCm/BlendSet');
      weightAdjustedAssets.push(asset.path);
    }
    const split = splitUnityDocuments(text);
    const updated = split.documents.map(doc => {
      if (doc.classId !== '319') return doc.text;
      const name = field(doc.text, 'm_Name');
      if (!['Safety', 'Safe', 'HeadYes_OnlyHumanoidRig', 'OnlyHead'].includes(name)) return doc.text;
      const headOnly = ['HeadYes_OnlyHumanoidRig', 'OnlyHead'].includes(name);
      assert(/^(?:00000000|01000000){13}$/.test(field(doc.text, 'm_Mask')), `Unexpected Humanoid mask data: ${name}`);
      const value = Array.from({ length: 13 }, (_, i) => headOnly && i === 2 ? '01000000' : '00000000').join('');
      maskAdjustments.push({ path: asset.path, file_id: doc.fileId, name, active_humanoid_parts: headOnly ? ['Head'] : [] });
      changes.push(`humanoid_${headOnly ? 'Head_only' : 'all_disabled'}`);
      return setField(doc.text, 'm_Mask', value);
    });
    text = joinUnityDocuments(split.preamble, updated);
    asset.asset = enc.encode(text);
    const copied = sourceCopies.find(copy => copy.output_guid === asset.guid);
    if (copied && changes.length) copied.changes = ['external_GUID_remap', ...changes].join(';');
    if (asset.path.endsWith('.controller')) {
      const parameters = extractAnimatorParameters(text);
      assertNoParameterCollisions(parameters.map(p => p.name));
      assert(!parameters.some(p => p.name === 'AlwaysOne'), 'Unmerged constant-weight declaration');
      const constant = parameters.find(p => p.name === CONSTANT_WEIGHT);
      assert(constant && field(constant.text, 'm_Type', 4) === '1' && field(constant.text, 'm_DefaultFloat', 4) === '1', 'Invalid shared constant weight');
    }
  }
  assert(maskAdjustments.length === 3, 'Expected two Safety masks and one Head-only mask');
  const emptyEvents = /^  m_Events:\n[\s\S]*$/m.exec(rawSample('2f804f1167c851447979ae334ca321ff'))?.[0];
  assert(emptyEvents && /^  - time: 0$/m.test(emptyEvents), 'Missing approved zero-frame event template');
  const organization = await organizeFtAssets(assets, makeAsset, { emptyEvents });
  for (let i = 0; i < weightAdjustedAssets.length; i++) {
    const move = organization.relocations.find(r => r.from.path === weightAdjustedAssets[i] && r.role === 'layer_entry');
    if (move && !assets.some(a => a.path === weightAdjustedAssets[i])) weightAdjustedAssets[i] = move.to.path;
  }
  for (const copy of sourceCopies) {
    const moved = organization.assetMoves.get(copy.output_guid);
    if (moved) { copy.output_guid = moved.guid; copy.output_path = moved.path; copy.changes += ';layer_entry_relocation_and_name'; }
  }
  for (const adjustment of maskAdjustments) {
    const moved = organization.relocations.find(r => r.from.path === adjustment.path && r.from.file_id === adjustment.file_id);
    if (moved) { adjustment.path = moved.to.path; adjustment.file_id = moved.to.file_id; }
  }
  // Unity's restricted YAML reader must receive same-line flow PPtr fields,
  // even when a general YAML parser accepts a flow map on the following line.
  for (const asset of assets) asset.asset = enc.encode(canonicalizeObjectReferences(assetText(asset)));
  const parameterChannels = channels.map(c => ({ ...(channelReport.find(r => r.input === c.input) ?? {}),
    input: c.input, active: c.active, signed: c.signed,
    bits: c.bits.map(b => ({ parameter: b.parameter, weight: b.weight })),
    ...(c.signed ? { signParameter: field(c.source.text, 'm_BlendParameter') } : {}),
  }));
  const parameterCleanup = cleanupFtParameters(assets, { outputRoot: OUTPUT, channels: parameterChannels });
  const parameterPaths = new Set([...parameterCleanup.controllers, ...parameterCleanup.registrations].map(c => c.path));
  for (const copy of sourceCopies) {
    copy.changes += ';canonical_PPtr_notation';
    if (parameterPaths.has(copy.output_path)) copy.changes += ';parameter_contract_emission_and_declaration_cleanup';
  }
  // Verify the complete serialized output, including retained original subassets.
  // Never turn an unresolved motion/mask/controller reference into a null slot.
  const assetIndex = new Map(assets.map(a => [a.guid, a]));
  assert(assetIndex.size === assets.length, 'Output GUID collision');
  const docIndexes = new Map(assets.map(a => [a.guid, documentMap(assetText(a))]));
  for (const asset of assets) for (const doc of docIndexes.get(asset.guid).values()) {
    if (doc.classId === '319') assert(asset.path.endsWith('.mask') && docIndexes.get(asset.guid).size === 1
      && doc.fileId === '31900000', `AvatarMask must be standalone: ${asset.path}`);
  }
  let referenceCount = 0;
  for (const asset of assets) {
    const text = assetText(asset), ownDocs = docIndexes.get(asset.guid);
    for (const r of extractReferences(text)) {
      if (r.fileId === '0') continue;
      referenceCount++;
      if (r.kind === 'local') assert(ownDocs.has(r.fileId), `Missing local reference ${asset.path}: ${r.fileId}`);
      else if (assetIndex.has(r.guid)) assert(docIndexes.get(r.guid).has(r.fileId), `Missing external fileID ${asset.path}: ${r.guid}/${r.fileId}`);
      else {
        const prefix = text.slice(text.lastIndexOf('\n', r.start - 1) + 1, r.start);
        assert(/^\s*m_Script:\s*$/.test(prefix), `Unresolved output asset ${asset.path}: ${r.guid}/${r.fileId}`);
        externalScripts.add(r.guid);
      }
    }
  }
  const structure = buildStructureIndex(assets, { outputRoot: OUTPUT, parameterContract: parameterCleanup.contract });
  assert(structure.index.entry_trees.length === 9, 'Structure index must contain nine entry trees');
  const generationSpec = {
    format: 'ft-hike-generation-spec-1', revision: GENERATOR_REVISION,
    purpose: 'Generate a consistent FaceTracking asset set and Modular Avatar installation prefab from the reviewed source profile.',
    supported_input_profile: { id: 'reviewed-arkit-proxy-decode-eyexy-1', packages: SOURCE_PACKAGES,
      target_mesh_supplied: false, target_avatar_supplied: false },
    installation: { primary: 'modular_avatar_prefab', prefab: installedPrefab.path,
      expression_asset_role: 'matching_parameters_for_manual_install_or_inspection',
      separate_expression_assignment_required: false,
      prerequisites: ['VRChat SDK and Modular Avatar installed', 'Avatar matches preserved mesh paths and ARKit bindings'],
      target_avatar_merge_and_budget: 'UNVERIFIED' },
    modules: structure.index.controllers.flatMap(c => c.layers.map(l => ({
      controller: c.path, layer: l.name, layer_index: l.index,
      entries: l.entry_trees.map(e => ({ path: e.path, file_id: e.file_id, guid: e.guid })),
    }))),
    channels: parameterChannels,
    parameter_contract: parameterCleanup.contract,
    parameter_validation: parameterCleanup.validation,
    preserved: ['source bit names, counts and weights', 'Local raw / Remote decoded smoothing',
      'ARKit bindings', 'expanded EyeXY proxy ranges', 'existing transitions',
      'EyeLid raw default 0.75 and existing bit/internal defaults'],
    verification: { serialized_structure: 'PASS', parameter_contract: 'PASS',
      unity_import: 'UNVERIFIED', modular_avatar_build: 'UNVERIFIED', osc_and_remote_runtime: 'UNVERIFIED' },
  };
  async function documentation(relative, content, importer) {
    return makeAsset(relative, content, '0', `fileFormatVersion: 2\nguid: ${'0'.repeat(32)}\n${importer}:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`);
  }
  const readmeAsset = await documentation('README.md', structure.readme, 'DefaultImporter');
  const indexAsset = await documentation('StructureIndex.json', JSON.stringify(structure.index, null, 2) + '\n', 'TextScriptImporter');
  const specAsset = await documentation('GenerationSpec.json', JSON.stringify(generationSpec, null, 2) + '\n', 'TextScriptImporter');
  // Folder metadata is deterministic and contains no empty asset payload.
  const directories = new Set();
  for (const asset of assets) {
    const parts = asset.path.split('/');
    for (let n = 2; n < parts.length; n++) directories.add(parts.slice(0, n).join('/'));
  }
  for (const path of [...directories].sort()) {
    assert(!paths.has(path), `Folder collides with asset: ${path}`);
    const guid = (await sha256(enc.encode(`${GUID_NAMESPACE}:${path}`))).slice(0, 32);
    assert(!assetIndex.has(guid), 'Folder GUID collision');
    const folder = { guid, path, asset: null,
      meta: `fileFormatVersion: 2\nguid: ${guid}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n` };
    assetIndex.set(guid, folder); assets.push(folder);
  }
  // The prefab's original FX is a deliberate replacement, not a missing dependency.
  return { assets, readme: structure.readme, structureIndex: structure.index, generationSpec,
    report: { format: 'ft-hike-generation-report-1', source: 'reviewed packages only',
    generator_revision: GENERATOR_REVISION, generation_spec: specAsset.path,
    parameter_validation: parameterCleanup.validation,
    fx: fx.path, fx_guid: fx.guid, additive_guid: additiveMap.get(additive.guid),
    controller_directory: `${OUTPUT}/Modules/Controllers`,
    installer_directory: `${OUTPUT}/Installer`,
    installer: { path: installedPrefab.path, merge_layers: [
      { name: 'FX', layer_type: 5, controller: fx.path },
      { name: 'Additive', layer_type: 2, controller: additiveOutput.path } ],
      menu: rootMenu.path, submenu: innerMenu.path },
    entry_root_directory: `${OUTPUT}/Modules/Source/Root`,
    structure_index: indexAsset.path, readme: readmeAsset.path,
    entry_tree_count: organization.entryCount, object_relocations: organization.relocations,
    structure_summary: structure.index.reachability,
    controllers: assets.filter(a => a.path.endsWith('.controller')).map(a => ({ path: a.path, guid: a.guid })),
    installer_guid: installMap.get(prefab.guid), channels: channelReport,
    layers: extractAnimatorLayers(generated).map(l => l.name), source_copies: sourceCopies,
    coefficient_renames: [...coefficientMap].map(([from, to]) => ({ from, to })),
    checks: { serialized_references: referenceCount, folders: directories.size, shape_key_policy: 'preserve_ARKit_bindings',
      package_sha256: Object.fromEntries(Object.entries(SOURCE_PACKAGES).map(([key, value]) => [key, value.sha256])) },
    sdk_script_dependencies: [...externalScripts].sort(),
    preserved_dormant_channels: channels.filter(c => !c.active).map(c => c.input),
    smooth_feedback_thresholds: [-1.1, 1.1],
    eyexy_shared_dependencies: sharedEyeGuids.length,
    constant_weight_parameter: CONSTANT_WEIGHT, weight_adjusted_assets: weightAdjustedAssets,
    humanoid_mask_adjustments: maskAdjustments,
    object_reference_format: 'same_line_flow',
    shared_empty_clip: `${OUTPUT}/Modules/Source/Shared/Empty(nonloop).anim`,
    parameter_cleanup: parameterCleanup,
    runtime: 'UNVERIFIED', browser_math: 'Hike WASM', original_assets_modified: false } };
}
