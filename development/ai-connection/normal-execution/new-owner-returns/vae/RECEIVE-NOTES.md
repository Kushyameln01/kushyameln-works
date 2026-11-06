# VAE/Text normal owner source受領

配布 `498eb25f027666e3cc661a5851288e4aabf39f0a` をGit fetchし、公開38ファイルをworkへ保存した。230/230検査PASS。EVIDENCE-INDEXの32項目は全bytes/SHA-256一致。production closure16ファイルは配布498、元NN実行b2541fd、monitor-only94e1d5fの各実Gitと一致する。APIはconnectorの固定ref/base64取得ともbyte一致する。ここで行ったNN・Worker・数値比較・asset/model取得・oracle生成・exportはいずれも0。

実行sourceは `b2541fd2e3b7edcecd810f5215b1bd9f86afc0f4`、監視修正だけの実確認は `94e1d5f2a28880a514bdec53059342a03e04a83f`。配布498へ旧実行を付け替えない。API版works-ai-1、文書revision OWNER-CAPABILITIES-1。client/workerの内部envelope buildはworks-inference-v1で維持され、public namespaceのBUILD_ID exportではない。ORT/Hike/vendorはowner基点5b0から不変。16項目のinventoryとSHAはSOURCE-INVENTORY.jsonにある。

通常のnative APIは `createInferenceAPI().vae` または `createVaeModule()` → `configure({manifest,files,diagnostics:false})` → `capabilities({operation,input})` → `encode(tensor)` / `decode(tensor)`。capabilitiesはWorkerなしで構成済み完全shape・local asset存在/容量とsupport.supported/code/reason/requiredChanges/scopeを返す。runtime[operation].verifiedは成功した実行のasset hash/shape観測であり、configure時にはfalse。対応の宣言、実行成功、独立数値PASSを分ける。

管理のnormal hostへは別のVAE owner facadeが必要。既存text-vae.mjsのdirect adapterはcapabilities(q.input)を呼べるが、normal hostが必要とするobserve/querySupport/invoke/afterTerminal/release/recoverとcapabilityRef/consumerPort/registryを提供しない。管理shape導出を追加せず、operationId→native operation、tensor.axes.join('')→layout、tensor.nativeMeaning→meaning、native.metadataのmodel/mask/context/latentContract/normalizationを保ち、ownerの実capabilitiesと理由を使う。通常要求には独立reference/gate/PASS/E4を追加しない。構成変更・取消・元Promise終端・所有権のwrapper境界は管理側で接続する。

取得ACKだけにはassets不要。実encodeにはmanifest.assets.encoder.file、実decodeにはdecoderBody.file/conv2Weight.file/conv2Bias.fileの対応bytesが必要。runtimeのMapはfileName→File/Blob/Uint8Array、parsed manifestと全asset hash/実graphは一組。元safetensorsはruntime不要。対応manifest/hashを持つ既存非公開bundleは再利用できる。新download/exportや全assetの提出を今回要求しない。今回の新実行はRect RGB[1,3,1,16,32]⇔mean[1,16,1,2,4]とText plain一件で、81frame/元媒体/実generated sampleへ広げない。

VAE通常出力は `{tensor,inputDescriptor,binding}`。inputDescriptorはdataなしのowned snapshotとして元mean/sampleのproducer/decoder/restored/contextを保持し、bindingは成功したasset hashes/input/output shapes/graphMetadataCheckedを保持する。保存する場合はRGBと外側inputDescriptorを結び、strict native contextへsnapshot/owner/traceを混ぜない。Textは `{tensor,attentionMask,inputMode}`、plain L512/ID実Lを維持する。

codec候補 `docs/shared/inference/tensor.mjs` は9104 B、SHA-256 `e200fef69be3909a13bc91a59743681df1072817eadc7c1865717afe0c3c9f8e`。Textのumt5-final-rmsnorm-f32-v1 marker保存と共通descriptor validator/describeTensorが追加された。WKTSR001/schemaVersion1、旧markerなし読取り、既存latent/context/decoder/producer保存は維持する。管理採用2bd codecを差し替えず、別候補として扱う。own codec実行/再保存はしていない。

歴史上のowner数値合格・resources・cancel/recoveryは送付側報告として保持し、受領者による再実行とは呼ばない。生aggregate rawHarnessPassed:falseと終了後PID sampler error3件を保持し、NN0/Worker0の監視修正確認と分ける。source取得ACKはtrue、管理normal VAE facade採用・実adapter受入・新codec採用はこの受領時点でfalse。generationReady:false。

再確認:

```sh
python3 work/ai-connection/normal-r12/new-owner-receipts/vae/verify-receipt.py --repo /workspace/kushyameln-works --output /workspace/work/ai-connection/normal-r12/new-owner-receipts/vae
```
