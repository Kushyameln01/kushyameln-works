// Presentation derived from the existing application state; never grants generation permission.
export function taskGuide(state, plan) {
  const view = state.view;
  const current = state.loaded && !state.viewStale && !!view;
  const configured = !!plan.outputs.length && plan.outputs.every(o =>
    state.catalog?.controllers?.some(c => c.id === o.base.controllerId));
  const ready = current && view.ready;
  const generated = ready && state.urls.length > 0;
  const missingHashes = state.loaded && JSON.stringify([...plan.inputHashes].sort()) !==
    JSON.stringify(state.inputs.map(i => i.hash).sort());
  const errors = current ? (view.issues ?? []).filter(i => i.severity === 'error') : [];
  const pending = current ? (view.rows ?? []).filter(r => !r.fixed && !r.conflict &&
    (r.registered == null || r.unresolved || r.registered === true && !['Float','Int','Bool'].includes(r.type))).length : 0;
  const preserved = current ? new Set((view.preservedReferences ?? []).map(r => r.targetId)).size : 0;
  const steps = [
    {id:'inputs', status:state.busy === 'load' ? '読込み中' : state.loaded ? `${state.inputs.length}ファイル読込み済み` : state.files.length ? '再読込みが必要' : '未読込み'},
    {id:'composition', status:!state.loaded ? '素材待ち' : configured ? 'ベース選択済み' : 'ベースを選択'},
    {id:'parameters', status:state.busy === 'analyze' ? '解析中' : !state.loaded ? '素材待ち' : !configured ? '構成待ち' : !current ? '再解析が必要' : ready ? '静的検査済み' : '要確認'},
    {id:'export', status:state.busy === 'generate' ? '生成中' : generated ? '生成済み' : ready ? '生成可能' : '設定の確認待ち'}
  ];
  const result = {steps, next:'inputs', label:'素材の読込みへ', title:'素材のUnitypackageを選んで始めます。',
    note:'生成後はUnityへImportし、Installerを配置します。',
    analyzeDisabled:!state.loaded || !!state.busy || !!state.unsupported,
    saveDisabled:!state.loaded || !!state.busy || !!state.unsupported,
    cancelDisabled:!state.busy, progress:!!state.busy};
  if (preserved) result.note = `外部参照 ${preserved}件。導入先に同じGUID・fileIDのAssetが必要です。`;
  if (state.unsupported) return {...result, next:'error', label:'利用できない理由を見る', title:'このブラウザでは処理を開始できません。'};
  if (state.busy) return {...result, next:state.busy === 'load' || state.busy === 'catalog' ? 'inputs' : state.busy === 'generate' ? 'export' : 'parameters',
    label:'処理中の工程を見る', title:state.busy === 'generate' ? 'Unitypackageを生成しています。' : state.busy === 'load' || state.busy === 'catalog' ? '素材を確認しています。' : '現在の設定を解析しています。'};
  if (state.lastError) return {...result, next:'error', label:'エラーと対処を確認する', title:'処理を完了できませんでした。'};
  if (!state.loaded) return state.files.length ? {...result, next:'inputs', label:'素材を再読み込みする場所へ', title:'素材を再読み込みして作業を再開してください。'} : result;
  if (missingHashes) return {...result, next:'rebind', label:'復元した構成と素材を確認する', title:'保存した構成と、現在の素材が一致していません。'};
  if (!state.catalog?.controllers?.length) return {...result, next:'inputs', label:'Controllerを含む素材を追加する', title:'合成のベースとなるControllerが必要です。'};
  if (!configured) return {...result, next:'composition', label:'ベースControllerを選ぶ', title:'各出力のベースを選び、必要なLayerを追加します。'};
  if (!current) return {...result, next:'parameters', label:'解析結果を確認する', title:'設定が変わりました。再解析後に確認してください。'};
  if (!ready) {
    const dependencies = (view.dependencyDiagnostics ?? []).length;
    if (dependencies) return {...result, next:'dependencies', label:'不足・競合している素材を確認する', title:`依存素材に要確認 ${dependencies}箇所があります。`};
    if (pending) return {...result, next:'registration-controls', label:'未設定の登録項目を確認する', title:`外部登録が未設定のParameterが ${pending}件あります。`};
    return {...result, next:errors.length ? 'issues' : 'parameters', label:'要確認項目を確認する', title:errors.length ? `生成前に解消する項目が ${errors.length}件あります。` : '構成と登録設定を確認してください。'};
  }
  if (generated) return {...result, next:'results', label:'生成物を保存・導入する', title:'生成が完了しました。Unitypackageを保存できます。', note:preserved ? result.note : 'Unity・MA・VRChatでの実動作は別途確認してください。'};
  return {...result, next:'export', label:'導入方法を確認して生成する', title:'静的検査が完了し、生成できる状態です。'};
}
