"""Independent online six-update oracle, using unchanged original references.

Only native chunks are accepted as comparison operands. Every model input and
sampler state below comes from saved declared inputs or independent arithmetic.
"""
import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import time

TRACE_SEQUENCE=['initialX','velocity00','step00X','velocity01','step01X','velocity02','step02X','highPublic','lowEntry','velocity03','step03X','velocity04','step04X','velocity05','step05X','finalRaw']
ROOT=Path(__file__).resolve().parents[2]
LATENT_FORMATS_RELATIVE='development/ai-connection/profile-adoption/p4/core-source/comfy/latent_formats.py'
LATENT_FORMATS_PROVENANCE_RELATIVE='development/ai-connection/profile-adoption/p4/core-source/comfy/latent_formats.provenance.json'
LATENT_FORMATS=ROOT/LATENT_FORMATS_RELATIVE
LATENT_FORMATS_PROVENANCE=ROOT/LATENT_FORMATS_PROVENANCE_RELATIVE
# Preserve the independently frozen sampler bytes. The complete fixed-upstream
# source differs only by its additional final LF; the provenance records both.
LATENT_FORMATS_SHA256='d7b5d624a6b9e201a8962940f5ae8d450c4214854cd13ebeec0338f6bc8f7dab'
LATENT_FORMATS_PROVENANCE_SHA256='dd3c95519c703db34d9904837d2bd63b0e6fe73f78be4eb9bc5c8e6bbf2841c7'


def captured_reference_sources(path=LATENT_FORMATS,provenance_path=LATENT_FORMATS_PROVENANCE):
    path=Path(path)
    raw=path.read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    if digest!=LATENT_FORMATS_SHA256:raise ValueError('Pinned original Wan21 latent_formats source bytes differ')
    provenance_raw=Path(provenance_path).read_bytes()
    if hashlib.sha256(provenance_raw).hexdigest()!=LATENT_FORMATS_PROVENANCE_SHA256:raise ValueError('Pinned original Wan21 source provenance differs')
    provenance=json.loads(provenance_raw)
    if len(raw)!=provenance['capturedBytes'] or raw[-1:]!=b'\n' or len(raw[:-1])!=provenance['upstreamBytes'] or hashlib.sha256(raw[:-1]).hexdigest()!=provenance['upstreamSHA256']:raise ValueError('Original Wan21 source capture upstream trailing-LF profile differs')
    return {'comfy/latent_formats.py':{'path':str(path.resolve()),'repositoryPath':LATENT_FORMATS_RELATIVE,'bytes':len(raw),'sha256':digest,'provenanceRepositoryPath':LATENT_FORMATS_PROVENANCE_RELATIVE,'provenanceSHA256':LATENT_FORMATS_PROVENANCE_SHA256,'provenance':provenance,'role':'committed original source capture for unchanged AST literal read; not a candidate numerical input'}}


def bind_sampler_source(sampler):
    """Relocate the unchanged literal reader; never read the old provider path."""
    captured_reference_sources()
    key='comfy/latent_formats.py'
    original=sampler.SOURCES[key]
    sampler.SOURCES[key]=LATENT_FORMATS
    return {'source':key,'originalPath':str(original),'repositoryPath':LATENT_FORMATS_RELATIVE,'runtimePath':str(LATENT_FORMATS),'sha256':LATENT_FORMATS_SHA256,'pathRelocationOnly':True,'numericFunctionsModified':False,'originalAbsolutePathRequired':False}


def private_paths(directory):
    """Exact harness-owned paths, including interrupted independent predictions."""
    root=Path(directory)
    paths=[root/(name+'.f32') for name in ['reference-x','reference-k','reference-v']]
    for step in range(6):
        paths.extend(root/('prediction-input-'+str(step)+suffix) for suffix in ['.f32','.json'])
        paths.extend(root/('prediction-'+str(step))/(name+'.f32') for name in ['reference-x','reference-k','reference-v'])
    return paths


class SampleCoverage:
    def __init__(self,manifest):
        self.shape=manifest['tensors'][0]['shape']
        self.extent=math.prod(self.shape)//self.shape[-1]
        self.rows={}
        self.count=0
        self.index=0

    def check(self,event,*,commit=False):
        name=event.get('name')
        if self.index>=len(TRACE_SEQUENCE) or name!=TRACE_SEQUENCE[self.index]:raise ValueError('Unexpected, duplicate or skipped six-update trace identity')
        start,count=event.get('globalRowStart'),event.get('rowCount')
        if type(start) is not int or type(count) is not int or not 1<=count<=128 or start!=self.rows.get(name,0) or start+count>self.extent:raise ValueError('Noncontiguous or out-of-range sampler chunk')
        if commit:
            self.rows[name]=start+count
            self.count+=1
            if start+count==self.extent:self.index+=1

    def summary(self):
        return {'operation':'sample','complete':self.index==len(TRACE_SEQUENCE),'chunks':self.count,'traceIdentities':list(TRACE_SEQUENCE),'rows':[{'name':name,'completedRows':self.rows.get(name,0),'requiredRows':self.extent} for name in TRACE_SEQUENCE],'scope':'six complete model velocity outputs plus16 sampler state/handoff/restoration boundaries; per-block chunk acceptance is separate'}


class SampleOracle:
    def __init__(self,reference,manifest_path,model_directory,directory,*,progress=None):
        self.reference=reference
        self.np=reference.np
        self.original=reference.read_json(manifest_path)
        if self.original.get('schemaVersion')!='bernini-production-chunk-input/1' or self.original.get('gate')!=reference.GATE:raise ValueError('Exact frozen sampler input schema and gate required')
        self.directory=Path(directory)
        self.models=Path(model_directory)
        self.shape=self.original['tensors'][0]['shape']
        if math.prod(self.shape)*4>8388608:raise ValueError('Sampler comparison target exceeds bounded8MiB profile')
        self.reference_source_before=captured_reference_sources()
        self.reference_source_after=self.reference_source_before
        spec=importlib.util.spec_from_file_location('production_chunk_original_sampler_math',Path(reference.__file__).with_name('standalone-sampler-reference.py'))
        self.sampler=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.sampler)
        self.source_relocation=bind_sampler_source(self.sampler)
        self.sampler.SHAPE=self.shape
        _,self.sigmas,self.timesteps=self.sampler.schedule()
        self.progress=progress
        self.coverage=SampleCoverage(self.original)
        self.x=self.velocity=self.high_public=self.expected_value=None
        self.expected_name=None
        self.closed=False
        self.predictions=[]
        self.comparison_count=self.compared_elements=self.failed_elements=0
        self.reference_seconds=0.0

    def _saved(self,entry):
        path=Path(entry['path'])
        if path.stat().st_size!=math.prod(self.shape)*4 or self.reference.file_sha(path)!=entry['sha256']:raise ValueError('Saved sampler source identity mismatch')
        return self.np.fromfile(path,dtype='<f4').reshape(self.shape)

    def _prediction(self,step):
        side='HIGH' if step<3 else 'LOW'
        manifest=copy.deepcopy(self.original)
        manifest['side'],manifest['timestep']=side,float(self.timesteps[step])
        path=self.directory/('prediction-input-'+str(step)+'.f32')
        descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'wb') as stream:stream.write(self.reference.REF.f32(self.x).tobytes())
        manifest['tensors'][0].update(path=str(path),sha256=self.reference.file_sha(path))
        manifest_path=self.directory/('prediction-input-'+str(step)+'.json')
        self.reference.write_json(manifest_path,manifest,exclusive=True,mode=0o600)
        owner=None
        try:
            owner=self.reference.ChunkOracle(manifest_path,self.models/self.reference.REF.MODELS[side][0],side,self.directory/('prediction-'+str(step)),allow_model_work=True)
            def progress(block,stage,rows,total):
                if self.progress:self.progress({'step':step,'side':side,'block':block,'stage':stage,'rows':rows,'total':total})
            value=self.reference.evaluate_prediction(owner,progress=progress)
            self.predictions.append({'step':step,'side':side,'timestep':float(self.timesteps[step]),'stats':owner.stats(),'complete40HeadTargetUnpatch':True})
            return value
        finally:
            if owner is not None:
                owner.close()
                for item in owner.file_paths.values():item.unlink(missing_ok=True)
            path.unlink(missing_ok=True)
            manifest_path.unlink(missing_ok=True)

    def _expected(self,name):
        if name==self.expected_name:return self.expected_value
        before=captured_reference_sources()
        if self.sampler.SOURCES['comfy/latent_formats.py']!=LATENT_FORMATS:raise ValueError('Original sampler literal source relocation changed')
        if name=='initialX':
            self.x=self.sampler.noise_mix(self._saved(self.original['explicitNoise']),self._saved(self.original['initialEmptyTarget']),self.sigmas[0])
            value=self.x
        elif name.startswith('velocity'):
            self.velocity=self._prediction(int(name[-2:]))
            value=self.velocity
        elif name.startswith('step'):
            step=int(name[4:6])
            self.x=self.sampler.euler(self.x,self.velocity,self.sigmas[step],self.sigmas[step+1])
            self.velocity=None
            value=self.x
        elif name=='highPublic':
            self.high_public=self.sampler.process_out(self.sampler.inverse(self.x,self.sigmas[3]))
            value=self.high_public
        elif name=='lowEntry':
            normalized=self.sampler.process_in(self.high_public,True)
            self.x=self.sampler.noise_mix(self.np.zeros(self.shape,dtype='<f4'),normalized,self.sigmas[3])
            self.high_public=None
            value=self.x
        elif name=='finalRaw':value=self.sampler.process_out(self.sampler.inverse(self.x,self.sigmas[6]))
        else:raise ValueError('Unknown independent sampler stage')
        self.reference_source_after=captured_reference_sources()
        if before!=self.reference_source_before or self.reference_source_after!=before:raise ValueError('Pinned captured reference source changed during trace computation')
        self.expected_name,self.expected_value=name,self.reference.REF.f32(value)
        return self.expected_value

    def compare(self,event,raw):
        if self.closed:raise ValueError('Independent sampler oracle is closed')
        self.coverage.check(event)
        width=self.shape[-1]
        expected_fields={'schemaVersion':'bernini-sampler-chunk/1','block':None,'rowAxis':None,'columns':width,'fullShape':self.shape,'dtype':'float32','layout':'NCTHW-contiguous-row-span','axes':['linearNCTHRow','W'],'fullAxes':['N','C','T','H','W']}
        for key,value in expected_fields.items():
            if event.get(key)!=value:raise ValueError('Sampler diagnostic descriptor mismatch: '+key)
        start,count=event['globalRowStart'],event['rowCount']
        if event.get('shape')!=[count,width] or event.get('storageElementOffset')!=start*width or len(raw)!=count*width*4 or len(raw)>8388608:raise ValueError('Exact bounded sampler row span required')
        name=event['name']
        meaning='bernini-flow-velocity:v1' if name.startswith('velocity') else 'bernini-high-handoff-raw:v1' if name=='highPublic' else 'wan21-raw-generated-sample:v1' if name=='finalRaw' else 'bernini-sampler-state:v1'
        if event.get('meaning')!=meaning:raise ValueError('Sampler stage latent meaning differs')
        if name=='highPublic' and event.get('handoffProfile')!='bernini-high-low-wan21-handoff:v1':raise ValueError('Exact HIGH/LOW handoff profile required')
        if name=='finalRaw':
            contract=event.get('latentContract',{})
            if contract.get('representation')!='generated-sample' or contract.get('space')!='raw' or contract.get('normalization')!={'id':'wan21-comfy-f32-v1','state':'restored','owner':'diffusion_models'}:raise ValueError('Final generated sample must be restored exactly once by Diffusion')
        if name.startswith(('velocity','step')):
            step=int(name[8:10] if name.startswith('velocity') else name[4:6])
            sigma=self.sigmas[step if name.startswith('velocity') else step+1]
            if type(event.get('step')) is not int or event.get('step')!=step or event.get('side')!=('HIGH' if step<3 else 'LOW') or event.get('sigma')!=float(sigma):raise ValueError('Independent six-update step/side/sigma identity differs')
        elif name in ['initialX','highPublic','lowEntry']:
            if event.get('sigma')!=float(self.sigmas[0 if name=='initialX' else 3]):raise ValueError('Sampler initial/handoff sigma differs')
        began=time.perf_counter()
        expected=self._expected(name).reshape(-1,width)[start:start+count].reshape(-1)
        actual=self.np.frombuffer(raw,dtype='<f4')
        error=self.np.abs(actual.astype(self.np.float64)-expected.astype(self.np.float64))
        gate=self.reference.GATE['abs']+self.reference.GATE['rel']*self.np.abs(expected.astype(self.np.float64))
        failed=int(self.np.count_nonzero(~self.np.isfinite(error)|(error>gate)))
        result={'name':name,'block':None,'globalRowStart':start,'rowCount':count,'elements':int(actual.size),'failed':failed,'maxAbsolute':float(self.np.max(error,initial=0)),'maxNormalizedToGate':float(self.np.max(error/gate,initial=0)),'actualSHA256':self.reference.sha(raw),'referenceSHA256':self.reference.sha(expected.tobytes()),'gate':self.reference.GATE,'elapsedSeconds':time.perf_counter()-began}
        self.comparison_count+=1
        self.compared_elements+=int(actual.size)
        self.failed_elements+=failed
        self.reference_seconds+=result['elapsedSeconds']
        self.coverage.check(event,commit=True)
        return result

    def stats(self):
        return {'operation':'sample','comparisons':self.comparison_count,'comparedElements':self.compared_elements,'failedElements':self.failed_elements,'referenceSeconds':self.reference_seconds,'coverage':self.coverage.summary(),'predictions':self.predictions,'referenceSourceBefore':self.reference_source_before,'referenceSourceAfter':self.reference_source_after,'sourceRelocation':self.source_relocation,'actualNativeOutputsUsedAsNumericInput':False,'numericSources':'unchanged ChunkOracle/evaluate_prediction and standalone-sampler-reference expressions','closed':self.closed}

    def close(self):
        self.x=self.velocity=self.high_public=self.expected_value=None
        self.closed=True
