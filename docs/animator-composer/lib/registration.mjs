// Generic registration policy. No avatar-specific names, defaults, or sync rules.
// MA schema: modular-avatar 1.18.7 Runtime/{ModularAvatarParameters,
// ModularAvatarMergeAnimator,Menu/ModularAvatarMenuInstaller}.cs and their .meta files.
import {splitUnityDocuments, extractReferences, parseUnityScalar} from '../../ft-workbench/lib/unity-text.mjs';

const SDK_GUID = '67cc4cb7839cd3741b63733d5adf0442';
const EXPRESSION_SCRIPT_ID = '-1506855854';
const MA_PARAMETERS = '71a96d4ea0c344f39e277d82035bf9bd';
const MA_MERGE = '1bb122659f724ebf85fe095ac02dc339';
const MA_MENU = '7ef83cb0c23d4d7c9d41021e544a1978';
const EXTERNAL_TYPES = ['Int', 'Float', 'Bool'];
const ANIMATOR_TYPES = [...EXTERNAL_TYPES, 'Trigger'];
const FIXED_FIELDS = ['registered', 'type', 'defaultValue', 'saved', 'networkSynced'];
const EDIT_FIELDS = [...FIXED_FIELDS, 'applyAnimatorDefault'];
const PLAYABLES = Object.freeze({Base:0, Additive:2, Gesture:3, Action:4, FX:5, Sitting:6, TPose:7, IKPose:8});
// https://creators.vrchat.com/avatars/animator-parameters/ (built-in table).
// Aliases such as VRCEmote and VRCFaceBlendH are custom parameters, not built-ins.
const BUILTINS = new Set(['IsLocal', 'PreviewMode', 'Viseme', 'Voice', 'GestureLeft', 'GestureRight',
  'GestureLeftWeight', 'GestureRightWeight', 'AngularY', 'VelocityX', 'VelocityY', 'VelocityZ',
  'VelocityMagnitude', 'Upright', 'Grounded', 'Seated', 'AFK', 'TrackingType', 'VRMode',
  'MuteSelf', 'InStation', 'Earmuffs', 'IsOnFriendsList', 'AvatarVersion', 'IsAnimatorEnabled',
  'ScaleModified', 'ScaleFactor', 'ScaleFactorInverse', 'EyeHeightAsMeters', 'EyeHeightAsPercent']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const getOwn = (value, key) => value && own(value, key) ? value[key] : undefined;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const quote = value => JSON.stringify(value);
const yes = value => value ? 1 : 0;
const number = value => String(Object.is(value, -0) ? 0 : value);
const header = '%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n';

function validName(name) {
  if (typeof name !== 'string' || !name.trim() || /[\u0000-\u001f\u007f\u0085\u2028\u2029]/u.test(name)
    || /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(name))
    throw new Error('Parameter名が空、または対応していない制御文字を含みます。');
}

function validDefault(type, value, external = true) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${type}の初期値には有限の数値が必要です。`);
  if (type === 'Bool' || type === 'Trigger') {
    if (value !== 0 && value !== 1) throw new Error(`${type}の初期値は0または1です。`);
  } else if (type === 'Int') {
    if (!Number.isInteger(value) || value < (external ? 0 : -2147483648) || value > (external ? 255 : 2147483647))
      throw new Error(`Intの初期値が${external ? '0〜255' : '32bit整数'}の範囲外です。`);
  } else if (type === 'Float') {
    if (!Number.isFinite(Math.fround(value)) || (external && (value < -1 || value > 1)))
      throw new Error(`Floatの初期値が${external ? '-1〜1' : '32bit Float'}の範囲外です。`);
  } else throw new Error(`対応していないParameter型です: ${type}`);
}

function validateExternal(row) {
  if (!isRecord(row)) throw new Error('Expressionの行はParameter定義である必要があります。');
  validName(row.name);
  if (!EXTERNAL_TYPES.includes(row.type)) throw new Error(`${row.name}: Expression型はInt、Float、Boolから選択してください。`);
  validDefault(row.type, row.defaultValue);
  for (const key of ['saved', 'networkSynced']) if (typeof row[key] !== 'boolean') throw new Error(`${row.name}: ${key}はtrue/falseで指定してください。`);
  if (own(row, 'applyAnimatorDefault') && typeof row.applyAnimatorDefault !== 'boolean') throw new Error(`${row.name}: applyAnimatorDefaultはtrue/falseで指定してください。`);
}

function validateRows(rows, limits = false) {
  if (!Array.isArray(rows)) throw new Error('ExpressionのParameter配列がありません。');
  const names = new Set();
  let bits = 0;
  for (const row of rows) {
    validateExternal(row);
    if (names.has(row.name)) throw new Error(`ExpressionのParameter名が重複しています: ${row.name}`);
    names.add(row.name);
    if (row.networkSynced) bits += row.type === 'Bool' ? 1 : 8;
  }
  if (limits && rows.length > 8192) throw new Error(`Expressionの登録数${rows.length}が8192件の上限を超えます。`);
  if (limits && bits > 256) throw new Error(`Expressionの同期量${bits}bitが256bitの上限を超えます。`);
  return bits;
}

function scriptReference(document) {
  return extractReferences(document.text).find(ref => {
    const before = document.text.slice(document.text.lastIndexOf('\n', ref.start - 1) + 1, ref.start).trim();
    return before === 'm_Script:';
  });
}

/** Parse the SDK asset, never treating a malformed fixed setting as a UI default. */
export function parseExpression(text) {
  const docs = splitUnityDocuments(text).documents.filter(doc => {
    if (doc.classId !== '114') return false;
    const script = scriptReference(doc);
    return script?.guid?.toLowerCase() === SDK_GUID && script.fileId === EXPRESSION_SCRIPT_ID;
  });
  if (docs.length !== 1) throw new Error('SDK Expression Parametersのdocumentが一つ必要です。');
  const lines = docs[0].text.split(/\r?\n/);
  const headings = lines.map((line, i) => /^  parameters:/.test(line) ? i : -1).filter(i => i >= 0);
  if (headings.length !== 1) throw new Error('Expressionのparameters項目が一つ必要です。');
  const start = headings[0], heading = lines[start].trim();
  let end = start + 1;
  while (end < lines.length && !/^  [A-Za-z_][A-Za-z_0-9]*:/.test(lines[end])) end++;
  const body = lines.slice(start + 1, end).filter(line => line.trim() && !/^\s*#/.test(line));
  if (heading === 'parameters: []') {
    if (body.length) throw new Error('空のparametersに追加のデータがあります。');
    return [];
  }
  if (heading !== 'parameters:') throw new Error('対応していないExpressionの配列形式です。');
  if (!body.length) throw new Error('空のExpression配列はparameters: []で指定してください。');
  const records = [];
  let current;
  const allowed = new Set(['name', 'valueType', 'saved', 'defaultValue', 'networkSynced']);
  for (const line of body) {
    const first = /^  - ([A-Za-z_][A-Za-z_0-9]*):(?:[ \t]*(.*))?$/.exec(line);
    const next = /^    ([A-Za-z_][A-Za-z_0-9]*):(?:[ \t]*(.*))?$/.exec(line);
    if (first) { current = new Map(); records.push(current); }
    const match = first ?? next;
    if (!current || !match || !allowed.has(match[1]) || current.has(match[1])) throw new Error(`Expressionの行形式、項目、重複を確認してください: ${line.trim()}`);
    current.set(match[1], parseUnityScalar(match[2] ?? ''));
  }
  const numeric = (value, field) => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new Error(`Expressionの${field}が数値ではありません。`);
    return Number(value);
  };
  const flag = (value, field) => {
    if (value !== '0' && value !== '1') throw new Error(`Expressionの${field}は0または1である必要があります。`);
    return value === '1';
  };
  const rows = records.map(record => {
    if (record.size !== allowed.size) throw new Error('Expressionの行に必要な設定がありません。');
    const type = record.get('valueType');
    if (!/^[012]$/.test(type)) throw new Error('ExpressionのvalueTypeが未対応です。');
    return {name:record.get('name'), type:EXTERNAL_TYPES[Number(type)],
      defaultValue:numeric(record.get('defaultValue'), 'defaultValue'),
      saved:flag(record.get('saved'), 'saved'), networkSynced:flag(record.get('networkSynced'), 'networkSynced')};
  });
  validateRows(rows);
  return rows;
}

const registrationValue = row => ({registered:true, type:row.type, defaultValue:row.defaultValue, saved:row.saved, networkSynced:row.networkSynced});
const sameDefinition = (a, b) => FIXED_FIELDS.every(key => a[key] === b[key]);
const sameAnimator = (a, b) => a.type === b.type && a.defaultValue === b.defaultValue;
const compatible = (external, animator) => external === animator || (external === 'Bool' && animator === 'Float');

/** Resolve fixed scopes, explicit site edits, and independent per-output declarations. */
export function resolveRegistration(blocks, expressions, plan, externalCandidates = []) {
  const issues = [], rows = [], registrations = [], animatorConflicts = [];
  const addIssue = (code, message, blockId, severity = 'error') => issues.push({severity, code, message, ...(blockId ? {blockId} : {})});
  if (!Array.isArray(blocks) || !(expressions instanceof Map) || !isRecord(plan)) throw new TypeError('blocks、Expression Map、Planが必要です。');
  if (!Array.isArray(externalCandidates)) throw new TypeError('外部Parameter候補は配列で指定してください。');
  const editMap = plan.parameterEdits ?? {}, choiceMap = plan.conflictChoices ?? {}, animatorChoices = plan.animatorChoices ?? {};
  for (const [name, value] of [['parameterEdits', editMap], ['conflictChoices', choiceMap], ['animatorChoices', animatorChoices]])
    if (!isRecord(value)) throw new TypeError(`${name}はオブジェクトである必要があります。`);
  const configured = new Map((plan.outputs ?? []).flatMap(output => [output.base, ...(output.additions ?? [])]).filter(Boolean).map(b => [b.id, b]));
  const byName = new Map(), byOutput = new Map(), ids = new Set();
  const entry = name => {
    if (!byName.has(name)) byName.set(name, {name, sources:[], fixed:[], excluded:[], editable:[], declarations:[]});
    return byName.get(name);
  };
  const addSource = (item, id) => { if (!item.sources.includes(id)) item.sources.push(id); };
  const expressionCache = new Map();
  const expression = (id, blockId) => {
    if (expressionCache.has(id)) return expressionCache.get(id);
    if (!expressions.has(id)) { addIssue('missing_expression', `選択したExpressionがありません: ${id}`, blockId); expressionCache.set(id, null); return null; }
    const list = expressions.get(id);
    try { validateRows(list); } catch (error) { addIssue('invalid_expression', `${id}: ${error.message}`, blockId); expressionCache.set(id, null); return null; }
    expressionCache.set(id, list);
    return list;
  };
  const global = !!plan.globalExpressionId;
  const globalRows = global ? expression(plan.globalExpressionId, 'global') : null;
  if (globalRows) for (const row of globalRows) {
    const item = entry(row.name);
    item.fixed.push({sourceId:'global', label:'全体Expression', value:registrationValue(row)});
    addSource(item, 'global');
  }

  for (const block of blocks) {
    if (!isRecord(block) || typeof block.id !== 'string' || !block.id || typeof block.outputId !== 'string' || !block.outputId || !Array.isArray(block.parameters)) {
      addIssue('invalid_block', 'ブロックID、出力ID、Parameter宣言を確認してください。'); continue;
    }
    if (ids.has(block.id)) { addIssue('duplicate_block', `ブロックIDが重複しています: ${block.id}`, block.id); continue; }
    ids.add(block.id);
    if (!byOutput.has(block.outputId)) byOutput.set(block.outputId, new Map());
    const output = byOutput.get(block.outputId);
    const expressionId = block.expressionId ?? configured.get(block.id)?.expressionId ?? null;
    const fixedRows = global ? globalRows : expressionId ? expression(expressionId, block.id) : null;
    const fixedNames = new Set(fixedRows?.map(row => row.name) ?? []);
    if (!global && fixedRows) for (const row of fixedRows) {
      const item = entry(row.name);
      item.fixed.push({sourceId:block.id, label:block.label ?? block.id, value:registrationValue(row)});
      addSource(item, block.id);
    }
    const names = new Set();
    for (const parameter of block.parameters) {
      try {
        if (!isRecord(parameter)) throw new Error('Parameter宣言が不正です。');
        validName(parameter.name);
        if (!ANIMATOR_TYPES.includes(parameter.type)) throw new Error(`未対応のAnimator型です: ${parameter.type}`);
        validDefault(parameter.type, parameter.defaultValue, false);
        if (names.has(parameter.name)) throw new Error(`ブロック内のParameter名が重複しています: ${parameter.name}`);
      } catch (error) { addIssue('invalid_animator_parameter', error.message, block.id); continue; }
      names.add(parameter.name);
      const item = entry(parameter.name);
      addSource(item, block.id);
      const declaration = {sourceId:block.id, outputId:block.outputId, type:parameter.type, defaultValue:parameter.defaultValue};
      item.declarations.push(declaration);
      if (!output.has(parameter.name)) output.set(parameter.name, []);
      output.get(parameter.name).push(declaration);
      if (BUILTINS.has(parameter.name)) item.excluded.push(block.id);
      else if (global || expressionId) {
        // A missing/invalid selected asset stays fixed and blocked; never open it for editing.
        if (!fixedNames.has(parameter.name)) item.excluded.push(block.id);
      } else item.editable.push(block.id);
    }
  }

  // Menu references provide names, not Animator type/default declarations. They must
  // not unlock an existing fixed exclusion or create a synthetic Animator parameter.
  for (const candidate of externalCandidates) {
    try {
      if (!isRecord(candidate)) throw new Error('外部候補の形式が不正です。');
      validName(candidate.name);
      if (typeof candidate.nodeId !== 'string' || !candidate.nodeId || typeof candidate.path !== 'string' || !candidate.path)
        throw new Error('外部候補の参照元nodeId/pathがありません。');
    } catch (error) { addIssue('invalid_external_candidate', error.message); continue; }
    const existed = byName.has(candidate.name);
    const item = entry(candidate.name), sourceId = `menu:${candidate.nodeId}`;
    addSource(item, sourceId);
    if (!existed) {
      if (global || BUILTINS.has(candidate.name)) item.excluded.push(sourceId);
      else item.editable.push(sourceId);
    }
  }

  const animatorEntries = [];
  for (const [outputId, declarations] of byOutput) {
    const result = [];
    const overrides = getOwn(animatorChoices, outputId) ?? {};
    if (!isRecord(overrides)) { addIssue('invalid_animator_choice', `${outputId}: Animator設定が不正です。`); continue; }
    for (const [name, candidates] of declarations) {
      const conflicts = candidates.some(p => !sameAnimator(p, candidates[0]));
      if (conflicts) animatorConflicts.push({outputId, name, options:candidates.map(({sourceId,type,defaultValue}) => ({sourceId,type,defaultValue}))});
      let chosen = candidates[0];
      const override = getOwn(overrides, name);
      if (override !== undefined) {
        try {
          if (!isRecord(override) || !ANIMATOR_TYPES.includes(override.type)) throw new Error('Animator型を明示してください。');
          if (Object.keys(override).some(key => !['type', 'defaultValue'].includes(key))) throw new Error('Animator設定に未対応の項目があります。');
          validDefault(override.type, override.defaultValue, false);
          chosen = override;
        } catch (error) { addIssue('invalid_animator_choice', `${outputId}/${name}: ${error.message}`); }
      } else if (conflicts) addIssue('animator_conflict', `${outputId}/${name}: Animatorの型または初期値が異なります。採用する設定を指定してください。`);
      result.push({name, type:chosen.type, defaultValue:chosen.defaultValue});
    }
    for (const name of Object.keys(overrides)) if (!declarations.has(name)) addIssue('unknown_animator_choice', `${outputId}/${name}: 対象のAnimator宣言がありません。`);
    animatorEntries.push([outputId, result]);
  }
  for (const outputId of Object.keys(animatorChoices)) if (!byOutput.has(outputId)) addIssue('unknown_animator_choice', `${outputId}: 対象の出力Controllerがありません。`);
  const animators = Object.fromEntries(animatorEntries);

  for (const item of byName.values()) {
    const {name} = item;
    const hint = item.declarations[0];
    const fixed = item.fixed.length > 0 || (item.editable.length === 0 && item.excluded.length > 0) || global || BUILTINS.has(name);
    let value = {registered:fixed ? false : null, type:hint?.type ?? null, defaultValue:hint?.defaultValue ?? 0, saved:false, networkSynced:false};
    let conflict = false;
    const options = item.fixed.map(option => ({...option, value:{...option.value}}));
    if (options.length) {
      value = {...options[0].value};
      const differs = options.some(option => !sameDefinition(option.value, value));
      if (differs) {
        const selected = options.find(option => option.sourceId === getOwn(choiceMap, name));
        if (selected) value = {...selected.value};
        else { conflict = true; addIssue('registration_conflict', `${name}: 固定Expressionの設定が異なります。採用元を指定してください。`); }
      }
    }
    let applyAnimatorDefault = false;
    const edit = getOwn(editMap, name);
    if (edit !== undefined) {
      if (!isRecord(edit)) addIssue('invalid_parameter_edit', `${name}: Parameter編集はオブジェクトで指定してください。`);
      else {
        for (const key of Object.keys(edit)) if (!EDIT_FIELDS.includes(key)) addIssue('invalid_parameter_edit', `${name}: 未対応の編集項目です: ${key}`);
        if (fixed) {
          if (FIXED_FIELDS.some(key => own(edit, key) && edit[key] !== value[key])) addIssue('fixed_parameter_edit', `${name}: 固定Expressionの登録設定は通常編集で変更できません。`);
        } else for (const key of FIXED_FIELDS) if (own(edit, key)) value[key] = edit[key];
        if (own(edit, 'applyAnimatorDefault')) {
          if (typeof edit.applyAnimatorDefault !== 'boolean') addIssue('invalid_parameter_edit', `${name}: Animator初期値の反映はtrue/falseで指定してください。`);
          else applyAnimatorDefault = edit.applyAnimatorDefault;
        }
      }
    }
    const row = {name, ...value, applyAnimatorDefault, fixed, sourceIds:[...item.sources], conflict, options};
    rows.push(row);
    if (value.registered === null) addIssue('registration_undecided', `${name}: Expressionへ登録するか、除外するかを選択してください。`);
    else if (typeof value.registered !== 'boolean') addIssue('invalid_parameter_edit', `${name}: 登録はtrue/falseで指定してください。`);
    if (!value.registered) {
      if (applyAnimatorDefault) addIssue('unregistered_default_override', `${name}: 外部未登録の項目にはExpression初期値を反映できません。Animator設定で変更してください。`);
      continue;
    }
    if (BUILTINS.has(name)) addIssue('builtin_registration', `${name}: VRChat組込みParameterは独自Expressionへ登録できません。選択したExpressionを確認してください。`);
    if (item.excluded.length && !BUILTINS.has(name)) addIssue('shared_excluded_parameter', `${name}: ${item.excluded.join(', ')}では非掲載ですが、同名の共有Parameterが他の範囲から登録されます。`, undefined, 'warning');
    const registration = {name, type:value.type, defaultValue:value.defaultValue, saved:value.saved, networkSynced:value.networkSynced, applyAnimatorDefault};
    try { validateExternal(registration); }
    catch (error) { addIssue('invalid_external_parameter', `${name}: ${error.message}`); continue; }
    registrations.push(registration);
    for (const [outputId, list] of animatorEntries) {
      const declaration = list.find(p => p.name === name);
      if (!declaration) continue;
      if (!compatible(value.type, declaration.type)) addIssue('unsupported_type_conversion', `${outputId}/${name}: 外部${value.type}→Animator ${declaration.type}の型変換は未対応です。同型またはBool→Floatに対応しています。`);
      else if (applyAnimatorDefault) declaration.defaultValue = value.defaultValue;
    }
  }
  for (const name of Object.keys(editMap)) if (!byName.has(name)) addIssue('unknown_parameter_edit', `${name}: 編集対象のParameterがありません。`);
  for (const name of Object.keys(choiceMap)) if (!byName.has(name)) addIssue('unknown_conflict_choice', `${name}: 採用対象のParameterがありません。`);
  const bitCost = validateRows(registrations);
  if (bitCost > 256) addIssue('sync_budget', `同期量${bitCost}bitが256bitの上限を超えます。同期設定を確認してください。`);
  if (registrations.length > 8192) addIssue('parameter_count', `Expression登録${registrations.length}件が8192件の上限を超えます。`);
  return {rows, registrations, animators, issues, bitCost, animatorConflicts};
}

const objectFields = `  m_ObjectHideFlags: 0\n  m_CorrespondingSourceObject: {fileID: 0}\n  m_PrefabInstance: {fileID: 0}\n  m_PrefabAsset: {fileID: 0}\n`;
function mono(id, gameObject, scriptGuid, scriptId, name = '') {
  return `--- !u!114 &${id}\nMonoBehaviour:\n${objectFields}  m_GameObject: {fileID: ${gameObject}}\n  m_Enabled: 1\n  m_EditorHideFlags: 0\n  m_Script: {fileID: ${scriptId}, guid: ${scriptGuid}, type: 3}\n  m_Name: ${name ? quote(name) : ''}\n  m_EditorClassIdentifier: \n`;
}
const versionTag = '  _modularAvatarVersionTag:\n    UpdatedAtVersion: 1.18.7\n    MinimumVersion: 1.18.0\n';

export function serializeExpression(registrations, name = 'ExpressionParameters') {
  validateRows(registrations, true);
  validName(name);
  if (registrations.some(p => BUILTINS.has(p.name))) throw new Error('VRChat組込みParameterはExpressionへ登録できません。');
  return header + mono('11400000', '0', SDK_GUID, EXPRESSION_SCRIPT_ID, name)
    + (registrations.length ? '  parameters:\n' + registrations.map(row =>
      `  - name: ${quote(row.name)}\n    valueType: ${EXTERNAL_TYPES.indexOf(row.type)}\n    saved: ${yes(row.saved)}\n    defaultValue: ${number(row.defaultValue)}\n    networkSynced: ${yes(row.networkSynced)}\n`).join('') : '  parameters: []\n');
}

function externalReference(value, label) {
  if (!isRecord(value) || typeof value.guid !== 'string' || !/^[a-fA-F0-9]{32}$/.test(value.guid) || /^0{32}$/.test(value.guid)
    || typeof value.fileId !== 'string' || !/^-?[1-9][0-9]*$/.test(value.fileId)) throw new Error(`${label}のGUID/fileIDが不正です。`);
  const id = BigInt(value.fileId);
  if (id < -(1n << 63n) || id > (1n << 63n) - 1n) throw new Error(`${label}のfileIDが64bit範囲外です。`);
  return `{fileID: ${value.fileId}, guid: ${value.guid.toLowerCase()}, type: 2}`;
}

/** MA Parameters and the optional Menu share one Installer GameObject. */
export function serializeInstaller({name, controllers, registrations, options, menu = null}) {
  validName(name);
  validateRows(registrations, true);
  if (registrations.some(p => BUILTINS.has(p.name))) throw new Error('VRChat組込みParameterはMA Parametersへ登録できません。');
  if (!Array.isArray(controllers) || !controllers.length || controllers.length > 8) throw new Error('出力Controllerを1〜8個指定してください。');
  if (!isRecord(options) || !['Absolute', 'Relative'].includes(options.pathMode) || !['Append', 'Replace'].includes(options.mergeMode)
    || typeof options.matchWriteDefaults !== 'boolean') throw new Error('MA Merge Animatorの導入設定が不正です。');
  if (options.menuId && !menu) throw new Error('選択したMenuの出力参照がありません。');
  const seenPlayables = new Set();
  const controllerRefs = controllers.map(controller => {
    const ref = externalReference(controller, 'Controller');
    if (!own(PLAYABLES, controller.playable)) throw new Error(`未対応のPlayableです: ${controller.playable}`);
    if (seenPlayables.has(controller.playable)) throw new Error(`${controller.playable}の出力Controllerが重複しています。`);
    seenPlayables.add(controller.playable);
    return ref;
  });
  const menuRef = menu === null ? null : externalReference(menu, 'Menu');
  const root = '100000', transform = '400000', parameters = '11400001';
  const mergeIds = controllers.map((_, i) => String(11400002 + i));
  const menuId = '11400100';
  const components = [transform, parameters, ...mergeIds, ...(menuRef ? [menuId] : [])];
  let text = header + `--- !u!1 &${root}\nGameObject:\n${objectFields}  serializedVersion: 6\n  m_Component:\n`
    + components.map(id => `  - component: {fileID: ${id}}\n`).join('')
    + `  m_Layer: 0\n  m_Name: ${quote(name)}\n  m_TagString: Untagged\n  m_Icon: {fileID: 0}\n  m_NavMeshLayer: 0\n  m_StaticEditorFlags: 0\n  m_IsActive: 1\n`
    + `--- !u!4 &${transform}\nTransform:\n${objectFields}  m_GameObject: {fileID: ${root}}\n  serializedVersion: 2\n  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}\n  m_LocalPosition: {x: 0, y: 0, z: 0}\n  m_LocalScale: {x: 1, y: 1, z: 1}\n  m_ConstrainProportionsScale: 0\n  m_Children: []\n  m_Father: {fileID: 0}\n  m_LocalEulerAnglesHint: {x: 0, y: 0, z: 0}\n`
    + mono(parameters, root, MA_PARAMETERS, '11500000') + versionTag;
  text += registrations.length ? '  parameters:\n' + registrations.map(row =>
    `  - nameOrPrefix: ${quote(row.name)}\n    remapTo: \n    internalParameter: 0\n    isPrefix: 0\n    syncType: ${{Int:1, Float:2, Bool:3}[row.type]}\n    localOnly: ${yes(!row.networkSynced)}\n    defaultValue: ${number(row.defaultValue)}\n    saved: ${yes(row.saved)}\n    hasExplicitDefaultValue: 1\n    m_overrideAnimatorDefaults: ${yes(row.applyAnimatorDefault)}\n`).join('') : '  parameters: []\n';
  for (const [i, controller] of controllers.entries()) text += mono(mergeIds[i], root, MA_MERGE, '11500000') + versionTag
    + `  animator: ${controllerRefs[i]}\n  layerType: ${PLAYABLES[controller.playable]}\n  deleteAttachedAnimator: 0\n  pathMode: ${options.pathMode === 'Absolute' ? 1 : 0}\n  matchAvatarWriteDefaults: ${yes(options.matchWriteDefaults)}\n  relativePathRoot:\n    referencePath: \n    targetObject: {fileID: 0}\n  layerPriority: 0\n  mergeAnimatorMode: ${options.mergeMode === 'Replace' ? 1 : 0}\n`;
  if (menuRef) text += mono(menuId, root, MA_MENU, '11500000') + versionTag
    + `  menuToAppend: ${menuRef}\n  installTargetMenu: {fileID: 0}\n`;
  // Validate local identities/serialization before handing the text to the package writer.
  splitUnityDocuments(text);
  return text;
}
