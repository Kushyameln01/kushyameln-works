"""Check independently fixed full-case stream/frame/patch boundary landmarks.

This opens only retained input files; it never opens a model or hidden store.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SPEC = importlib.util.spec_from_file_location('production_independent_reference', ROOT / 'tools/diffusion-models/production-reference.py')
REFERENCE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REFERENCE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    manifest = REFERENCE.read_json(args.manifest)
    assert manifest['profileId'] == REFERENCE.PROFILE
    owner = REFERENCE.InputSequence(manifest)
    # These landmarks are fixed independently from this case's explicit
    # target/source F21 patch grid30x52 and three image patch grids53x53.
    landmarks = [(0, 0, [0, 0, 0]), (1559, 0, [0, 29, 51]), (1560, 0, [1, 0, 0]), (32759, 0, [20, 29, 51]), (32760, 1, [0, 0, 0]), (65519, 1, [20, 29, 51]), (65520, 2, [0, 0, 0]), (68328, 2, [0, 52, 52]), (68329, 3, [0, 0, 0]), (71137, 3, [0, 52, 52]), (71138, 4, [0, 0, 0]), (73946, 4, [0, 52, 52])]
    hashes = []
    try:
        for row, stream_id, position in landmarks:
            patches, positions, source_ids = owner.rows(row, 1)
            assert source_ids == [stream_id]
            assert positions.tolist() == [position]
            tensor = owner.streams[stream_id]['values']
            t, h, w = position
            # Gather by explicit scalar coordinates to compare against the
            # reference's block-slice/reshape channel-major patch extraction.
            scalar_values = [tensor[0, c, t, 2*h + dh, 2*w + dw] for c in range(16) for dh in range(2) for dw in range(2)]
            assert REFERENCE.np.array_equal(patches[0].view('<u4'), REFERENCE.np.asarray(scalar_values, dtype='<f4').view('<u4'))
            hashes.append({'globalToken': row, 'sourceId': stream_id, 'position': position, 'patchSHA256': hashlib.sha256(patches.tobytes()).hexdigest()})
        for start, ids in [(32759, [0, 1]), (65519, [1, 2]), (68328, [2, 3]), (71137, [3, 4])]:
            assert owner.rows(start, 2)[2] == ids
        try:
            owner.rows(73947, 1)
            raise AssertionError('Out-of-range token accepted')
        except ValueError:
            pass
    finally:
        owner.close()
    receipt = {'passed': True, 'manifestSHA256': REFERENCE.file_sha(args.manifest), 'totalTokens': 73947, 'landmarks': hashes, 'crossStreamChunks': 4, 'outOfRangeRejected': True, 'modelWeightsOpened': False, 'fullStoresAllocated': False}
    REFERENCE.write_json(args.receipt, receipt)
    print(json.dumps({'passed': True, 'landmarks': len(landmarks), 'crossStreamChunks': 4, 'outOfRangeRejected': True, 'modelWeightsOpened': False, 'fullStoresAllocated': False}))


if __name__ == '__main__':
    main()
