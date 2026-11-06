from pathlib import Path
import argparse,ast,json,hashlib,re,subprocess
parser=argparse.ArgumentParser(description='Rebuild the public workflow handoff from six public sources and a fixed repository inventory; no network, media or inference execution.')
parser.add_argument('--repo',type=Path,required=True,help='Path to kushyameln-works Git repository containing the assigned baseline commit.')
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent,help='Public packet directory containing source/; outputs are written here.')
args=parser.parse_args()
root=args.root.resolve()
repo=args.repo.resolve()
root.mkdir(parents=True,exist_ok=True)
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def readj(p):return json.loads(p.read_text())
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
workflow_path=root/'source/bernini_rv2v_basic.ca69274.original.json'
workflow=readj(workflow_path)
inventory_bytes=subprocess.check_output(['git','show','5aa5a806f84a875c542b2922fe80ef6faafc7915:development/diffusion-models/model-inventory/inventory.json'],cwd=repo)
inventory=json.loads(inventory_bytes)
prior=inventory['workflow']
def project(n):
 return {k:n.get(k) for k in ['id','type','title','mode','widgets_values']}|{'inputs':[{k:i.get(k) for k in ['name','type','link']} for i in n.get('inputs',[])],'outputs':[{k:i.get(k) for k in ['name','type','links']} for i in n.get('outputs',[])]}
assert sha(workflow_path.read_bytes())==prior['entry_sha256']
assert [project(n) for n in workflow['nodes']]==prior['nodes']
assert workflow['links']==prior['links']
byid={n['id']:n for n in workflow['nodes']}
node=byid[5];load=byid[21];out=byid[22]
widgets=node['widgets_values']
editor=json.loads(widgets[13])
commit='ca69274a2d2135052489bc0c67a2d79a64225e86'
upbase='https://github.com/CCpt5/ComfyUI-BerniniStudio/blob/'+commit+'/'
expected={'bernini_studio.ca69274.py':'1cf428deb1d5adbfbc2ffe22539de864c9b3e629','bernini_studio.ca69274.js':'3d1ad9547760d798ec133d68f91439516e880a42','bernini_rv2v_basic.ca69274.original.json':'8e2ad1bb71a29bd8d1c4b3d114aa29c810b643e8'}
up_paths={'bernini_studio.ca69274.py':'bernini_studio.py','bernini_studio.ca69274.js':'js/bernini_studio.js','bernini_rv2v_basic.ca69274.original.json':'example_workflows/bernini_rv2v_basic.json'}
p6_expected={'vae-p6.f76.SOURCE-SLOT-SHAPES.md': '5d8e6ad2a1fc3fd30e44fe279f052d99edf4053e', 'vae-p6.f76.requirements.json': 'ae7614365ff578dd80287246cda66c3681534e3a'}
receipts=[]
for p in sorted((root/'source').iterdir()):
 b=p.read_bytes();r={'path':str(p.relative_to(root)),'bytes':len(b),'sha256':sha(b)}
 if p.name in expected:
  assert blob(b)==expected[p.name]
  r.update(repository='CCpt5/ComfyUI-BerniniStudio',commit=commit,repositoryPath=up_paths[p.name],url=upbase+up_paths[p.name],gitBlobSha=blob(b),gitBlobVerified=True,acquisition='GitHub connector pinned UTF-8 source; full bytes saved and independent Git blob verification')
 elif p.name.startswith('vae-p6.f76.'):
  original=p.name.removeprefix('vae-p6.f76.')
  rp='development/inference/p2-p3-acceptance/p6/'+original
  git_blob=p6_expected[p.name]
  assert blob(b)==git_blob
  r.update(repository='Kushyameln01/kushyameln-works',commit='f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48',repositoryPath=rp,gitBlobSha=git_blob,gitBlobVerified=True,acquisition='Existing local Git object via git show; no checkout/native changes')
 elif p.name=='upstream-tree.ca69274.json':r.update(acquisition='GitHub connector recursive pinned tree metadata; truncated false; inputs absent from tree, screenshots excluded')
 else:raise ValueError('Source outside the six-file public allowlist: '+p.name)
 receipts.append(r)
receipt={
 'schemaVersion':'works-original-workflow-acquisition/0.1-draft.1',
 'recordDateJst':'2026-11-02',
 'publicationEdition':'PUBLIC_MINIMIZED_DRAFT_NOT_SENT',
 'scope':'Read-only workflow/source/metadata acquisition. No model/media download, resize, profile export, inference, commit, push or external message.',
 'repositoryHeadAtAssignment':'5aa5a806f84a875c542b2922fe80ef6faafc7915',
 'workflowIdentity':{'retrievedCompleteJson':True,'bytes':len(workflow_path.read_bytes()),'sha256':sha(workflow_path.read_bytes()),'matchesRetainedSuppliedArchiveEntry':True,'retainedArchiveSha256Reported':prior['archive_sha256'],'archiveBytesReacquired':False,'nodeCount':len(workflow['nodes']),'linkCount':len(workflow['links']),'allProjectedNodesAndLinksMatchRetainedInventory':True,'actualUserRuntimeAuthenticated':False,'actualMediaAuthenticated':False},
 'nodeSourceIdentity':{'pinnedVersion':'BerniniStudio v2.3','sourceAcquired':True,'actualUserRuntimeVersionAuthenticated':False,'basis':'Existing VAE PROFILES and P6 source pins identify this source; workflow byte equality does not prove live ComfyUI/custom-node/VHS revisions.'},
 'retainedInventoryEvidence':{'commit':'5aa5a806f84a875c542b2922fe80ef6faafc7915','repositoryPath':'development/diffusion-models/model-inventory/inventory.json','bytes':len(inventory_bytes),'sha256':sha(inventory_bytes),'gitBlobSha':blob(inventory_bytes),'purpose':'Recorded original ZIP and entry hashes, all workflow node/link projection. This recorded archive hash is not a new archive-byte acquisition.'},
 'sourceFiles':receipts,
 'pageAcquisitions':[
  {'pageId':'page_65b303c9bc708191a7e48c78b51c35a7','selectors':['source_id','workflow','slot','ワークフロー'],'coverage':'bounded selected excerpts; only citation metadata is included in this public packet','bodyPublished':False,'bodyRetention':'NOT_PUBLISHED_RETAINED_OUTSIDE_REPOSITORY','selectedReadBundleSha256':'20047112c0e6e92d4e55d9220c0026fd320e544da6291deee64dccaac757901c','attachmentReferencesReturned':False},
  {'pageId':'page_78c30bebe16481918944e621b8c2a02a','selectors':['P6','元workflow','slot','実媒体'],'coverage':'bounded selected excerpts; only citation metadata is included in this public packet','bodyPublished':False,'bodyRetention':'NOT_PUBLISHED_RETAINED_OUTSIDE_REPOSITORY','selectedReadBundleSha256':'20047112c0e6e92d4e55d9220c0026fd320e544da6291deee64dccaac757901c','attachmentReferencesReturned':False}
 ],
 'boundedConnectedStorageSearch':{'provider':'Google Drive metadata-only; no file fetch','queries':['132123.mp4 exact name','videoframe_80.png exact image name','Ed Sheeran / name contains 00108-','example_workflows or ComfyUI-BerniniStudio name','132123 broad','videoframe_80 broad','Bernini broad'],'returnedMatches':0,'conclusion':'No matching source/media metadata returned in these bounded accessible searches; not proof that files do not exist elsewhere.'},
}
dump(root/'SOURCE-ACQUISITION.json',receipt)
unknown_media={'mediaSha256':None,'mediaAvailable':False,'decodedFrameCount':None,'decodedWidth':None,'decodedHeight':None,'orientationAppliedWidth':None,'orientationAppliedHeight':None,'rotation':None,'colorSpace':None,'alpha':None,'sourceFrameIndices':None,'sourceFrameTimesSeconds':None,'observedProcessedRgbNCTHW':None,'observedLatentNCTHW':None,'unknownReason':'Actual media bytes and runtime supply/probe metadata are not acquired. Filename/grid/link is not supply, shape, orientation or timestamp evidence.'}
slots=[]
for i in range(8):
 inp=next(x for x in node['inputs'] if x['name']=='image'+str(i))
 l=next((x for x in workflow['links'] if x[0]==inp.get('link')),None)
 origin=byid[l[1]] if l else None
 wired={'linkId':inp.get('link'),'nodeId':origin['id'] if origin else None,'serializedMode':origin.get('mode') if origin else None,'declaredFilename':origin.get('widgets_values',[None])[0] if origin else None,'runtimeSupplied':None if origin else False}
 editor_file=editor[i] if i<len(editor) else None
 slots.append({'originalSlotIndex':i,'role':'reference_image_or_editor_slot_context_encode','wiredCandidate':wired,'editorCandidate':{'declaredFilename':editor_file,'actualFileAvailable':False if editor_file else None},'selectionRule':'Use wired tensor when non-null; otherwise load truthy editor filename. Append only successfully supplied slots, preserving original slot identity separately from compacted reference index.','runtimeSelection':None if (origin or editor_file) else 'ABSENT_IN_SERIALIZED_WORKFLOW','compactedReferenceIndex':None,'contextsPerSuppliedWiredSlot':'one per batch frame, in frame order','framesPerEncodedContext':1,'editorLoaderFramesPerFile':1,'preprocessingRule':'original-long-edge-848','actual':dict(unknown_media) if (origin or editor_file) else None,'blockingReason':'Runtime wire/mode resolution and actual selected image metadata are required.' if (origin or editor_file) else None,'sourceEvidence':{'workflowNode':5,'workflowPort':'image'+str(i),'pythonLines':[648,674]}})
handoff={
 'schemaVersion':'works-workflow-media-vae-handoff/0.1-draft.1',
 'status':'SOURCE_RULES_AND_SERIALIZED_SLOTS_ACQUIRED_ACTUAL_MEDIA_UNKNOWN',
 'publicationEdition':'PUBLIC_MINIMIZED_DRAFT_NOT_SENT',
 'recordDateJst':'2026-11-02','recipientRole':'VAE / TextEncoder owner; delivery by management after publication','deliveryStatus':'DRAFT_NOT_SENT',
 'workflowSource':{'path':'source/bernini_rv2v_basic.ca69274.original.json','sha256':sha(workflow_path.read_bytes()),'originalSuppliedWorkflowByteMatch':True,'sourceReceipt':'SOURCE-ACQUISITION.json'},
 'procedureAcquisition':{'originalWorkflowJson':'ACQUIRED_BYTE_IDENTICAL_TO_RETAINED_SUPPLIED_ENTRY','pinnedBerniniNodeAndEditorSource':'ACQUIRED','actualUserComfyUIBerniniVhsRuntime':'NOT_ACQUIRED','actualSourceAndSlots':'NOT_ACQUIRED','executionFeasibility':'Only exact-media-dependent processing/profile/decode remains blocked; metadata/rule/slot handoff can proceed.'},
 'workflowConfiguredGrid':{'width':widgets[0],'height':widgets[1],'requestedOutputFrames':widgets[2],'batchSize':widgets[3],'taskType':widgets[4],'refMaxSize':widgets[8],'notObservedMediaDimensionsOrFrameSupply':True,'candidateRgbNCTHW':[1,3,81,480,832],'candidateLatentNCTHW':[1,16,21,60,104],'candidateOnly':True},
 'encodeSupplyOrder':{'rule':'source_video if supplied, then reference_video if supplied, then successfully supplied original slots 0..7, each frame of each slot in original order','sourceVideoContextsPerSuppliedVideo':1,'referenceVideoContextsPerSuppliedVideo':1,'slotFramesPerEncodedContext':1,'observedContextCount':None,'observedContextOrder':None,'missingSlotCompaction':True,'preserveOriginalSlotIdentity':True,'sourceIdPolicy':'This is ordered context supply only. Do not use management slot/stream indices as Diffusion RoPE source_id; actual core mapping is a separate owner contract.','bothConditioningBranchesShareSameOrderedContexts':True,'sourceEvidence':{'pythonLines':[630,688]}},
 'preprocessingRules':{
  'source-video-grid':{'operations':['take source_video[:length, :, :, :3]','move channels to NCHW','common_upscale(width=832,height=480,interpolation=area,crop=center)','move channels back; keep RGB'], 'configuredOutputHeight':480,'configuredOutputWidth':832,'actualOutputFrames':None,'actualProcessedShape':None,'frameCountRule':'slice preserves only available frames; no repetition or padding is added by this source','sourceEvidence':{'pythonLines':[634,641]}},
  'original-long-edge-848':{'scale':'min(848 / max(h,w), 1.0)','height':'max(16, Python round(h * scale / 16) * 16)','width':'max(16, Python round(w * scale / 16) * 16)','rounding':'Python ties-to-even','interpolation':'area','crop':'disabled','channelSelection':'RGB first three channels','fixed848Square':False,'actualHeight':None,'actualWidth':None,'sourceEvidence':{'pythonLines':[379,388]}},
  'editor-loader':{'operations':['resolve safe filename in original ComfyUI input directory','PIL Image.open','ImageOps.exif_transpose','convert RGB','numpy float32 / 255','prepend one frame dimension'], 'loaderOutputLayout':'[1,H,W,3]','loaderOutputRange':[0,1],'sourceEvidence':{'pythonLines':[391,430]}},
  'pixelReproductionStatus':'Parameters/formula are source-confirmed; exact processed dimensions and pixels are unobserved. Original runtime/common_upscale/PIL/VHS versions are unconfirmed. Do not replace area/center/Python round with Canvas defaults or JavaScript Math.round without comparison.'
 },
 'sourceVideo':{'role':'source_video_context_encode','declaredFilename':load['widgets_values']['video'],'workflowNodeId':21,'linkId':29,'consumerNodeId':5,'consumerPort':'source_video','loaderSettings':{k:v for k,v in load['widgets_values'].items() if k!='videopreview'},'preprocessingRule':'source-video-grid','actual':dict(unknown_media),'configuredPostprocessHeight':480,'configuredPostprocessWidth':832,'configuredPostprocessDimensionsConditionalOnValidSupply':True,'postprocessFrameCount':None,'postprocessFrameRule':'min(actual supplied tensor F,81), if a valid source tensor is supplied','profileReadiness':'BLOCKED_ACTUAL_MEDIA_AND_EXACT_SHAPE'},
 'referenceVideo':{'role':'reference_video_context_encode','connectedInSerializedWorkflow':False,'consumerPort':'reference_video','preprocessingRule':'first length frames then original-long-edge-848','actual':None,'readiness':'NOT_APPLICABLE_TO_SERIALIZED_WORKFLOW','blockingOtherRoles':False,'ifLaterConnectedRequires':'actual identity, F/H/W, frame/time arrays and resulting exact shape; no source-grid substitution'},
 'slots':slots,
 'finalDecode':{'workflowPath':[{'nodeId':16,'port':'output'},{'nodeId':17,'port':'samples'},{'nodeId':22,'port':'images'}],'outputEncodeSettings':{k:v for k,v in out['widgets_values'].items() if k!='videopreview'},'configuredLatentCandidateNCTHW':[1,16,21,60,104],'configuredRgbCandidateNCTHW':[1,3,81,480,832],'actualGeneratedSampleShape':None,'actualGeneratedSampleSha256':None,'producerModelSha256s':None,'decoderVaeModelSha256':'2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b','nativeMeaningRequired':'wan21-raw-generated-sample:v1','rawRestoration':{'owner':'diffusion_models','id':'wan21-comfy-f32-v1','stateRequiredAtVaeInput':'restored','numericalReceipt':None,'metadataDeclarationAloneSufficient':False},'readiness':'BLOCKED_P5_ACTUAL_PRODUCER_RESTORATION_AND_MATCHING_PROFILE','reuseRectMeanAsGeneratedSample':False},
 'vaeOwnerNextActions':[
  'Consume the fixed workflow/node/editor sources and this role/slot inventory; preserve exact role-specific rules.',
  'For source and candidate slots, obtain original media identity and actual runtime supply metadata before choosing exact profiles. Do not require unconnected reference_video.',
  'Record pre/postprocessing exact F/H/W, original input/slot/frame/time mapping, selected wired/editor origin and payload hashes.',
  'Compare those exact shapes to accepted profiles; add only missing shapes in a separate owner export/reference/WASM acceptance stage.',
  'For final generated decode, wait only for actual P5 producer/restoration plus matching exact profile/reference/gate/resources. Keep independent metadata and accepted diagnostic work available.'
 ],
 'preservationContract':{'nativeTensorMetadata':'Copy without relabeling; strict native context/latentContract gain no management-only fields. Keep management role/supply details externally.','producers':'Preserve every producerModelSha256s identity in its original order; decoder VAE hash is separate.','text':'Preserve selected manifest, Tokenizer identity/config, masks, staged route and payload; do not collapse masks or mix Tokenizer hashes with model hashes.','frames':'Preserve sourceFrameIndices and optional same-length sourceFrameTimesSeconds arrays, order and duplicates per context; do not scalarize, sort, deduplicate, invent timestamps, or truncate arrays to latent T.','unknownOptionalMetadata':'Retain opaquely in original response/common extensions; unknown required semantics block only dependent edges.','rawMeanAndGeneratedSample':'Keep distinct native meanings/normalization and independent acceptance scopes.'},
 'dependentBlocks':[
  {'id':'MEDIA_SOURCE','missing':['source original identity','actual decoded/orientation/corrected F/H/W','actual frame selection and timestamps'],'blockedStages':['source exact processed tensor observation','source exactshape profile choice/export/acceptance'],'unblocked':['source preprocessing contract inventory','P2/P3 existing bounded diagnostic work','Text contract preservation']},
  {'id':'MEDIA_SLOTS_0_1_2','missing':['runtime mode4 wire resolution','selected wired/editor origin','selected media identity and orientation-corrected H/W','wired batch frame count/order'],'blockedStages':['exact context list','selected slot processed dimensions','selected slot exactshape profile choice/acceptance'],'unblocked':['literal 0..7 slot map and precedence/order rules','absence record for empty slots 3..7','reference_video unconnected status']},
  {'id':'RUNTIME_PIXEL_REPRODUCTION','missing':['actual ComfyUI/VHS/Bernini/PIL/runtime revisions'],'blockedStages':['claim of exact source runtime pixel reproduction'],'unblocked':['fixed source formula/parameter/byte inventory']},
  {'id':'P5_FINAL_SAMPLE','missing':['real generated payload/shape/producer hashes','Diffusion numerical raw restoration receipt','matching VAE profile/reference/gate/resources'],'blockedStages':['actual final generated-sample decode acceptance'],'unblocked':['configured final-grid requirement','all independent shape/source/slot inventory']}
 ],
 'operationsPerformed':{'mediaDownload':False,'mediaProbe':False,'resizeOrFrameSelectionExecution':False,'modelDownload':False,'profileExport':False,'neuralInference':False,'publicPageWrite':False,'externalOwnerMessage':False},
 'generationReady':False
}
dump(root/'VAE-WORKFLOW-HANDOFF.json',handoff)

# Static identity and document checks only. The acquired Python source is parsed,
# never imported or executed. The builder has no network or native execution path.
assert len(receipts)==6
for entry in receipts:
 b=(root/entry['path']).read_bytes()
 assert len(b)==entry['bytes'] and sha(b)==entry['sha256']
 if entry.get('gitBlobSha'):assert blob(b)==entry['gitBlobSha']
assert handoff['sourceVideo']['postprocessFrameCount'] is None
assert handoff['sourceVideo']['actual']['observedProcessedRgbNCTHW'] is None
assert handoff['encodeSupplyOrder']['observedContextOrder'] is None
assert handoff['encodeSupplyOrder']['observedContextCount'] is None
assert handoff['referenceVideo']['blockingOtherRoles'] is False
assert [s['originalSlotIndex'] for s in slots if s['runtimeSelection']=='ABSENT_IN_SERIALIZED_WORKFLOW']==[3,4,5,6,7]
for slot in slots[:3]:
 assert slot['actual']['sourceFrameIndices'] is None
 assert slot['actual']['sourceFrameTimesSeconds'] is None
 assert slot['actual']['observedProcessedRgbNCTHW'] is None
assert handoff['finalDecode']['producerModelSha256s'] is None
assert handoff['finalDecode']['actualGeneratedSampleShape'] is None
assert handoff['generationReady'] is False
assert all(value is False for value in handoff['operationsPerformed'].values())
assert 'uploadedContextReads' not in receipt
assert all(not entry['bodyPublished'] for entry in receipt['pageAcquisitions'])
assert all('source/acquired-page-excerpts.json' not in str(entry) for entry in receipt['pageAcquisitions'])
assert not (root/'source/acquired-page-excerpts.json').exists()
tree=ast.parse((root/'source/bernini_studio.ca69274.py').read_text())
helper=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='_resize_long_edge')
call=next(node for node in ast.walk(helper) if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='common_upscale')
assert [ast.literal_eval(node) for node in call.args[-2:]]==['area','disabled']
links=[]
for name in ['VAE-WORKFLOW-HANDOFF.md','README.md']:
 for href in re.findall(r'\]\(([^)]+)\)',(root/name).read_text()):
  if '://' not in href:
   if href not in ['VALIDATION.json','SHA256SUMS']:
    assert (root/href).is_file(),(name,href)
   links.append(href)
artifacts=[]
for path in sorted(root.rglob('*')):
 if path.is_file() and path.name not in ['VALIDATION.json','SHA256SUMS']:
  body=path.read_bytes()
  artifacts.append({'path':str(path.relative_to(root)),'bytes':len(body),'sha256':sha(body)})
validation={
 'status':'PASS','edition':'PUBLIC_MINIMIZED_DRAFT_NOT_SENT',
 'scope':'Static source identity and document consistency; no media/model/resize/export/inference.',
 'sourceHashEntriesChecked':len(receipts),'gitBlobChecks':sum('gitBlobSha' in entry for entry in receipts),
 'originalWorkflowNodeCount':len(workflow['nodes']),'originalWorkflowLinkCount':len(workflow['links']),
 'allRetainedNodeAndLinksComparison':'PASS','literalSlotCount':len(slots),
 'unknownMediaFieldsRetained':True,'unconnectedReferenceNotBlocking':True,
 'sourceFormulaAstCheck':'area/disabled exact','relativeDocumentLinksChecked':len(links),
 'sourcePythonExecuted':False,'pageBodiesPublished':False,'uploadedContextMetadataPublished':False,
 'privateEvidenceRequiredForRebuild':False,'repositoryMutationPerformed':False,
 'files':artifacts
}
dump(root/'VALIDATION.json',validation)
checksum_paths=sorted(path for path in root.rglob('*') if path.is_file() and path.name!='SHA256SUMS')
(root/'SHA256SUMS').write_text(''.join(sha(path.read_bytes())+'  '+str(path.relative_to(root))+'\n' for path in checksum_paths))
print(json.dumps({key:value for key,value in validation.items() if key!='files'},ensure_ascii=False,indent=2))
