const KEY='kushyameln-media-basic-v1',MAX_RECORDS=100,MAX_BYTES=1048576;
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function createHistory(storage){
  let records=[],evicted=0,dropped=0,failure=null;
  try{const value=JSON.parse(storage?.getItem(KEY)??'null');if(value?.schemaVersion===1&&Array.isArray(value.records)&&value.records.length<=MAX_RECORDS&&bytes(value)<=MAX_BYTES){records=value.records;evicted=value.evicted??0;}}catch{failure='保存済み記録を読み出せません。今回の記録はメモリ内に保持します。';}
  function snapshot(){return {schemaVersion:1,records,evicted,dropped,storageFailure:failure,limits:{records:MAX_RECORDS,bytes:MAX_BYTES},scope:'this browser and origin only; media bytes are not stored'};}
  function append(record){if(bytes({schemaVersion:1,records:[record],evicted})>MAX_BYTES){dropped++;failure='単独の記録が上限を超えたため履歴に追加できません。個別JSONを回収してください。';return snapshot();}records=records.filter(r=>r.operationId!==record.operationId);records.push(record);while(records.length>MAX_RECORDS||bytes({schemaVersion:1,records,evicted})>MAX_BYTES){if(records.length<=1){failure='記録が保存上限を超えました。個別JSONを回収してください。';return snapshot();}records.shift();evicted++;}try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify({schemaVersion:1,records,evicted}));failure=null;}catch{failure='端末への保存に失敗しました。表示中のJSONを回収してください。';}return snapshot();}
  function clear(){records=[];evicted=0;try{storage?.removeItem(KEY);failure=null;}catch{failure='保存済み記録を削除できませんでした。';}return snapshot();}
  return Object.freeze({append,snapshot,clear});
}
