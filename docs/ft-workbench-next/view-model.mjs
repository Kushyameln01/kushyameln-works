// Display data only. Parameter policy stays in the shared generation contract.
export const ROLE_LABELS = Object.freeze({local_osc_raw:'OSC生入力',network_bit:'Binary bit',network_sign:'符号',eye_axis:'視線',tracking_status:'追跡状態',menu:'メニュー',internal:'内部計算',builtin:'VRChat組込み',preserved_dormant:'保管系統',writer_only:'書込み先'});
const fields = ['type','default_value','saved','network_synced'];
const labels = {type:'型',default_value:'初期値',saved:'保存',network_synced:'同期'};
const value = x => typeof x === 'boolean' ? x ? 'ON' : 'OFF' : String(x);

export function buildViewModel(data) {
  const spec = data?.generationSpec, contract = spec?.parameter_contract;
  if (spec?.format !== 'ft-hike-generation-spec-1' || spec.verification?.parameter_contract !== 'PASS'
      || !Array.isArray(contract?.parameters) || !Array.isArray(spec.modules)
      || !Array.isArray(data.structureIndex?.entry_trees) || !data.report
      || !/^[a-f0-9]{64}$/.test(data.specSha256 ?? '')) throw new Error('検証済みの生成結果を確認できません。');
  const parameters = contract.parameters;
  const external = parameters.filter(p => p.external.required);
  const changes = [];
  for (const p of parameters) {
    const observations = p.source_observations?.registrations ?? [];
    for (const kind of ['MA_Parameters','ExpressionParameters']) {
      const before = observations.find(o => o.kind === kind);
      if (p.external.required && !before) changes.push({kind,name:p.name,detail:'新規登録'});
      if (!p.external.required && before) changes.push({kind,name:p.name,detail:'外部登録を除去'});
      if (p.external.required && before) {
        const differences = fields.filter(k => before[k] !== p.external[k]).map(k => `${labels[k]} ${value(before[k])} → ${value(p.external[k])}`);
        if (differences.length) changes.push({kind,name:p.name,detail:differences.join('、')});
      }
    }
  }
  for (const d of data.report.parameter_cleanup?.defaults ?? []) {
    if (d.kind === 'Animator' && d.before !== d.after) changes.push({kind:'Animator',name:d.name,detail:`初期値 ${d.before} → ${d.after}`});
  }
  // Removed declarations may no longer be represented in the final contract.
  for (const r of data.report.parameter_cleanup?.registrations ?? []) {
    for (const removed of r.removed ?? []) {
      const name = typeof removed === 'string' ? removed : removed.name;
      if (name && !changes.some(c => c.kind === r.kind && c.name === name)) changes.push({kind:r.kind,name,detail:'外部登録を除去'});
    }
  }
  return {spec,parameters,externalCount:external.length,networkBits:contract.network_bits,
    modules:spec.modules,roots:data.structureIndex.entry_trees,changes,
    expectedAudit:{specSha256:data.specSha256,revision:spec.revision,root:contract.output_root}};
}

export function filterParameters(parameters, search, filter) {
  const needle = search.trim().toLowerCase();
  return parameters.filter(p => p.name.toLowerCase().includes(needle) &&
    (filter === 'all' || filter === 'external' && p.external.required || filter === 'synced' && p.external.required && p.external.network_synced
      || filter === 'local' && p.external.required && !p.external.network_synced || filter === 'internal' && !p.external.required));
}

export function validateAudit(audit, expected) {
  const reject = message => { throw new Error(message); };
  if (!audit || typeof audit !== 'object' || audit.format !== 'ft-hike-import-audit-2') reject('比較版の監査JSONではありません。比較版の監査スクリプトで取得してください。');
  if (!expected || !/^[a-f0-9]{64}$/.test(audit.generationSpecSha256 ?? '') || audit.generationSpecSha256 !== expected.specSha256)
    reject('現在の生成仕様と一致しません。この生成物をImportして監査をやり直してください。');
  if (audit.generatorRevision !== expected.revision || audit.root !== expected.root) reject('生成版または出力先が一致しません。');
  if (typeof audit.unityVersion !== 'string' || typeof audit.generatedAtUtc !== 'string' || !Number.isFinite(Date.parse(audit.generatedAtUtc))
      || typeof audit.scope !== 'string' || !Array.isArray(audit.checks) || !audit.checks.length || audit.checks.length > 20000) reject('監査JSONの項目が不正です。');
  const counts = {PASS:0,WARN:0,FAIL:0};
  for (const c of audit.checks) {
    if (!c || !Object.hasOwn(counts,c.status) || typeof c.path !== 'string' || !c.path.trim()) reject('監査の判定または対象が不正です。');
    for (const key of ['expected','actual','detail','guid']) if (c[key] != null && typeof c[key] !== 'string') reject('監査の詳細項目が不正です。');
    counts[c.status]++;
  }
  for (const key of ['pass','warn','fail']) if (!Number.isSafeInteger(audit[key]) || audit[key] !== counts[key.toUpperCase()]) reject('監査の集計値が検査項目と一致しません。');
  return audit;
}
