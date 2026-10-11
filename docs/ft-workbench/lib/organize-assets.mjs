// Relocate serialized objects without changing their motion graph or numeric data.
import { splitUnityDocuments, joinUnityDocuments, extractReferences,
  extractAnimatorLayers, replaceDocumentFileId, parseUnityScalar } from './unity-text.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const preamble = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const key = (guid, id) => `${guid}:${id}`;
function field(text, name) {
  const m = new RegExp(`^  ${name}: ?([^\\r\\n]*)`, 'm').exec(text);
  assert(m, `Missing ${name}`); return parseUnityScalar(m[1]);
}
function setField(text, name, value) {
  field(text, name);
  return text.replace(new RegExp(`^(  ${name}:)[^\\r\\n]*`, 'm'), `$1 ${value}`);
}
const resolve = (r, guid) => key(r.kind === 'external' ? r.guid : guid, r.fileId);

export async function organizeFtAssets(assets, makeAsset, { emptyEvents } = {}) {
  const originals = [...assets], nodes = new Map(), controllers = [];
  for (const asset of originals) {
    for (const doc of splitUnityDocuments(dec.decode(asset.asset)).documents)
      nodes.set(key(asset.guid, doc.fileId), { asset, doc });
    if (asset.path.endsWith('.controller')) controllers.push(asset);
  }
  const roots = new Map();
  const layerNames = {
    Binary: 'Binary_Root', Decode: 'Decode_Root', NK_Driver: 'NK_Driver_Root',
    NK_ComboLayer__FTextra_EyeSquint: 'FTExtra_EyeSquint_Root',
    EyeXY_Para: 'EyeXY_Para_Root', EyeXY_Shape: 'EyeXY_Shape_Root',
    FaceTrack_Additive: 'FaceTrack_Additive_Root',
  };
  for (const asset of controllers) for (const layer of extractAnimatorLayers(dec.decode(asset.asset))) {
    assert(layer.fields.m_SyncedLayerIndex === '-1', 'Synced Layer requires explicit override handling');
    const sm = extractReferences(layer.fields.m_StateMachine)[0];
    const queue = [resolve(sm, asset.guid)], seen = new Set();
    while (queue.length) {
      const id = queue.pop(); if (seen.has(id)) continue; seen.add(id);
      const node = nodes.get(id); assert(node, `Missing state graph object ${id}`);
      if (node.doc.classId === '1107') {
        for (const r of extractReferences(node.doc.text)) {
          if (r.fileId === '0') continue;
          const target = resolve(r, node.asset.guid), item = nodes.get(target);
          if (item && ['1107', '1102'].includes(item.doc.classId)) queue.push(target);
        }
      } else if (node.doc.classId === '1102') {
        const motion = extractReferences(field(node.doc.text, 'm_Motion'))[0];
        if (motion.fileId === '0') continue;
        const target = resolve(motion, node.asset.guid), root = nodes.get(target);
        assert(root, `Missing State motion ${target}`);
        if (root.doc.classId !== '206') continue;
        const name = layer.name === 'Smooth'
          ? ({ OSCmooth_Local: 'Smooth_Local_Root', OSCmooth_Net: 'Smooth_Remote_Root' })[field(node.doc.text, 'm_Name')]
          : layerNames[layer.name];
        assert(name, `Unknown Layer entry ${layer.name}`);
        if (roots.has(target)) assert(roots.get(target).name === name, 'Conflicting entry names for shared root');
        else roots.set(target, { ...root, name });
      }
    }
  }
  assert(roots.size === 9, `Expected nine unique entry trees, found ${roots.size}`);

  // Only controller-local motion closures move with their entry root. Shared
  // dependencies receive one owner; old/unreachable objects stay in place.
  const owners = new Map();
  for (const [rootKey, root] of roots) {
    if (!root.asset.path.endsWith('.controller')) continue;
    const queue = [rootKey], seen = new Set();
    while (queue.length) {
      const id = queue.pop(); if (seen.has(id)) continue; seen.add(id);
      const node = nodes.get(id); assert(node && ['206', '74'].includes(node.doc.classId), `Unexpected motion closure ${id}`);
      const set = owners.get(id) ?? new Set(); set.add(rootKey); owners.set(id, set);
      for (const r of extractReferences(node.doc.text)) {
        if (r.fileId !== '0' && r.kind === 'local') queue.push(resolve(r, node.asset.guid));
      }
    }
  }
  const mapping = new Map(), movedOut = new Set(), removedAssets = new Set();
  const relocations = [], assetMoves = new Map();
  function remember(nodeKey, destination, id, role) {
    assert(!mapping.has(nodeKey), `Object moved twice: ${nodeKey}`);
    const old = nodes.get(nodeKey);
    mapping.set(nodeKey, { guid: destination.guid, fileId: id });
    relocations.push({ from: { guid: old.asset.guid, file_id: old.doc.fileId, path: old.asset.path },
      to: { guid: destination.guid, file_id: id, path: destination.path }, class_id: old.doc.classId,
      old_name: field(old.doc.text, 'm_Name'), role });
  }
  for (const [rootKey, root] of roots) {
    let group;
    if (root.asset.path.endsWith('.controller')) {
      group = [rootKey, ...[...owners].filter(([id, set]) => id !== rootKey && set.size === 1 && set.has(rootKey)).map(([id]) => id)];
      assert(owners.get(rootKey).size === 1, 'An entry root is also a dependency of another root');
    } else {
      group = [rootKey, ...[...nodes].filter(([id, n]) => n.asset === root.asset && id !== rootKey).map(([id]) => id)];
      removedAssets.add(root.asset);
    }
    assert(!group.some(id => id !== rootKey && nodes.get(id).doc.fileId === '20600000'), 'Root main fileID collision');
    const texts = group.map(id => {
      const source = nodes.get(id).doc;
      return id === rootKey ? setField(setField(replaceDocumentFileId(source.text, '20600000'), 'm_Name', root.name), 'm_ObjectHideFlags', '0') : source.text;
    });
    const dest = await makeAsset(`Modules/Source/Root/${root.name}.asset`, joinUnityDocuments(preamble, texts), '20600000',
      root.asset.path.endsWith('.controller') ? null : root.asset.meta);
    group.forEach(id => { remember(id, dest, id === rootKey ? '20600000' : nodes.get(id).doc.fileId, id === rootKey ? 'layer_entry' : 'entry_dependency'); movedOut.add(id); });
    if (removedAssets.has(root.asset)) assetMoves.set(root.asset.guid, dest);
  }
  for (const [id, set] of owners) if (set.size > 1) {
    const node = nodes.get(id), isClip = node.doc.classId === '74';
    const fileId = isClip ? '7400000' : '20600000';
    const sourceName = field(node.doc.text, 'm_Name');
    assert(isClip && sourceName === 'hinzkaNK_Empty', 'Unexpected shared motion needs an explicit policy');
    assert(emptyEvents && /m_Events: \[\]/.test(node.doc.text), 'Empty event source changed');
    for (const curve of ['Rotation', 'CompressedRotation', 'Euler', 'Position', 'Scale', 'Float', 'PPtr', 'Editor', 'EulerEditor'])
      assert(new RegExp(`^  m_${curve}Curves: \\[\\]$`, 'm').test(node.doc.text), `Shared Empty has ${curve} curves`);
    assert(/m_LoopTime: 0/.test(node.doc.text), 'Shared Empty must be nonloop');
    const name = 'Empty(nonloop)';
    let text = setField(setField(replaceDocumentFileId(node.doc.text, fileId), 'm_ObjectHideFlags', '0'), 'm_Name', name);
    text = text.replace(/^    m_StopTime: 1$/m, '    m_StopTime: 0').replace(/^  m_Events: \[\]\n?$/m, emptyEvents);
    const dest = await makeAsset(`Modules/Source/Shared/${name}.anim`, preamble + text, fileId);
    remember(id, dest, fileId, 'shared_motion'); movedOut.add(id);
  }
  // Keep distinct source masks distinct. All existing standalone masks remain;
  // the EyeXY-local Safety gets its own visible file.
  for (const [id, node] of nodes) if (node.doc.classId === '319' && node.asset.path.endsWith('.controller')) {
    assert(field(node.doc.text, 'm_Name') === 'Safety', 'Unexpected embedded mask');
    const text = setField(replaceDocumentFileId(node.doc.text, '31900000'), 'm_ObjectHideFlags', '0');
    const dest = await makeAsset('Modules/Source/EyeXY/Para/Safety.mask', preamble + text, '31900000');
    remember(id, dest, '31900000', 'external_mask'); movedOut.add(id);
  }

  // Rewrite using OLD source identity even for documents now in another file.
  const destinationOrigins = new Map();
  for (const [old, dest] of mapping) destinationOrigins.set(key(dest.guid, dest.fileId), old);
  for (let i = assets.length - 1; i >= 0; i--) if (removedAssets.has(assets[i])) assets.splice(i, 1);
  function rewrite(text, sourceGuid, destinationGuid) {
    for (const r of [...extractReferences(text)].reverse()) {
      if (r.fileId === '0') continue;
      const sourceKey = resolve(r, sourceGuid);
      const target = mapping.get(sourceKey) ?? { guid: r.kind === 'external' ? r.guid : sourceGuid, fileId: r.fileId };
      if (!mapping.has(sourceKey) && sourceGuid === destinationGuid) continue;
      let value = target.guid === destinationGuid ? `{fileID: ${target.fileId}}`
        : `{fileID: ${target.fileId}, guid: ${target.guid}, type: ${r.type ?? '2'}}`;
      // A block-style reference begins on its own indented line.
      if (!r.text.startsWith('{')) value = r.text.match(/^ */)[0] + value + (r.text.endsWith('\n') ? '\n' : '');
      text = text.slice(0, r.start) + value + text.slice(r.end);
    }
    return text;
  }
  for (const asset of assets) {
    const split = splitUnityDocuments(dec.decode(asset.asset));
    const rewritten = [];
    for (const doc of split.documents) {
      const currentKey = key(asset.guid, doc.fileId);
      if (movedOut.has(currentKey)) continue;
      const origin = destinationOrigins.get(currentKey), sourceGuid = origin ? nodes.get(origin).asset.guid : asset.guid;
      rewritten.push(rewrite(doc.text, sourceGuid, asset.guid));
    }
    assert(rewritten.length, `Empty asset after relocation: ${asset.path}`);
    asset.asset = enc.encode(joinUnityDocuments(split.preamble, rewritten));
  }
  return { relocations, assetMoves, entryCount: roots.size };
}
