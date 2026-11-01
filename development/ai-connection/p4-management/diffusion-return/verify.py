"""Verify fixed public Git source identities. No imported project code or NN run."""
import argparse,hashlib,json,subprocess
from pathlib import Path

def sha(body):
    return hashlib.sha256(body).hexdigest()

def blob(body):
    return hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo",type=Path,required=True)
    parser.add_argument("--manifest",type=Path,default=Path(__file__).with_name("ACQUISITION.json"))
    parser.add_argument("--acquired-root",type=Path,help="Optional directory containing the saved source/ copies; not needed for fixed-Git verification.")
    args=parser.parse_args()
    record=json.loads(args.manifest.read_text())
    head=record["head"]
    def show(commit,path):
        return subprocess.check_output(["git","show",commit+":"+path],cwd=args.repo)
    changed=record["delta"]["files"]
    actual_names=subprocess.check_output(["git","diff","--name-only",record["baseDistribution"],head],cwd=args.repo,text=True).splitlines()
    assert actual_names==[entry["path"] for entry in changed]
    assert len(changed)==24
    for entry in changed:
        body=show(head,entry["path"])
        assert (len(body),sha(body),blob(body))==(entry["bytes"],entry["sha256"],entry["gitBlobSha"]),entry["path"]
        if args.acquired_root:
            assert (args.acquired_root/"source"/entry["path"]).read_bytes()==body
    runtime=record["reusedRuntime50"]
    build_body=show(head,runtime["build"]["path"])
    assert sha(build_body)==runtime["build"]["sha256"]
    assert blob(build_body)==runtime["build"]["gitBlobSha"]
    build=json.loads(build_body)
    assert len(build["sources"])==build["sourceCount"]==len(runtime["files"])==50
    for entry in runtime["files"]:
        body=show(head,entry["path"])
        assert (len(body),sha(body),blob(body))==(entry["bytes"],entry["sha256"],entry["gitBlobSha"]),entry["path"]
        assert build["sources"][entry["path"]]=={"sha256":entry["sha256"],"byteLength":entry["bytes"]}
        for previous in [record["baseDistribution"],record["reusedRuntimeDistribution"]]:
            assert blob(show(previous,entry["path"]))==entry["gitBlobSha"],(previous,entry["path"])
    prefix="development/ai-connection/p4-real-text-l512/"
    reference_freeze=json.loads(show(head,prefix+"reference/reference-freeze.json"))
    for path,expected in reference_freeze["sourceSHA256"].items():
        assert sha(show(head,path))==expected,("reference source pin",path)
    freeze=json.loads(show(head,prefix+"attempts/source-admission-1/pre-runtime-freeze.json"))
    result=json.loads(show(head,prefix+"attempts/source-admission-1/RESULT.json"))
    assert freeze["sourceCommit"]=="538843e144339c917cfd244724204e8833204fcc"
    assert freeze["sourceCommit"]!=head and freeze["nativeExecuted"] is False
    assert result["status"]=="REJECTED_BEFORE_CHROMIUM_OR_NATIVE"
    assert result["nativeConstructions"]==result["numericalRuns"]==0
    for entry in record["composedReferenceReceipts"]:
        body=show(head,entry["path"])
        assert (len(body),sha(body),blob(body))==(entry["bytes"],entry["sha256"],entry["gitBlobSha"])
        receipt=json.loads(body);case=freeze["cases"][entry["side"]]
        assert receipt["independentOracleSHA256"]==sha(show(head,"tools/diffusion-models/p4-cross-ffn-reference.py"))
        assert receipt["transportGeneratorSHA256"]==sha(show(head,prefix+"reference/run-reference.py"))
        assert receipt["referenceManifestSHA256"]==case["manifestSHA256"]==entry["referenceManifestSha256Reported"]
        assert receipt["outputIdentities"]==case["outputIdentities"]
        assert len(receipt["outputIdentities"])==entry["publicOutputIdentityCount"]==25
        identities=json.dumps(receipt["outputIdentities"],sort_keys=True,separators=(",",":")).encode()
        assert sha(identities)==entry["outputIdentitiesCanonicalSha256"]
        assert receipt["readiness"]["realTextJointAcceptance"] is False
        assert receipt["readiness"]["generationReady"] is False
    assert record["verdict"]["successfulRealF76P4NativeNumericalComparisonEvidenceExistsAtHead"] is False
    assert record["operationsPerformed"]["newNeuralExecution"] is False
    print(json.dumps({"status":"PASS","head":head,"fixedDeltaGitBlobsVerified":24,"reusedRuntimeGitBlobsVerified":50,"runtimeUnchangedAgainstBothOldPins":True,"publicReferenceSourcePinsVerified":len(reference_freeze["sourceSHA256"]),"composedReceiptIdentitySetsVerified":2,"ownerPrivateReferencePayloadsVerifiedByThisScript":False,"newNeuralExecution":False,"numericalRuntimeAcceptance":"NOT_VERIFIED","source538FreezeIsNot994ExecutionProof":True},indent=2))

if __name__=="__main__":
    main()
