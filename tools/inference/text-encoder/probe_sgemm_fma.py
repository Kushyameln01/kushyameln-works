#!/usr/bin/env python3
"""One existing block19 inference with a private Text-only F32 FMA runtime.

No original-source inference/export or full24 run. Original graph, inputs, Hike
norm and historic baseline are pinned; restored checkpoint bytes bridge the
different checkpoint execution commits without rewriting historical receipts.
"""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'vae'))
from diagnose_block import BLOCK19_PINS as PINS, BLOCK_OPTIONS_CREATION as OPTIONS, TRACE_NODE_CODE, record, stream_record, committed
from wasm_sgemm_fma import inspect_selected_runtime, verify_splice, code_bodies, sha
from process_lifecycle import ProcessOwnership, cleanup_complete

MODEL = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
ORACLE = '5954d48e0fb6df1d6977964fd8a7ba2a242b6eff'


def select_reference(bundle, reference, historical):
    bundle, reference, historical = Path(bundle), Path(reference), Path(historical)
    manifest_record = record(bundle / 'manifest.json')
    manifest = json.loads((bundle / 'manifest.json').read_text())
    source = json.loads((reference / 'trace-source-results.json').read_text())
    old = json.loads(historical.read_text())
    if manifest_record['sha256'] != PINS['manifestSha256'] or manifest.get('modelSha256') != MODEL:
        raise ValueError('Original selected manifest/model changed')
    if not all(source.get(key) is True for key in ['passed', 'allLayerDigestsMatchOriginalOracle', 'sourceFinalMatchesOriginalOracle']) or source.get('originalOracleExecutionSha') != ORACLE:
        raise ValueError('Restored source must reproduce the original oracle exactly')
    inp = source['input']
    if inp.get('id') != 'id-l512-all-active' or inp.get('shape') != [1,512,4096] or inp.get('attentionMask') != [1]*512 or len(inp.get('tokenIds', [])) != 512 or inp.get('manifestSha256') != PINS['manifestSha256']:
        raise ValueError('Selected legal all-active512 input changed')
    if source.get('selectedNormRows') != [0,1,255,511] or source.get('manifest', {}).get('sha256') != PINS['manifestSha256']:
        raise ValueError('Source normalization row/model binding changed')
    if not old.get('passed') or not old.get('preservedCanaryReproducedBitwise') or old.get('finalFixedGatePassed') is not False or old.get('originalOracleExecutionSha') != ORACLE or old.get('input') != inp or old.get('manifest', {}).get('sha256') != PINS['manifestSha256'] or old.get('native', {}).get('options') != OPTIONS:
        raise ValueError('Original historical baseline identity changed')
    if len(source.get('layers', [])) != 24 or len(old['native'].get('layers', [])) != 24:
        raise ValueError('Complete original source/native trace required')
    for index, expected in [(18, PINS['inputSha256']), (19, PINS['sourceSha256'])]:
        item = source['layers'][index]
        if item.get('index') != index or item.get('hiddenSha256') != expected or item.get('matchesOriginalOracle') is not True:
            raise ValueError('Restored source layer hash mismatch')
    layer = old['native']['layers'][19]
    if layer.get('index') != 19 or layer.get('graphSha256') != PINS['graphSha256'] or layer.get('input', {}).get('sourceSha256') != PINS['inputSha256'] or layer.get('output', {}).get('sourceSha256') != PINS['sourceSha256'] or layer.get('output', {}).get('localSha256') != PINS['allLocalSha256']:
        raise ValueError('Historical block19 graph/input/output hash mismatch')
    block = manifest['blocks'][19]
    if len(manifest['blocks']) != 24 or block != {**block, 'index': 19, 'path': 'block-19.onnx', 'bytes': PINS['graphBytes'], 'sha256': PINS['graphSha256']} or block.get('attentionLowering') is not None:
        raise ValueError('Only the original unchanged block19 graph is allowed')
    graph = {'path': str(bundle / block['path']), 'bytes': block['bytes'], 'sha256': block['sha256']}
    if Path(graph['path']).stat().st_size != graph['bytes']:
        raise ValueError('Selected graph size mismatch')
    if manifest['finalNorm']['sha256'] != PINS['normSha256'] or manifest['finalNorm']['epsilon'] != 1e-6:
        raise ValueError('Original final RMSNorm binding changed')
    checkpoints = {}
    for name, size_key, hash_key in [('source-hidden-18.f32','tensorBytes','inputSha256'), ('source-hidden-19.f32','sourceBytes','sourceSha256'), ('final-norm.f32','normBytes','normSha256'), ('source-norm-rows-19.f32','rowsBytes','rowsSha256')]:
        actual = stream_record(reference / name)
        declared = source['files'][name]
        if (actual['bytes'],actual['sha256']) != (PINS[size_key],PINS[hash_key]) or (declared['bytes'],declared['sha256']) != (actual['bytes'],actual['sha256']):
            raise ValueError('Restored checkpoint bytes/hash changed: ' + name)
        checkpoints[name] = actual
    return {'layerIndex': 19, 'input': inp, 'graph': graph, 'manifest': manifest_record, 'checkpoints': checkpoints,
            'historicalLocal': {'raw': layer['raw']['local'], 'weightedNorm': layer['weightedNorm']['local']},
            'historicalTrace': record(historical), 'restoredSourceTrace': record(reference / 'trace-source-results.json'),
            'sourceBridge': {'historicalCheckpointExecutionSha': old['sourceCheckpointExecutionSha'], 'restoredCheckpointExecutionSha': source['executionSourceSha'],
                             'sameExecutionSource': old['sourceCheckpointExecutionSha'] == source['executionSourceSha'], 'selectedTensorBytesMatch': True,
                             'originalOracleExecutionSha': ORACLE, 'method': 'Original manifest, S18, S19, norm weight and selected norm-row bytes/hash equality; historical receipt unchanged'},
            'creationOptions': OPTIONS, 'maximumModelRuns': 1, 'full24Acceptance': False}


NODE = TRACE_NODE_CODE.split("check(c.manifest?.blocks?.length===24",1)[0] + r'''
const report={passed:false,scope:'One existing block19, sourceS18, private F32 FMA runtime; no full24 acceptance',nodePid:process.pid,parentPid:process.ppid,newSourceRuns:0,newExports:0,full24Acceptance:false,counts:{sessionsCreated:0,sessionsReleased:0,runCalls:0,tensorDisposeCalls:0}};
const started=performance.now(),base=resolve(c.runtime);let session,hike,graphHandle;
try{
 const binary=await u8file(c.candidate.path);check(binary.byteLength===c.candidate.bytes&&hash(binary)===c.candidate.sha256,'Private runtime bytes/hash changed');
 const kernels=await u8file(c.candidateKernels.path);check(hash(kernels)===c.candidateKernels.sha256,'Private canary kernels changed');
 const {instance:canary}=await WebAssembly.instantiate(kernels);const m=new Float32Array(canary.exports.memory.buffer),a=1+2**-23,b=1-2**-23;
 m.set([-1,a],0);m.fill(1,32,48);m.fill(b,48,64);m.fill(0,64,80);
 check(canary.exports.zero(0,128,256,2,1,16,2,16,1)===1,'Unexpected isolated SGEMM row count');
 report.syntheticFmaCanary={scope:'One synthetic2-term SGEMM, no model',expected:-(2**-46),actual:m[64],all16Equal:Array.from(m.subarray(64,80)).every(v=>v===-(2**-46))};
 check(report.syntheticFmaCanary.all16Equal,'This host does not execute the candidate as the selected F32 FMA operation');
 const ort=await import(pathToFileURL(join(base,'vendor/ort.wasm.min.mjs')).href),{createHike}=await import(pathToFileURL(join(base,'hike.mjs')).href);
 check(ort.env.versions?.web==='1.24.3','Pinned JS ORT version required');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmBinary=binary;
 ort.env.wasm.wasmPaths={mjs:pathToFileURL(join(base,'vendor/ort-wasm-simd-threaded.mjs')).href};
 const {openPreparedGraph}=await import(pathToFileURL(join(c.root,'tools/inference/text-encoder/node_sdk_host.mjs')).href);
 const input=await f32(join(c.reference,'source-hidden-18.f32'),ELEMENTS),source=await f32(join(c.reference,'source-hidden-19.f32'),ELEMENTS),weight=await f32(join(c.reference,'final-norm.f32'),COLUMNS),torchRows=await f32(join(c.reference,'source-norm-rows-19.f32'),SELECTED_ROWS.length*COLUMNS);
 for(const[name,value]of[['source-hidden-18.f32',input],['source-hidden-19.f32',source],['final-norm.f32',weight],['source-norm-rows-19.f32',torchRows]])check(tensorHash(value)===c.selection.checkpoints[name].sha256,'Checkpoint changed after preflight: '+name);
 graphHandle=await openPreparedGraph(c.selection.graph.path,c.selection.graph.bytes);const graphBytes=new Uint8Array(await graphHandle.slice().arrayBuffer());check(hash(graphBytes)===c.selection.graph.sha256,'Original graph hash mismatch');
 const kernel=await u8file(join(base,'kernel/tensor.wasm'));check(hash(kernel)==='9dfdcb5f267e96d2f0bd1ebfeaf59f2eeb9710e8d1f6c9982ebebec1120a90f8','Original Hike kernel required');hike=await createHike(kernel);
 const mask=Array(ROWS).fill(1),sourceNorm=maskedNorm(hike,source,weight,mask,1e-6);report.hikeVsTorchSourceNormRows=metrics(selected(sourceNorm),torchRows);
 let hiddenInput,maskInput,result,native;
 try{
  session=await ort.InferenceSession.create(graphBytes,c.selection.creationOptions);report.counts.sessionsCreated++;
  hiddenInput=new ort.Tensor('float32',input,[1,ROWS,COLUMNS]);maskInput=new ort.Tensor('float32',Float32Array.from(mask),[1,ROWS]);
  report.counts.runCalls++;result=await session.run({hidden:hiddenInput,mask:maskInput});const output=result.hidden_out;
  check(output?.type==='float32'&&output.dims.join(',')==='1,512,4096'&&output.data.length===ELEMENTS,'Unexpected block19 shape');native=new Float32Array(output.data);finite(native,'Native FMA block19');
 }finally{
  let failure;
  for(const tensor of new Set([...Object.values(result??{}),hiddenInput,maskInput]))if(tensor){try{tensor.dispose();report.counts.tensorDisposeCalls++;}catch(e){failure??=e;}}
  if(session){const current=session;session=null;try{await current.release();report.counts.sessionsReleased++;}catch(e){failure??=e;}}
  if(failure)throw failure;
 }
 check(tensorHash(input)===c.selection.checkpoints['source-hidden-18.f32'].sha256,'Source input changed during inference');check(hash(graphBytes)===c.selection.graph.sha256,'Original graph buffer changed');
 const normalized=maskedNorm(hike,native,weight,mask,1e-6);report.raw=metrics(native,source);report.weightedNorm=metrics(normalized,sourceNorm);report.nativeVsTorchSelectedNormRows=metrics(selected(normalized),torchRows);
 for(const[name,value]of[['fma-hidden.f32',native],['fma-normalized.f32',normalized]]){const path=join(c.output,name);await writeFile(path,view(value));(report.artifacts??=[]).push(await fileRecord(path));}
 const before=c.selection.historicalLocal.weightedNorm,after=report.weightedNorm;
 report.localChange={row0Ratios:Object.fromEntries(['maxAbsError','rmsError','directionalResidualMaxAbs'].map(key=>[key,after.row0[key]/before.row0[key]])),historicalGlobalMaxAbs:before.maxAbsError,newGlobalMaxAbs:after.maxAbsError};
 report.localChange.halvesAllThreeRow0ErrorsWithoutWorseGlobalMax=Object.values(report.localChange.row0Ratios).every(v=>v<=.5)&&after.maxAbsError<=before.maxAbsError;
 report.passed=report.counts.runCalls===1&&report.counts.sessionsCreated===1&&report.counts.sessionsReleased===1&&report.counts.tensorDisposeCalls===3;report.options=c.selection.creationOptions;report.inputPreserved=true;report.graphPreserved=true;
}catch(error){report.failure={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 try{if(session){await session.release();report.counts.sessionsReleased++;}if(graphHandle){await graphHandle.close();report.graphHandleClosed=true;}hike?.dispose();report.hikeDisposed=!!hike;}catch(error){report.passed=false;report.cleanupFailure={name:error.name,message:error.message};process.exitCode=1;}
 report.wallSeconds=(performance.now()-started)/1000;report.peakRssBytes=process.resourceUsage().maxRSS*1024;await writeFile(join(c.output,'native-fma-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,counts:report.counts,localChange:report.localChange,failure:report.failure}));
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['bundle','reference','historical-trace','candidate-receipt','output']:
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}',args.execution_source_sha):raise ValueError('Complete source commit required')
    selected = select_reference(args.bundle,args.reference,args.historical_trace)
    receipt = json.loads(args.candidate_receipt.read_text())
    original = ROOT/'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm'
    candidate = Path(receipt['candidate']['path'])
    inspect_selected_runtime(original.read_bytes())
    if record(candidate)['sha256'] != receipt['candidate']['sha256']:raise ValueError('Candidate runtime receipt mismatch')
    verify_splice(original.read_bytes(),candidate.read_bytes(),{1365,1946})
    kernels = candidate.parent/'fma-sgemm-kernels.wasm'
    if [sha(body) for body in code_bodies(kernels.read_bytes())] != [receipt['changedBodies'][str(index)]['sha256'] for index in [1365,1946]]:raise ValueError('Candidate scalar-canary body mismatch')
    from accept_plain import verify_node_sdk_sources
    closure=verify_node_sdk_sources(ROOT,args.execution_source_sha)
    closure += [committed(path,args.execution_source_sha) for path in [Path(__file__),HERE/'diagnose_block.py',HERE/'wasm_sgemm_fma.py']]
    report={'passed':False,'scope':'One existing block19 with a private Text-only FMA runtime; fixed full24 gate not reevaluated','executionSourceSha':args.execution_source_sha,'selection':selected,'runtimeReceipt':record(args.candidate_receipt),'candidateRuntime':receipt['candidate'],'sourceClosure':closure,'preflightOnly':args.preflight_only,'newSourceRuns':0,'newExports':0,'full24Acceptance':False}
    if args.preflight_only:
        print(json.dumps({'passed':True,'newNeuralRuns':0,'sourceBridge':selected['sourceBridge'],'candidateRuntime':receipt['candidate']}));return
    if args.output.exists() or args.output.resolve().is_relative_to(ROOT/'docs'):raise ValueError('Fresh private output required')
    args.output.mkdir(parents=True);owner=ProcessOwnership().start();started=time.monotonic()
    config={'runtime':str(ROOT/'docs/shared/inference'),'root':str(ROOT),'reference':str(args.reference.resolve()),'output':str(args.output.resolve()),'selection':selected,'candidate':receipt['candidate'],'candidateKernels':record(kernels)}
    try:
        with (args.output/'native-stdout.txt').open('w') as stdout,(args.output/'native-stderr.txt').open('w') as stderr:
            process=subprocess.Popen(['node','--input-type=module','-e',NODE],stdin=subprocess.PIPE,stdout=stdout,stderr=stderr,text=True)
            report['ownedNodePid']=process.pid;process.communicate(json.dumps(config));report['nodeExitCode']=process.returncode
        native=json.loads((args.output/'native-fma-results.json').read_text());report['native']=native;report['passed']=process.returncode==0 and native['passed'];report['newNeuralRuns']=native['counts']['runCalls']
    finally:
        ownership=owner.finish(timeout_seconds=5);report['processOwnership']=ownership
        if not cleanup_complete(ownership['liveAfterClose'],ownership['zombiesAfterClose'],ownership['errors']):report['passed']=False
        report['wallSeconds']=time.monotonic()-started;(args.output/'fma-probe-results.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'passed':report['passed'],'newNeuralRuns':report.get('newNeuralRuns'),'localChange':report.get('native',{}).get('localChange'),'processOwnership':ownership}));raise SystemExit(0 if report['passed'] else 1)


if __name__ == '__main__':main()
