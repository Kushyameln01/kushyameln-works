#!/usr/bin/env python3
"""Bounded inner-RMSNorm operator probe; no MatMul, SDPA or full-model run.

Torch2.6.0 CPU source2236df1770800ffea5697b11b0bb0d910b2e59e1:
aten/src/ATen/native/ReduceOps.cpp mean_out uses sum_out(...).div_(4096).
aten/src/ATen/native/cpu/SumKernel.cpp multi_row_sum/row_sum/
vectorized_inner_sum define the four-level, ILP4, AVX2 lane8 order used here.
DispatchStub.h REGISTER_DISPATCH registers nullptr for AVX512 unless explicitly
opted in; SumKernel lacks that opt-in, so actual CPU capability AVX512 falls back.
This preserves float32 at every operation. Float64 is used only for error metrics.
Preparation and native stages are explicit; importing this module runs no model.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import resource
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
WIDTH = 4096
SHAPE = [1, 512, WIDTH]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def record(path):
    path = Path(path)
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': sha(raw)}


def torch_cascade_mean_f32(values):
    """Exact4096-element SumKernel AVX2 order, then F32 division by4096."""
    import numpy as np
    values = np.asarray(values)
    if values.dtype != np.float32 or values.shape[-1] != WIDTH:
        raise ValueError('Expected float32 rows of4096 values')
    rows = values.reshape(-1, 8, 16, 4, 8)
    # multi_row_sum<vec8,ilp4>: sixteen sequential steps per cascade chunk.
    chunks = np.zeros((rows.shape[0], 8, 4, 8), dtype=np.float32)
    for step in range(16):
        chunks = np.add(chunks, rows[:, :, step], dtype=np.float32)
    partial = np.zeros((rows.shape[0], 4, 8), dtype=np.float32)
    for chunk in range(8):
        partial = np.add(partial, chunks[:, chunk], dtype=np.float32)
    # row_sum combines the four ILP vectors in their original order.
    vector = partial[:, 0].copy()
    for group in range(1, 4):
        vector = np.add(vector, partial[:, group], dtype=np.float32)
    # vectorized_inner_sum stores lanes, then adds each of8 scalar lanes.
    total = np.zeros(rows.shape[0], dtype=np.float32)
    for lane in range(8):
        total = np.add(total, vector[:, lane], dtype=np.float32)
    return np.divide(total, np.float32(WIDTH), dtype=np.float32).reshape(*values.shape[:-1], 1)


def metrics(actual, expected):
    import numpy as np
    if actual.shape != expected.shape or actual.dtype != np.float32 or expected.dtype != np.float32:
        raise ValueError('Probe output shape/dtype mismatch')
    delta = actual.astype(np.float64) - expected.astype(np.float64)
    return {'elements': int(actual.size), 'finite': bool(np.isfinite(actual).all()),
            'bitwiseEqual': bool(np.array_equal(actual.view(np.uint32), expected.view(np.uint32))),
            'unequalElements': int(np.count_nonzero(actual.view(np.uint32) != expected.view(np.uint32))),
            'maxAbsError': float(np.max(np.abs(delta))), 'rmsError': float(np.sqrt(np.mean(delta * delta))),
            'row0MaxAbsError': float(np.max(np.abs(delta.reshape(512, -1)[0])))}


def cascade_nodes(square, output, onnx, prefix='cascade'):
    h = onnx.helper
    nodes = []
    def constant(name, values, dtype=onnx.TensorProto.INT64):
        nodes.append(h.make_node('Constant', [], [name], name=name,
                                value=h.make_tensor(name + '-value', dtype, [len(values)], values)))
        return name
    shape = constant('cascade-input-shape', [0, 0, 8, 16, 4, 8])
    nodes.append(h.make_node('Reshape', [square, shape], ['cascade-input'], name='cascade-input'))
    current = 'cascade-input'
    for stage, axis, count in [('step', 3, 16), ('chunk', 2, 8), ('ilp', 4, 4), ('lane', 5, 8)]:
        names = ['cascade-' + stage + '-' + str(index) for index in range(count)]
        nodes.append(h.make_node('Split', [current], names, axis=axis, name='cascade-split-' + stage))
        current = names[0]
        for index in range(1, count):
            result = 'cascade-' + stage + '-sum-' + str(index)
            nodes.append(h.make_node('Add', [current, names[index]], [result], name=result))
            current = result
    shape = constant('cascade-output-shape', [0, 0, 1])
    nodes.append(h.make_node('Reshape', [current, shape], ['cascade-sum'], name='cascade-sum'))
    divisor = constant('cascade-divisor', [4096.], onnx.TensorProto.FLOAT)
    nodes.append(h.make_node('Div', ['cascade-sum', divisor], [output], name='cascade-mean'))
    if prefix != 'cascade':
        def renamed(value):
            return prefix + value[len('cascade'):] if value.startswith('cascade') else value
        for node in nodes:
            node.name = renamed(node.name)
            for index, value in enumerate(node.input):
                node.input[index] = renamed(value)
            for index, value in enumerate(node.output):
                node.output[index] = renamed(value)
            for attribute in node.attribute:
                if attribute.type == onnx.AttributeProto.TENSOR:
                    attribute.t.name = renamed(attribute.t.name)
    return nodes


def norm_graphs(block_path, source_weight, onnx):
    # Existing streaming reader retains tiny node/normalization initializers and
    # seeks over all large MatMul weights. No whole graph is loaded or exported.
    spec = importlib.util.spec_from_file_location('existing_text_diagnostic', HERE / 'diagnose_block.py')
    existing = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(existing)
    graph = existing.small_graph(block_path, onnx)
    prefix = '/block/layer.0/layer_norm/'
    selected = [copy.deepcopy(node) for node in graph.node if node.name.startswith(prefix)]
    names = {node.name for node in selected}
    if prefix + 'ReduceMean' not in names or prefix + 'Mul_1' not in names:
        raise ValueError('Expected actual first inner RMSNorm graph')
    produced = {name for node in selected for name in node.output}
    inputs = {name for node in selected for name in node.input} - produced - {'hidden'}
    initializers = [copy.deepcopy(value) for value in graph.initializer if value.name in inputs]
    if len(initializers) != 1 or sha(onnx.numpy_helper.to_array(initializers[0]).astype('<f4').tobytes()) != sha(source_weight):
        raise ValueError('Existing graph norm weight differs from original model')
    outputs = {'square': prefix + 'Pow_output_0', 'mean': prefix + 'ReduceMean_output_0',
               'inverse': prefix + 'Div_output_0', 'normalized': prefix + 'Mul_1_output_0'}
    result = {}
    for variant in ['original', 'torch-avx2-cascade']:
        nodes = []
        for node in selected:
            if variant == 'torch-avx2-cascade' and node.name == prefix + 'ReduceMean':
                nodes.extend(cascade_nodes(node.input[0], node.output[0], onnx))
            else:
                nodes.append(node)
        nodes += [onnx.helper.make_node('Identity', [value], [key], name='probe-output-' + key) for key, value in outputs.items()]
        infos = [onnx.helper.make_tensor_value_info(key, onnx.TensorProto.FLOAT,
                                                  [1, 512, 1] if key in ['mean', 'inverse'] else SHAPE) for key in outputs]
        model = onnx.helper.make_model(onnx.helper.make_graph(nodes, 'bounded-inner-norm-' + variant,
            [onnx.helper.make_tensor_value_info('hidden', onnx.TensorProto.FLOAT, SHAPE)], infos, initializers),
            opset_imports=[onnx.helper.make_opsetid('', 17)])
        model.ir_version = 10
        onnx.checker.check_model(model)
        result[variant] = model.SerializeToString()
    return result


def committed(path, source):
    raw = Path(path).read_bytes()
    relative = str(Path(path).relative_to(ROOT))
    fixed = subprocess.run(['git', 'show', source + ':' + relative], cwd=ROOT, check=True, capture_output=True).stdout
    if raw != fixed:
        raise ValueError('Executed source differs from fixed commit: ' + relative)
    return record(path) | {'relativePath': relative, 'executionSourceSha': source}


def prepare(args):
    sys.path.insert(0, str(args.deps))
    import numpy as np
    import torch
    import onnx
    from safetensors import safe_open
    from prepare import source_module
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    if torch.version.git_version != '2236df1770800ffea5697b11b0bb0d910b2e59e1' or torch.backends.cpu.get_cpu_capability() != 'AVX512':
        raise ValueError('Probe is bound to actual Torch2.6.0 CPU/AVX512 source order')
    source = json.loads((args.checkpoints / 'trace-source-results.json').read_text())
    if not source.get('allLayerDigestsMatchOriginalOracle') or not source.get('sourceFinalMatchesOriginalOracle'):
        raise ValueError('Exact original-oracle checkpoint closure required')
    manifest = json.loads((args.bundle / 'manifest.json').read_text())
    if record(args.bundle / 'manifest.json')['sha256'] != source['manifest']['sha256']:
        raise ValueError('Probe must use original selected graph manifest')
    closure = [committed(path, args.execution_source_sha) for path in
               [Path(__file__), HERE / 'diagnose_block.py', HERE / 'prepare.py', HERE / 'pinned-t5.py']]
    if args.model.stat().st_size != manifest['modelBytes']:
        raise ValueError('Original model file size differs from selected source')
    report = {'schemaVersion': 1, 'scope': 'Only first RMSNorm in three original blocks; no MatMul/SDPA/full24',
              'executionSourceSha': args.execution_source_sha, 'sourceClosure': closure, 'cases': [],
              'newFullModelRuns': 0, 'newModelExports': 0, 'sourceNormOperators': 0,
              'torchVersion': torch.__version__, 'torchGitVersion': torch.version.git_version,
              'cpuCapability': torch.backends.cpu.get_cpu_capability(), 'sourceOracle': record(args.checkpoints / 'trace-source-results.json')}
    report['sumKernelDispatch'] = 'AVX2 fallback; REGISTER_DISPATCH leaves AVX512 null for SumKernel'
    report['sumVectorLanes'] = 8
    report['manifest'] = record(args.bundle / 'manifest.json')
    report['originalModel'] = {'path': str(args.model), 'bytes': args.model.stat().st_size,
                               'sha256': manifest['modelSha256'], 'wholeFileHashRecomputed': False,
                               'identityScope': 'Retained original model identity; selected norm weights independently match graph bytes'}
    mod, ops, _ = source_module(HERE / 'pinned-t5.py', torch)
    args.output.mkdir()
    for index in args.layers:
        input_path = args.checkpoints / ('source-hidden-%02d.f32' % (index - 1))
        input_record = record(input_path)
        if input_record['sha256'] != source['files'][input_path.name]['sha256']:
            raise ValueError('Original checkpoint bytes changed')
        with safe_open(str(args.model), framework='pt', device='cpu') as model:
            weight = model.get_tensor('encoder.block.%d.layer.0.layer_norm.weight' % index).float().clone()
        norm = mod.T5LayerNorm(4096, eps=1e-6, dtype=torch.float32, device='meta', operations=ops)
        norm.load_state_dict({'weight': weight}, strict=True, assign=True)
        x = torch.from_numpy(np.fromfile(input_path, dtype='<f4').reshape(SHAPE))
        with torch.inference_mode():
            square = x.pow(2)
            mean = square.mean(-1, keepdim=True)
            inverse = torch.rsqrt(mean + 1e-6)
            normalized = norm(x)
        references = {'square': square, 'mean': mean, 'inverse': inverse, 'normalized': normalized}
        item = {'index': index, 'input': input_record, 'shape': SHAPE, 'epsilon': 1e-6,
                'sourceWeightSha256': sha(weight.numpy().astype('<f4').tobytes()), 'reference': {}, 'graphs': {}}
        for name, value in references.items():
            path = args.output / ('block%02d-source-%s.f32' % (index, name))
            value.numpy().astype('<f4').tofile(path)
            item['reference'][name] = record(path) | {'shape': list(value.shape)}
        item['numpyCascadeVsTorchMean'] = metrics(torch_cascade_mean_f32(square.numpy()), mean.numpy())
        for variant, raw in norm_graphs(args.bundle / manifest['blocks'][index]['path'], weight.numpy().astype('<f4').tobytes(), onnx).items():
            path = args.output / ('block%02d-%s.onnx' % (index, variant))
            path.write_bytes(raw)
            item['graphs'][variant] = record(path)
        report['cases'].append(item)
        report['sourceNormOperators'] += 1
    report['passed'] = True
    (args.output / 'source-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'sourceNormOperators': len(report['cases']), 'newFullModelRuns': 0,
                      'cascadeMeanBitwiseMatches': [case['numpyCascadeVsTorchMean']['bitwiseEqual'] for case in report['cases']]}))


def retarget(args):
    """Reuse every saved independent reference; only replace diagnostic graphs."""
    sys.path.insert(0, str(args.deps))
    import numpy as np
    import onnx
    original = json.loads((args.reference / 'source-results.json').read_text())
    manifest = json.loads((args.bundle / 'manifest.json').read_text())
    if not original['passed'] or record(args.bundle / 'manifest.json')['sha256'] != original['manifest']['sha256']:
        raise ValueError('Completed matching original norm references required')
    report = copy.deepcopy(original)
    report.update(executionSourceSha=args.execution_source_sha,
                  referenceExecutionSourceSha=original['executionSourceSha'],
                  reusedSourceReport=record(args.reference / 'source-results.json'),
                  reusedSourceNormOperators=len(original['cases']), sourceNormOperators=0,
                  sourceClosure=[committed(path, args.execution_source_sha) for path in [Path(__file__), HERE / 'diagnose_block.py']],
                  reusedSourceClosure=original['sourceClosure'], sumVectorLanes=8,
                  sumKernelDispatch='AVX2 fallback; REGISTER_DISPATCH leaves AVX512 null for SumKernel')
    args.output.mkdir()
    for case in report['cases']:
        if case['index'] not in args.layers:
            raise ValueError('Unexpected source norm case')
        for value in [case['input'], *case['reference'].values(), *case['graphs'].values()]:
            if record(value['path'])['sha256'] != value['sha256']:
                raise ValueError('Saved independent norm data/graph changed')
        graph = onnx.load_from_string(Path(case['graphs']['original']['path']).read_bytes())
        weight = onnx.numpy_helper.to_array(graph.graph.initializer[0]).astype('<f4').tobytes()
        if sha(weight) != case['sourceWeightSha256']:
            raise ValueError('Retained norm source weight mismatch')
        square = np.fromfile(case['reference']['square']['path'], dtype='<f4').reshape(SHAPE)
        mean = np.fromfile(case['reference']['mean']['path'], dtype='<f4').reshape(1, 512, 1)
        case['previousCandidateComparison'] = case['numpyCascadeVsTorchMean']
        case['numpyCascadeVsTorchMean'] = metrics(torch_cascade_mean_f32(square), mean)
        if not case['numpyCascadeVsTorchMean']['bitwiseEqual']:
            raise ValueError('AVX2 source-order reduction does not match retained source mean')
        case['graphs'] = {}
        for variant, raw in norm_graphs(args.bundle / manifest['blocks'][case['index']]['path'], weight, onnx).items():
            path = args.output / ('block%02d-%s.onnx' % (case['index'], variant))
            path.write_bytes(raw)
            case['graphs'][variant] = record(path)
    (args.output / 'source-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'sourceNormOperators': 0, 'reusedSourceNormOperators': len(report['cases']),
                      'cascadeMeanBitwiseMatches': [case['numpyCascadeVsTorchMean']['bitwiseEqual'] for case in report['cases']]}))


NODE = r'''
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const c=JSON.parse(await new Promise(resolve=>{let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>resolve(s));}));
const ort=await import(pathToFileURL(c.runtime+'/vendor/ort.wasm.min.mjs').href);ort.env.wasm.numThreads=1;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const counts={sessionsCreated:0,sessionsReleased:0,tensorsDisposed:0,activeSessions:0};const started=performance.now();const runs=[];
try{
 for(const item of c.cases){
  const inputRaw=await readFile(item.input.path);if(sha(inputRaw)!==item.input.sha256)throw Error('Checkpoint input hash changed');
  for(const [variant,graph] of Object.entries(item.graphs)){
   const graphRaw=await readFile(graph.path);if(sha(graphRaw)!==graph.sha256)throw Error('Probe graph hash changed');
   let session,tensor,result;
   try{
    session=await ort.InferenceSession.create(graphRaw,{executionProviders:['wasm'],graphOptimizationLevel:'all',extra:{session:{disable_prepacking:'1'}}});counts.sessionsCreated++;counts.activeSessions++;
    tensor=new ort.Tensor('float32',new Float32Array(inputRaw.buffer,inputRaw.byteOffset,inputRaw.byteLength/4),item.shape);
    result=await session.run({hidden:tensor});const files={};
    for(const [name,value] of Object.entries(result)){
     const raw=new Uint8Array(value.data.buffer,value.data.byteOffset,value.data.byteLength),path=c.output+'/block'+String(item.index).padStart(2,'0')+'-'+variant+'-'+name+'.f32';
     await writeFile(path,raw);files[name]={path,bytes:raw.length,sha256:sha(raw),shape:value.dims};
    }
    runs.push({index:item.index,variant,files});
   }finally{
    for(const value of new Set([tensor,...Object.values(result??{})]))if(value){value.dispose();counts.tensorsDisposed++;}
    if(session){await session.release();counts.sessionsReleased++;counts.activeSessions--;}
   }
  }
 }
 await writeFile(c.output+'/native-results.json',JSON.stringify({passed:true,counts,runs,wallSeconds:(performance.now()-started)/1000,peakRssBytes:process.resourceUsage().maxRSS*1024,newFullModelRuns:0},null,2)+'\n');
}catch(error){await writeFile(c.output+'/native-results.json',JSON.stringify({passed:false,counts,runs,error:{name:error.name,message:error.message,stack:error.stack}},null,2)+'\n');throw error;}
'''


def native(args):
    import numpy as np
    sys.path.insert(0, str(HERE.parent / 'vae'))
    from process_lifecycle import ProcessOwnership, cleanup_complete
    source = json.loads((args.reference / 'source-results.json').read_text())
    if not source['passed']:
        raise ValueError('Completed independent source norm probes required')
    closure = [committed(path, args.execution_source_sha) for path in [Path(__file__),
        ROOT / 'docs/shared/inference/vendor/ort.wasm.min.mjs', ROOT / 'docs/shared/inference/vendor/ort-wasm-simd-threaded.mjs',
        ROOT / 'docs/shared/inference/vendor/ort-wasm-simd-threaded.wasm']]
    for case in source['cases']:
        for value in [case['input'], *case['reference'].values(), *case['graphs'].values()]:
            if record(value['path'])['sha256'] != value['sha256']:
                raise ValueError('Source checkpoint/reference/graph changed')
    args.output.mkdir()
    config = {'runtime': str(ROOT / 'docs/shared/inference'), 'output': str(args.output), 'cases': source['cases']}
    owner = ProcessOwnership().start()
    started = time.monotonic()
    try:
        process = subprocess.run(['node', '--input-type=module', '-e', NODE], input=json.dumps(config), text=True, capture_output=True)
        (args.output / 'node-stdout.txt').write_text(process.stdout)
        (args.output / 'node-stderr.txt').write_text(process.stderr)
        if process.returncode:
            raise RuntimeError('Bounded norm operator executor failed: ' + process.stderr[-1500:])
    finally:
        resources = owner.finish(timeout_seconds=5)
    report = json.loads((args.output / 'native-results.json').read_text())
    report.update(executionSourceSha=args.execution_source_sha, sourceClosure=closure, processOwnership=resources,
                  sourceNormReferenceSha256=record(args.reference / 'source-results.json')['sha256'], comparisons=[])
    for run in report['runs']:
        case = next(case for case in source['cases'] if case['index'] == run['index'])
        result = {'index': run['index'], 'variant': run['variant'], 'outputs': {}}
        for name, value in run['files'].items():
            reference = case['reference'][name]
            actual = np.fromfile(value['path'], dtype='<f4').reshape(reference['shape'])
            expected = np.fromfile(reference['path'], dtype='<f4').reshape(reference['shape'])
            result['outputs'][name] = metrics(actual, expected)
        report['comparisons'].append(result)
    report['passed'] = bool(report['passed'] and cleanup_complete(resources['liveAfterClose'], resources['zombiesAfterClose'], resources['errors']))
    report['totalWallSeconds'] = time.monotonic() - started
    report['parentPeakRssBytes'] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    (args.output / 'comparison-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': report['passed'], 'newFullModelRuns': 0, 'counts': report['counts'],
                      'comparisons': report['comparisons'], 'processOwnership': resources}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['prepare', 'retarget', 'native'])
    parser.add_argument('--execution-source-sha', required=True)
    parser.add_argument('--output', required=True, type=Path)
    for name in ['checkpoints', 'bundle', 'model', 'deps', 'reference']:
        parser.add_argument('--' + name, type=Path)
    parser.add_argument('--layers', default='18,19,20')
    args = parser.parse_args()
    args.layers = [int(value) for value in args.layers.split(',')]
    if not args.layers or any(index not in [18, 19, 20] for index in args.layers):
        raise ValueError('Only retained bounded source blocks18/19/20 are supported')
    if args.stage == 'prepare':
        if not all([args.checkpoints, args.bundle, args.model, args.deps]):
            raise ValueError('Prepare requires original checkpoints/bundle/model/deps')
        prepare(args)
    elif args.stage == 'retarget':
        if not all([args.reference, args.bundle, args.deps]):
            raise ValueError('Retarget requires retained source references, original bundle and deps')
        retarget(args)
    else:
        if not args.reference:
            raise ValueError('Native stage requires prepared independent norm references')
        native(args)


if __name__ == '__main__':
    main()
