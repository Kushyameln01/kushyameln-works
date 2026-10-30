const labels=Object.freeze({SOURCE_REGISTERED:'原本を登録しました。',SOURCE_INSPECTED:'原本のヘッダーを確認しました。',PREPARED:'重みを準備しました。',STAGED:'重みをstageしました。',CONSUMER_APPLIED:'consumerへの重み適用が確認されました。',SNAPSHOT_PUBLISHED:'管理snapshotが公開されました。'});

// Presentation only. Generation admission remains owned by the manager/profile;
// a state label is never evidence that its other readiness conditions are met.
export function describeLoraState(record){
 if(!record||!Object.hasOwn(labels,record.state))throw Error('Unknown LoRA state');
 const coverage=record.coverage??null;
 if(coverage!==null&&!['FULL','PARTIAL'].includes(coverage))throw Error('Unknown LoRA coverage');
 if(coverage===null&&['CONSUMER_APPLIED','SNAPSHOT_PUBLISHED'].includes(record.state))throw Error('Explicit validation coverage/scope required for applied or published state');
 if(coverage==='PARTIAL'&&record.state==='SNAPSHOT_PUBLISHED')throw Error('PARTIAL diagnostic cannot publish a generation snapshot');
 return Object.freeze({state:record.state,coverage,completeAdapter:coverage==='FULL',generationReady:false,generationReadiness:'manager-owned',label:(coverage==='PARTIAL'?'部分診断: ':'')+labels[record.state]});
}

export function assertV1PanelConnection(connection){
 if(connection===null)return connection;
 if(!connection||connection.apiVersion!==undefined&&connection.apiVersion!==1||connection.contractVersion!==undefined&&connection.contractVersion!==1||connection.consumerContractVersion!==undefined&&connection.consumerContractVersion!==1)throw Error('LoRA v1 panel requires a v1 consumer contract');
 if(connection.stagingOnly===true||connection.stageOnly===true||connection.applicationMode==='staging'||connection.state==='STAGED')throw Error('LoRA v1 panel cannot connect a staging-only consumer');
 return connection;
}
