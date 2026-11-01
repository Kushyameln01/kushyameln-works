"""Verify stored artifact/provenance integrity only; no numerical output judge."""
import argparse,gzip,hashlib,json,struct,subprocess
from pathlib import Path

def sha(body):
    return hashlib.sha256(body).hexdigest()

def blob(body):
    return hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo",type=Path,required=True)
    parser.add_argument("--manifest",type=Path,default=Path(__file__).with_name("ACQUISITION.json"))
    parser.add_argument("--acquired-root",type=Path,help="Optional saved source/ copies; public Git verification works without this path.")
    args=parser.parse_args()
    record=json.loads(args.manifest.read_text())
    head=record["distribution"]
    def show(commit,path):
        return subprocess.check_output(["git","show",commit+":"+path],cwd=args.repo)
    def identity(body,entry):
        assert (len(body),sha(body),blob(body))==(entry["bytes"],entry["sha256"],entry["gitBlobSha"]),entry["path"]
    for entry in record["files"]:
        body=show(entry["ref"],entry["path"]);identity(body,entry)
        if args.acquired_root:
            assert (args.acquired_root/"source"/entry["path"]).read_bytes()==body
    base="development/inference/text-memory-20261102/"
    index_body=show(head,base+"INDEX.json")
    assert len(index_body)==2868 and sha(index_body)=="860c01f481ad68596b4820cf698c8727f4952e0fb22f6612dad8fef447061972"
    index=json.loads(index_body)
    assert len(index["files"])==14
    for entry in index["files"]:
        body=show(head,base+entry["path"])
        assert (len(body),sha(body))==(entry["byteLength"],entry["sha256"]),entry["path"]
    summary=json.loads(show(head,base+"SUMMARY.json"))
    for entry in record["gzipEvidenceIntegrity"]:
        compressed=show(head,entry["path"]);raw=gzip.decompress(compressed)
        assert (len(compressed),sha(compressed))==(entry["gzipBytes"],entry["gzipSha256"])
        assert (len(raw),sha(raw))==(entry["rawJsonBytes"],entry["rawJsonSha256"])
        json.loads(raw)
    assert len(record["sourceClosure"]["finalSources"])==22
    for entry in record["sourceClosure"]["finalSources"]:
        body=show(entry["executionSourceSha"],entry["path"]);identity(body,entry)
        assert show(head,entry["path"])==body
    # Historical source-set claims are checked directly against their owner
    # summary records; this never invokes their code or numerical comparison.
    for run in summary["runs"][:-1]:
        for entry in run["evidence"]["servedSources"]:
            body=show(entry["executionSourceSha"],entry["path"])
            assert (len(body),sha(body))==(entry["bytes"],entry["sha256"])
    peers=record["peerReceiptOriginals"]["files"]
    assert len(peers)==13
    for entry in peers:
        body=show(entry["sourceCommit"],entry["path"])
        assert (len(body),sha(body),blob(body))==(entry["byteLength"],entry["sha256"],entry["githubBlobSha"])
    received=record["receivedOutput"]
    packet=show(head,received["path"])
    assert packet[:8]==b"WKTSR001"
    header_length=struct.unpack("<I",packet[8:12])[0]
    header_bytes=packet[12:12+header_length]
    header=json.loads(header_bytes)
    payload=packet[12+header_length:]
    assert (len(packet),sha(packet),blob(packet))==(received["bytes"],received["sha256"],received["gitBlobSha"])
    assert (len(header_bytes),sha(header_bytes))==(received["headerBytes"],received["headerSha256"])
    assert (len(payload),sha(payload))==(received["payloadBytes"],received["payloadSha256"])
    assert header==summary["runs"][-1]["output"]["header"]
    assert header["shape"]==[1,512,4096] and header["dtype"]=="float32" and header["layout"]=="BLC"
    assert len(header["attentionMask"])==512
    assert sha(bytes(header["attentionMask"]))==received["maskSha256"]
    assert header["modelSha256"]==received["modelSha256"] and header["tokenizerSha256"]==received["tokenizerSha256"]
    # Only compare stored byte identity; no F32 values are decoded or judged.
    old=show(record["preservedBindings"]["oldTextArtifactDistribution"],"development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor")
    old_header_length=struct.unpack("<I",old[8:12])[0]
    old_payload=old[12+old_header_length:]
    assert sha(old)==record["preservedBindings"]["oldP4InputWholeSha256"]
    assert sha(old_payload)==record["preservedBindings"]["oldP4InputPayloadSha256"]
    assert packet!=old and payload!=old_payload
    for owner_run,manifest_run in zip(summary["runs"],record["ownerReportedEvidence"]["runs"],strict=True):
        assert owner_run["comparison"]==manifest_run["ownerReportedComparison"]
    for entry in record["preservedBindings"]["nativeAndCodecSourceChecks"]:
        body=show(head,entry["path"])
        assert (len(body),sha(body))==(entry["bytes"],entry["sha256"])
        for field,previous in [("sameBlobAsAccepted855","855f435120f08eb9e818e51281fc26f0e2633829"),("sameBlobAsF76","f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48"),("sameBlobAsMemoryBaseA42","a42ad61a7f56667ceefb4f21a9aacde859e00538")]:
            assert (body==show(previous,entry["path"])) is entry[field]
    assert show(head,"docs/shared/inference/tensor.mjs")==show(record["preservedBindings"]["acceptedCodecSource"],"docs/shared/inference/tensor.mjs")
    print(json.dumps({"status":"PASS","distribution":head,"indexedArtifactsVerified":14,"indexBytes":2868,"additionalApiAndSourceFiles":3,"finalSourceClosureVerified":22,"peerSourceOriginalsVerified":13,"gzipRawIntegrityChecks":3,"actualNewOutputBytesReceived":True,"oldF76AndNewOutputAreDistinct":True,"ownerComparisonRecordIntegrityVerified":True,"f32ValuesDecodedOrNumericallyJudgedByThisVerifier":False,"ownerNumericalResultCitedAsOwnerEvidence":True,"newNeuralExecution":False,"newReferenceGeneration":False,"runtimeAdoptionPerformedByVerifier":False,"p4InputRebound":False},indent=2))

if __name__=="__main__":
    main()
