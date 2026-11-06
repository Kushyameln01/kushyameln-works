"""Bind the acquired real L512 Text packet to the unchanged independent P4 oracle.

This command reads packet/saved-input bytes only. It never opens model weights,
starts a browser, or executes the P4 numerical reference.
"""
import argparse
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[4]
ORACLE_PATH = ROOT / 'tools/diffusion-models/p4-cross-ffn-reference.py'
ORACLE_SHA256 = '66ded34a4bb74d261b81484bf2abd2d9ee75b0e4cf82ce6a063e02237a7a7ecf'
PACKET_SHA256 = '90f9aed262027c5a273a71e2601a953a49d4e55593b34310565cfcd112fc95c9'
PAYLOAD_SHA256 = '107a34c18fb0389348a205c6e7b58f72f591dfb3371e71cb358bc9273c7171c7'
HEADER_SHA256 = '2e9ac007423d1f7bc894c4ac76e63e55ad3bd92704cecd12ee87cacee0654441'
MASK_SHA256 = '19ab437aa0f8ac1c6940dee6559b3d98633d013db2ca9cd9876638d4810f0d62'
TEXT_ARTIFACT_COMMIT = 'f76ebbbc9dcc76e95f17d34338bc6fc1c608ef48'
TEXT_PRODUCER_COMMIT = '5537b8932343aa2476b95191817e8913f99dab02'
MODEL_SHA256 = 'c3355d30191f1f066b26d93fba017ae9809dce6c627dda5f6a66eaa651204f68'
TOKENIZER_SHA256 = 'e3909a67b780650b35cf529ac782ad2b6b26e6d1f849d3fbb6a872905f452458'
DEFAULT_PACKET = Path('/tmp/text-packet-receipt-20261102/source/development/inference/p2-p3-acceptance/plain/evidence/plain-conditioning.wktensor')
DEFAULT_TAILS = Path('/workspace/work/diffusion-private-tail-saved-outputs-20261101')
sha = lambda data: hashlib.sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate packet JSON key')
        result[key] = value
    return result


def load_oracle():
    require(sha(ORACLE_PATH.read_bytes()) == ORACLE_SHA256, 'Independent oracle source changed')
    spec = importlib.util.spec_from_file_location('frozen_p4_reference', ORACLE_PATH)
    oracle = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(oracle)
    plan = oracle.load_plan()
    require(plan['gates']['localCut'] == {'abs': .001, 'rel': .0001}, 'Local gate changed')
    require(plan['gates']['composed'] == {'abs': .01, 'rel': .001}, 'Composed gate changed')
    return oracle, plan


def decode_packet(raw):
    """Strict native WKT decoding; retain exact header and every payload byte."""
    require(len(raw) >= 12 and raw[:8] == b'WKTSR001', 'Native WKT magic required')
    size = struct.unpack_from('<I', raw, 8)[0]
    require(1 <= size <= 65536 and 12 + size <= len(raw), 'Native WKT header extent mismatch')
    header_raw = raw[12:12 + size]
    metadata = json.loads(header_raw.decode('utf-8'), object_pairs_hook=unique_object)
    require(isinstance(metadata, dict), 'Native WKT object metadata required')
    require(metadata.get('schemaVersion') == 1 and metadata.get('byteOrder') == 'little', 'Native WKT schema/byte order mismatch')
    require(metadata.get('dtype') == 'float32' and metadata.get('layout') == 'BLC' and metadata.get('meaning') == 'text_hidden_states', 'Native Text dtype/layout/meaning mismatch')
    require(metadata.get('shape') == [1, 512, 4096], 'Complete native L512 shape required')
    payload = raw[12 + size:]
    require(metadata.get('byteLength') == 512 * 4096 * 4 == len(payload), 'Native Text complete payload extent mismatch')
    require(metadata.get('dataSha256') == sha(payload), 'Native Text payload SHA256 mismatch')
    mask = metadata.get('attentionMask')
    require(isinstance(mask, list) and len(mask) == 512 and all(type(x) is int and x in (0, 1) for x in mask) and any(mask), 'All512 native mask entries required')
    data = np.frombuffer(payload, dtype='<f4').reshape(512, 4096).copy()
    mask_array = np.asarray(mask, dtype='u1')
    require(np.isfinite(data).all(), 'Native Text nonfinite F32 payload')
    require(np.all(data[mask_array == 0] == 0), 'Native Text masked rows must already be zero')
    return data, mask_array, metadata, header_raw


def native_input(data, metadata, header_raw, packet_raw):
    """Adapt shape/identity only; preserve original native metadata separately."""
    return {
        'schemaVersion': 'bernini-p4-native-text-input/0.1',
        'dtype': metadata['dtype'], 'layout': metadata['layout'],
        'meaning': metadata['meaning'], 'shape': copy.deepcopy(metadata['shape']),
        'attentionMask': copy.deepcopy(metadata['attentionMask']),
        'modelSha256': metadata['modelSha256'],
        'tokenizerSha256': metadata['tokenizerSha256'],
        'producer': {'module': 'text_encoder', 'sourceCommit': TEXT_PRODUCER_COMMIT},
        'dataSHA256': sha(data.tobytes()),
        'nativeTensorMetadata': copy.deepcopy(metadata),
        'nativeTensorHeaderBase64': base64.b64encode(header_raw).decode('ascii'),
        'sourcePacket': {
            'artifactCommit': TEXT_ARTIFACT_COMMIT,
            'producerCommit': TEXT_PRODUCER_COMMIT,
            'bytes': len(packet_raw), 'sha256': sha(packet_raw),
            'headerBytes': len(header_raw), 'headerSHA256': sha(header_raw),
            'payloadSHA256': sha(data.tobytes()),
        },
        'data': data.reshape(-1).tolist(),
    }


def prepare(packet_path, output_dir, tails_dir):
    os.umask(0o077)
    oracle, plan = load_oracle()
    raw = Path(packet_path).read_bytes()
    require(len(raw) == 8390054 and sha(raw) == PACKET_SHA256, 'Acquired frozen real Text packet mismatch')
    data, mask, metadata, header_raw = decode_packet(raw)
    require(sha(data.tobytes()) == PAYLOAD_SHA256 and sha(header_raw) == HEADER_SHA256 and sha(mask.tobytes()) == MASK_SHA256, 'Frozen real Text payload/header/mask identity mismatch')
    require(metadata.get('modelSha256') == MODEL_SHA256 and metadata.get('tokenizerSha256') == TOKENIZER_SHA256, 'Frozen real Text model/tokenizer identity mismatch')
    payload = native_input(data, metadata, header_raw, raw)
    native_path = Path(output_dir) / 'real-text-l512-native.json'
    native_raw = oracle.private_write(native_path, payload)
    roundtrip, native_hash = oracle.read_json(native_path)
    admitted, admitted_mask, _ = oracle.validate_native_text(roundtrip)
    require(admitted.tobytes() == data.tobytes() and admitted_mask.tobytes() == mask.tobytes(), 'Native JSON changed Text F32/mask bits')
    require(roundtrip['nativeTensorMetadata'] == metadata and base64.b64decode(roundtrip['nativeTensorHeaderBase64']) == header_raw, 'Native JSON changed retained native metadata/header')
    cases = {}
    for side in ('HIGH', 'LOW'):
        tail_path = Path(tails_dir) / (side.lower() + '-tail-outputs.json')
        _, bindings = oracle.saved_inputs(side, tail_path, plan)
        cases[side] = {
            'savedTailPath': str(tail_path), 'blockIndex': 0,
            'scheduleIndex': bindings['scheduleIndex'], 'tokens': 2,
            'residualSHA256': bindings['residualSHA256'],
            'timeAct1SHA256': bindings['timeAct1SHA256'],
            'inputBindings': oracle.runtime_binding({
                'savedArtifactSHA256': bindings['savedArtifactSHA256'],
                'conditioningDataSHA256': PAYLOAD_SHA256,
                'conditioningMaskSHA256': MASK_SHA256,
                'nativeTextArtifactSHA256': native_hash,
            }),
        }
    result = {
        'schemaVersion': 'bernini-p4-real-text-l512-input-freeze/0.1',
        'status': 'INPUT_BYTES_VERIFIED_BEFORE_NUMERICAL_EXECUTION',
        'packetPath': str(packet_path), 'packetBytes': len(raw),
        'packetSHA256': PACKET_SHA256, 'payloadSHA256': PAYLOAD_SHA256,
        'headerSHA256': HEADER_SHA256, 'maskSHA256': MASK_SHA256,
        'shape': [1, 512, 4096], 'activeMaskEntries': int(mask.sum()),
        'allRowsPreserved': True, 'maskUsedAsMetadataOnly': True,
        'nativeTextPath': str(native_path), 'nativeTextBytes': len(native_raw),
        'nativeTextArtifactSHA256': native_hash,
        'f32PayloadBitPreserved': True, 'maskBitPreserved': True,
        'nativeMetadataAndHeaderPreserved': True,
        'artifactCommit': TEXT_ARTIFACT_COMMIT, 'producerCommit': TEXT_PRODUCER_COMMIT,
        'candidatePlanSHA256': oracle.PLAN_SHA256,
        'independentOraclePath': str(ORACLE_PATH), 'independentOracleSHA256': ORACLE_SHA256,
        'gates': plan['gates'], 'cases': cases,
        'modelWeightsOpened': False, 'numericalReferenceExecuted': False,
        'prefixOrTailRecomputed': False, 'patchCount': 0,
        'readiness': plan['readiness'],
    }
    oracle.private_write(Path(output_dir) / 'input-freeze.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--packet', type=Path, default=DEFAULT_PACKET)
    parser.add_argument('--tails-dir', type=Path, default=DEFAULT_TAILS)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.packet, args.output_dir, args.tails_dir), indent=2))


if __name__ == '__main__':
    main()
