import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
import urllib.request
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
def load(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'development/vr180/p5-long-prototype'/(name+'.py'))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
stream=load('streaming');oracle=load('oracle')

def entries(values):
    return [dict(id=side,name=side+'.mp4',bytes=len(values[side]),sha256=hashlib.sha256(values[side]).hexdigest()) for side in ('input','output')]

class StreamingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.values={'input':b'a'*(stream.CHUNK_BYTES+17),'output':b'b'*37}
        self.receiver=stream.MediaReceiver(self.root,{'input':2*stream.CHUNK_BYTES,'output':stream.CHUNK_BYTES},time.monotonic()+30)
        self.receiver.prepare(entries(self.values))
    def tearDown(self):
        for row in self.receiver.files.values():
            if row['stream']:row['stream'].close()
        self.temp.cleanup()
    def test_full_stream_fsync_close_and_complete_readback(self):
        for side,data in self.values.items():
            for offset in range(0,len(data),stream.CHUNK_BYTES):
                receipt=self.receiver.chunk(side,offset,data[offset:offset+stream.CHUNK_BYTES])
            self.assertEqual(receipt['acceptedBytes'],len(data));row=self.receiver.complete(side)
            self.assertTrue(row['closed'] and row['fsynced']);self.assertEqual(row['rereadSHA256'],hashlib.sha256(data).hexdigest())
        self.assertEqual(len(self.receiver.receipts()),2)
    def test_offset_chunk_wholehash_and_closed_refusals(self):
        for offset,data in [(1,b'a'),(0,b'a'*(stream.CHUNK_BYTES+1)),(0,b'')]:
            with self.assertRaises(ValueError):self.receiver.chunk('input',offset,data)
        with self.assertRaisesRegex(ValueError,'WHOLE_HASH'):self.receiver.complete('input')
        self.receiver.chunk('output',0,b'x'*37)
        with self.assertRaisesRegex(ValueError,'WHOLE_HASH'):self.receiver.complete('output')
        self.assertFalse(self.receiver.files['output']['complete'])
    def test_independent_readback_mismatch_is_not_complete(self):
        self.receiver.chunk('output',0,self.values['output'])
        with patch.object(stream,'hash_file',return_value=(37,'0'*64)):
            with self.assertRaisesRegex(ValueError,'REREAD'):self.receiver.complete('output')
        self.assertFalse(self.receiver.files['output']['complete']);self.assertIsNone(self.receiver.files['output']['stream'])
    def test_cleanup_refuses_a_replaced_file_but_attempts_other_owner(self):
        row=self.receiver.files['input'];row['stream'].close();row['stream']=None
        old=self.root/'kept-original';row['path'].rename(old);row['path'].write_bytes(b'foreign')
        with self.assertRaisesRegex(ValueError,'OWNERSHIP_CHANGED'):self.receiver.abort()
        self.assertEqual(row['path'].read_bytes(),b'foreign');self.assertFalse((self.root/'output.mp4').exists())
    def test_deadline_and_existing_destination_never_overwrite(self):
        self.receiver.deadline=0
        with self.assertRaises(TimeoutError):self.receiver.chunk('input',0,b'a')
        with self.assertRaises(FileExistsError):
            stream.MediaReceiver(self.root,{'input':2*stream.CHUNK_BYTES,'output':stream.CHUNK_BYTES},time.monotonic()+30).prepare(entries(self.values))
        self.assertEqual((self.root/'input.mp4').stat().st_size,0)
    def test_real_loopback_route_streams_only_exact_one_mib_parts(self):
        token='a'*32;server=stream.start_server({'/':(b'ok','text/plain')},self.receiver,token)
        origin='http://127.0.0.1:'+str(server.server_port)
        try:
            def request(side,action,data,offset=None,origin_header=origin):
                headers={'Origin':origin_header}
                if offset is not None:headers['X-Byte-Offset']=str(offset)
                req=urllib.request.Request(origin+'/transfer/'+token+'/'+side+'/'+action,data=data,headers=headers)
                with urllib.request.urlopen(req,timeout=5) as r:return json.load(r)
            with self.assertRaises(urllib.error.HTTPError):request('input','chunk',b'a',0,'http://foreign.invalid')
            with self.assertRaises(urllib.error.HTTPError):request('input','chunk',b'a'*(stream.CHUNK_BYTES+1),0)
            for side,data in self.values.items():
                for offset in range(0,len(data),stream.CHUNK_BYTES):request(side,'chunk',data[offset:offset+stream.CHUNK_BYTES],offset)
                self.assertEqual(request(side,'complete',b'')['sha256'],hashlib.sha256(data).hexdigest())
            self.assertEqual(len(self.receiver.receipts()),2)
        finally:server.shutdown();server.server_close()

class OracleTests(unittest.TestCase):
    def test_periodic_events_include_late_frames_and_hash_all_indices(self):
        expected=[i for i in range(100000) if i%300 in [29,30,31]]
        actual=oracle.expected_events(100000)
        self.assertEqual(actual['countPerEye'],len(expected))
        self.assertEqual(actual['sequenceSHA256'],hashlib.sha256(''.join(str(i)+'\n' for i in expected).encode()).hexdigest())
        for count in [0,100001,True]:
            with self.assertRaises(ValueError):oracle.expected_events(count)
    def test_packet_scan_100000_generator_has_no_history(self):
        rows=({'size':'1','pts':str(i),'dts':str(i),'duration':'1'} for i in range(100000))
        result=oracle.aggregate_packets(rows,'1/30',max_payload_bytes=100000,expected_frames=100000,input_side=True)
        self.assertEqual(result['packets'],100000);self.assertEqual(result['payloadBytes'],100000)
        self.assertFalse(any(isinstance(value,list) for value in result.values()))
    def test_packet_and_event_corruption_fail_even_with_matching_counts(self):
        for row in [{'size':1,'pts':2,'dts':0,'duration':1},{'size':4*1024**2+1,'pts':0,'dts':0,'duration':1}]:
            with self.assertRaises(ValueError):oracle.aggregate_packets(iter([row]),'1/30',max_payload_bytes=10**9,expected_frames=1,input_side=True)
        events=oracle.expected_events(1000);verified={'status':'PASS','completeScan':True,'frames':1000,'decodedFramesCompared':1000,
            'events':{'allFrameFlagsEqual':True,'inputCountByEye':[events['countPerEye']]*2,'outputCountByEye':[events['countPerEye']]*2,
                'inputSequenceSHA256ByEye':[events['sequenceSHA256']]*2,'outputSequenceSHA256ByEye':[events['sequenceSHA256']]*2}}
        packets={side:{'packets':1000,'completeScan':True,'payloadBytes':500} for side in ['input','output']}
        self.assertEqual(oracle.long_verdict(verified,packets,1000,500)['status'],'PASS')
        verified['events']['outputSequenceSHA256ByEye'][1]='0'*64
        self.assertEqual(oracle.long_verdict(verified,packets,1000,500)['status'],'FAIL')

if __name__=='__main__':unittest.main()
