import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNames,createDecodeSmoothBuilder} from '../../docs/decode-smooth-builder/pipeline.mjs';

test('入力の名前を変換せず、順番を保持する',()=>{
  const names=['EyeLidLeft','Custom/EyeLidLeft','Other/Avatar/EyeLidLeft','v2/EyeLidLeft','Custom/ParameterTune'];
  assert.deepEqual(validateNames(names),names);
});
test('不正な行番号を報告し、空白を勝手に除去しない',()=>{
  assert.throws(()=>validateNames(['v2/EyeLidLeft',' v2/EyeLidRight']),/2行目/);
});
test('完全一致する重複を黙って削除しない',()=>{
  assert.throws(()=>validateNames(['v2/EyeLidLeft','v2/EyeLidLeft']),/2行目.*重複/);
  assert.throws(()=>validateNames(['EyeLidLeft','EyeLidLeft']),/2行目.*重複/);
  assert.throws(()=>validateNames(['Custom/EyeLidLeft','Custom/EyeLidLeft']),/2行目.*重複/);
});
test('空行は名前として生成しない',()=>{
  assert.deepEqual(validateNames(['v2/EyeLidLeft','','v2/EyeLidRight','']),['v2/EyeLidLeft','v2/EyeLidRight']);
  assert.throws(()=>validateNames(['','']),/入力/);
});
test('入力版の不正をWorker起動前に拒否する',async()=>{
  const builder=createDecodeSmoothBuilder();
  await assert.rejects(builder.build(['v2/EyeLidLeft'],{inputRevision:-1}),/版/);
  builder.dispose();
});
test('破棄済みの窓口は新規処理を受け付けない',async()=>{
  const builder=createDecodeSmoothBuilder();builder.dispose();
  await assert.rejects(builder.build(['v2/EyeLidLeft']),/終了/);
});
