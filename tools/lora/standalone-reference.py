#!/usr/bin/env python3
"""Development-only independent, bounded-memory LoRA full-value comparator.

No SDK, product planner, generated mapping table, or product arithmetic is
imported. Original safetensors headers and tensor bytes determine the oracle.
The base is an explicitly synthetic F32 model, never a Bernini base claim.

stdin consists of uint32-LE JSON length, UTF-8 JSON, then (for compare only)
count*4 little-endian actual F32 bytes. Every response is one JSON stdout line.
init: {sources:[{id,path,side}], cases:[{id,side,sources:[{sourceId,strength}],
       targetsFrom?:[sourceId], targetKeys?:[originalCanonicalTargetKey]}]}.
       targetsFrom defaults to ordered case sources;
       use it with sources:[] to verify base restoration over their full union.
       targetKeys is a development pilot selection of complete original tensors;
       its presence reports PARTIAL coverage and preserves full source totals.
compare: {caseId,targetKey,offset,count}; rows retain ALL original columns.
summary: nonterminal aggregate snapshot. finalize: terminal coverage verdict.

Call compare for the same target/tile across cases consecutively to reuse the
independent binary64 products. No dense model or all-output array is retained.
Use OPENBLAS_NUM_THREADS explicitly for a reproducible resource configuration.
"""
import argparse
from collections import Counter, OrderedDict
import hashlib
import json
import math
import os
import pathlib
import struct
import sys
import time

import numpy as np

POLICY = "comfy-lora-b5a4321-linear-diff-v1"
PROTOCOL = "lora-independent-stream/1"
BASE_FORMULA = "F32((originalFullElementCoordinate % 17 - 8) / 128)"
GATES = {"weight": {"absolute": 1e-5, "relative": 1e-4},
         "bias": {"absolute": 0, "relative": 0}}
MAX_FRAME_ELEMENTS = 1_048_576
MAX_HEADER_BYTES = 8 * 1024 * 1024


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key " + key)
        result[key] = value
    return result


def integer(value, label, minimum=0):
    if type(value) is not int or value < minimum:
        raise ValueError("Invalid " + label)
    return value


def finite(value, label):
    if type(value) not in (int, float) or not math.isfinite(value) or not np.isfinite(np.float32(value)):
        raise ValueError("Invalid finite F32 " + label)
    return value


def base_block(offset, count):
    # All integers are small and all base values are exactly representable.
    return ((np.arange(offset, offset + count, dtype=np.int64) % 17 - 8) / 128).astype("<f4")


class ArrayCache:
    def __init__(self, limit):
        self.limit = limit
        self.bytes = 0
        self.peak = 0
        self.hits = 0
        self.misses = 0
        self.entries = OrderedDict()

    def obtain(self, key, calculate):
        if key in self.entries:
            self.hits += 1
            value = self.entries.pop(key)
            self.entries[key] = value
            return value
        self.misses += 1
        value = calculate()
        if value.nbytes <= self.limit:
            while self.bytes + value.nbytes > self.limit:
                _, old = self.entries.popitem(last=False)
                self.bytes -= old.nbytes
            self.entries[key] = value
            self.bytes += value.nbytes
            self.peak = max(self.peak, self.bytes)
        return value

    def summary(self):
        return {"limitBytes": self.limit, "retainedBytes": self.bytes,
                "peakRetainedBytes": self.peak, "hits": self.hits, "misses": self.misses}


class Source:
    """Parse an original file independently, with no production classifications."""
    def __init__(self, config):
        self.id = config["id"]
        self.side = config["side"]
        if not isinstance(self.id, str) or not self.id or self.side not in ("HIGH", "LOW"):
            raise ValueError("Invalid source identity/side")
        self.path = pathlib.Path(config["path"]).resolve(strict=True)
        self.file_bytes = self.path.stat().st_size
        with self.path.open("rb") as handle:
            prefix = handle.read(8)
            if len(prefix) != 8:
                raise ValueError("Truncated original header prefix")
            size = struct.unpack("<Q", prefix)[0]
            if not 2 <= size <= MAX_HEADER_BYTES:
                raise ValueError("Original header budget exceeded")
            raw = handle.read(size)
            if len(raw) != size:
                raise ValueError("Truncated original header")
        self.header_hash = sha(raw)
        self.start = 8 + size
        header = json.loads(raw, object_pairs_hook=unique)
        if not isinstance(header, dict):
            raise ValueError("Original header must be an object")
        self.tensors = {key: value for key, value in header.items() if key != "__metadata__"}
        if config.get("headerSha256", self.header_hash) != self.header_hash:
            raise ValueError("Original header SHA-256 mismatch")
        if config.get("bytes", self.file_bytes) != self.file_bytes:
            raise ValueError("Original file byte length mismatch")
        self.claimed_source_hash = config.get("sourceSha256")
        self._validate_tensor_layout()
        self.operations = self._classify_originals()

    def _validate_tensor_layout(self):
        regions = []
        for key, tensor in self.tensors.items():
            if not isinstance(key, str) or not key or not isinstance(tensor, dict):
                raise ValueError("Invalid original tensor declaration")
            dtype = tensor.get("dtype")
            if dtype not in ("BF16", "F16", "F32"):
                raise ValueError("Unsupported original dtype " + key)
            shape = tensor.get("shape")
            if not isinstance(shape, list) or len(shape) > 2:
                raise ValueError("Unsupported original shape " + key)
            for dimension in shape:
                integer(dimension, "original shape", 1)
            offsets = tensor.get("data_offsets")
            if not isinstance(offsets, list) or len(offsets) != 2:
                raise ValueError("Invalid original data offsets")
            begin, end = [integer(value, "original data offset") for value in offsets]
            if end - begin != math.prod(shape) * (4 if dtype == "F32" else 2) or self.start + end > self.file_bytes:
                raise ValueError("Original tensor extent mismatch " + key)
            regions.append((begin, end))
        regions.sort()
        previous = 0
        for begin, end in regions:
            if begin != previous:
                raise ValueError("Original tensor data gap or overlap")
            previous = end
        if self.start + previous != self.file_bytes:
            raise ValueError("Trailing or missing original tensor bytes")

    def tensor(self, key, offset=0, count=None):
        declaration = self.tensors[key]
        total = math.prod(declaration["shape"])
        count = total - offset if count is None else count
        if offset < 0 or count < 0 or offset + count > total:
            raise ValueError("Original tensor read out of bounds")
        dtype = declaration["dtype"]
        width = 4 if dtype == "F32" else 2
        start = self.start + declaration["data_offsets"][0] + offset * width
        # Map only this requested original range, then close it after decoding.
        # Full-file mappings would accumulate resident source pages over 2,904
        # targets even though the numerical caches themselves remain bounded.
        raw = np.memmap(self.path, mode="r", dtype=np.uint8, offset=start, shape=(count * width,))
        try:
            if dtype == "BF16":
                values = (raw.view("<u2").astype("<u4") << 16).view("<f4")
            elif dtype == "F16":
                values = raw.view("<f2").astype("<f4")
            else:
                values = raw.view("<f4").copy()
        finally:
            raw._mmap.close()
        if not np.isfinite(values).all():
            raise ValueError("Nonfinite original tensor " + key)
        return values

    def _classify_originals(self):
        suffixes = ((".lora_down.weight", "down", "linear-down-up"),
                    (".lora_up.weight", "up", "linear-down-up"),
                    (".lora_A.weight", "down", "linear-a-b"),
                    (".lora_B.weight", "up", "linear-a-b"),
                    (".alpha", "alpha", None), (".diff_b", "bias", None), (".diff", "diff", None))
        groups = {}
        for key in self.tensors:
            match = next((entry for entry in suffixes if key.endswith(entry[0])), None)
            if match is None:
                raise ValueError("Unsupported original tensor suffix " + key)
            suffix, role, dialect = match
            stem = key[:-len(suffix)]
            if not stem:
                raise ValueError("Empty original target stem")
            group = groups.setdefault(stem, {})
            if role in group or (dialect and group.get("dialect", dialect) != dialect):
                raise ValueError("Duplicate or mixed original factor dialect")
            group[role] = key
            if dialect:
                group["dialect"] = dialect
        operations = {}
        for stem, group in groups.items():
            if "down" in group or "up" in group:
                if not all(part in group for part in ("down", "up")) or "diff" in group:
                    raise ValueError("Incomplete or conflicting original factors")
                down, up = (self.tensors[group[part]]["shape"] for part in ("down", "up"))
                if len(down) != 2 or len(up) != 2 or down[0] != up[1]:
                    raise ValueError("Original factor rank/shape mismatch")
                alpha = None
                if "alpha" in group:
                    if self.tensors[group["alpha"]]["shape"] != []:
                        raise ValueError("Original alpha must be scalar")
                    alpha = float(self.tensor(group["alpha"])[0])
                operations[stem + ".weight"] = {"shape": [up[0], down[1]], "variant": group["dialect"],
                    "down": group["down"], "up": group["up"], "rank": down[0], "alpha": alpha}
            elif "alpha" in group:
                raise ValueError("Unsupported orphan alpha")
            for part, ending, variant in (("diff", ".weight", "additive-diff"), ("bias", ".bias", "additive-diff-b")):
                if part in group:
                    shape = self.tensors[group[part]]["shape"]
                    if len(shape) not in (1, 2) or (part == "bias" and len(shape) != 1):
                        raise ValueError("Unsupported original additive shape")
                    operations[stem + ending] = {"shape": shape, "variant": variant, "delta": group[part]}
        if not operations:
            raise ValueError("No original supported patches")
        return operations

    def summary(self):
        variants = Counter(op["variant"] for op in self.operations.values())
        return {"id": self.id, "path": str(self.path), "side": self.side, "bytes": self.file_bytes,
                "headerSha256": self.header_hash, "sourceSha256Claim": self.claimed_source_hash,
                "fullFileHashComputedByOracle": False, "tensorCount": len(self.tensors),
                "patchCount": len(self.operations), "elements": sum(math.prod(op["shape"]) for op in self.operations.values()),
                "variants": dict(sorted(variants.items())), "dtypes": dict(Counter(t["dtype"] for t in self.tensors.values()))}


class Session:
    def __init__(self, factor_cache_bytes=64 * 1024 * 1024, delta_cache_bytes=32 * 1024 * 1024):
        self.factors = ArrayCache(factor_cache_bytes)
        self.deltas = ArrayCache(delta_cache_bytes)
        self.sources = {}
        self.cases = {}
        self.started = time.monotonic()
        self.reference_source_sha256 = sha(pathlib.Path(__file__).read_bytes())
        self.finalized = False
        self.failures = []

    def initialize(self, config):
        if self.sources or self.cases:
            raise ValueError("Session already initialized")
        if config.get("loaderPolicyId", POLICY) != POLICY:
            raise ValueError("Unsupported loader policy")
        for source_config in config["sources"]:
            source = Source(source_config)
            if source.id in self.sources:
                raise ValueError("Duplicate source identity")
            self.sources[source.id] = source
        for description in config["cases"]:
            case_id, side = description["id"], description["side"]
            if not isinstance(case_id, str) or not case_id or case_id in self.cases or side not in ("HIGH", "LOW"):
                raise ValueError("Invalid or duplicate case identity/side")
            contributions = []
            for item in description["sources"]:
                source = self.sources[item["sourceId"]]
                if source.side != side:
                    raise ValueError("Case/source side mismatch")
                strength = finite(item["strength"], "strength")
                contributions.append((source, strength))
            if len({source.id for source, _ in contributions}) != len(contributions):
                raise ValueError("Duplicate source in case")
            coverage_ids = description.get("targetsFrom", [source.id for source, _ in contributions])
            if not coverage_ids or len(set(coverage_ids)) != len(coverage_ids):
                raise ValueError("Explicit, unique original sources required for target coverage")
            if not {source.id for source, _ in contributions}.issubset(set(coverage_ids)):
                raise ValueError("Case contribution excluded from coverage")
            targets = {}
            for source_id in coverage_ids:
                source = self.sources[source_id]
                if source.side != side:
                    raise ValueError("Coverage/source side mismatch")
                for key, operation in source.operations.items():
                    if key in targets and targets[key] != operation["shape"]:
                        raise ValueError("Composition target original shape mismatch")
                    targets[key] = operation["shape"]
            full_source_target_count = len(targets)
            full_source_elements = sum(math.prod(shape) for shape in targets.values())
            coverage = "FULL"
            if "targetKeys" in description:
                selected = description["targetKeys"]
                if not isinstance(selected, list) or not selected or any(not isinstance(key, str) for key in selected):
                    raise ValueError("Pilot targetKeys must be a nonempty list of original target keys")
                if len(set(selected)) != len(selected):
                    raise ValueError("Duplicate pilot targetKeys")
                if any(key not in targets for key in selected):
                    raise ValueError("Pilot target key absent from independently parsed source union")
                targets = {key: targets[key] for key in selected}
                coverage = "PARTIAL"
            canonical = json.dumps(sorted(targets.items()), separators=(",", ":")).encode()
            self.cases[case_id] = {"id": case_id, "side": side, "contributions": contributions,
                "coverage": coverage, "fullSourceTargetCount": full_source_target_count, "fullSourceElements": full_source_elements,
                "coverageSources": coverage_ids, "targets": targets, "next": {key: 0 for key in targets},
                "expectedElements": sum(math.prod(shape) for shape in targets.values()), "targetSetSha256": sha(canonical),
                "comparedElements": 0, "failedElements": 0, "blocks": 0, "maxAbsolute": 0.0,
                "maxRelative": 0.0, "actualHash": hashlib.sha256(), "expectedHash": hashlib.sha256(),
                "traversalHash": hashlib.sha256()}
        if not self.cases:
            raise ValueError("At least one comparison case required")
        return {"ok": True, "protocol": PROTOCOL, "loaderPolicyId": POLICY, "gates": GATES,
                "referenceSourceSha256": self.reference_source_sha256,
                "base": {"kind": "synthetic-deterministic-F32", "formula": BASE_FORMULA,
                         "trainingBaseIdentityClaim": False},
                "maxFrameElements": MAX_FRAME_ELEMENTS,
                "sources": [source.summary() for source in self.sources.values()],
                "cases": [{"id": case["id"], "side": case["side"], "expectedTargets": len(case["targets"]),
                           "coverage": case["coverage"], "fullSourceTargetCount": case["fullSourceTargetCount"],
                           "fullSourceElements": case["fullSourceElements"],
                           "expectedElements": case["expectedElements"], "targetSetSha256": case["targetSetSha256"]}
                          for case in self.cases.values()]}

    def _delta(self, source, key, offset, count):
        operation = source.operations[key]
        cache_key = (source.id, key, offset, count)

        def calculate():
            if "delta" in operation:
                return source.tensor(operation["delta"], offset, count)
            rows, columns = operation["shape"]
            rank = operation["rank"]
            down = self.factors.obtain((source.id, operation["down"]),
                lambda: source.tensor(operation["down"]).astype(np.float64).reshape(rank, columns))
            up = source.tensor(operation["up"], offset // columns * rank, count // columns * rank)
            return (up.astype(np.float64).reshape(count // columns, rank) @ down).reshape(-1)

        return self.deltas.obtain(cache_key, calculate)

    def expected_block(self, case_id, key, offset, count):
        case = self.cases[case_id]
        shape = case["targets"][key]
        integer(offset, "full-coordinate offset")
        integer(count, "element count", 1)
        if count > MAX_FRAME_ELEMENTS or offset + count > math.prod(shape):
            raise ValueError("Comparison block out of bounds/budget")
        columns = shape[1] if len(shape) == 2 else 1
        if offset % columns or count % columns:
            raise ValueError("Comparison blocks must retain whole rows and ALL original columns")
        expected = base_block(offset, count)
        for source, strength in case["contributions"]:
            operation = source.operations.get(key)
            if operation is None or strength == 0:
                continue
            delta = self._delta(source, key, offset, count)
            scale = strength
            if "rank" in operation and operation["alpha"] is not None:
                scale *= operation["alpha"] / operation["rank"]
            scale = np.float32(finite(scale, "effective scale"))
            if "rank" in operation:
                # Round after each source's merge to model ordered F32 packages;
                # use independent binary64 products within each low-rank merge.
                expected = (expected.astype(np.float64) + float(scale) * delta).astype("<f4")
            else:
                # Multiplication and addition are separate F32 operations, as
                # required for exact additive bias values under the fixed rule.
                expected = (expected + (delta * scale).astype("<f4")).astype("<f4")
        if not np.isfinite(expected).all():
            raise ValueError("Nonfinite independent expected value")
        return expected

    def compare(self, header, raw):
        case_id, key = header["caseId"], header["targetKey"]
        case = self.cases[case_id]
        offset, count = header["offset"], header["count"]
        if key not in case["targets"]:
            raise ValueError("Target absent from independently parsed selected originals")
        if offset != case["next"][key]:
            raise ValueError("Comparison coverage must be contiguous, with no duplicate or skipped coordinates")
        expected = self.expected_block(case_id, key, offset, count)
        if len(raw) != count * 4:
            raise ValueError("Actual F32 payload length mismatch")
        actual = np.frombuffer(raw, dtype="<f4")
        finite_mask = np.isfinite(actual)
        differences = np.abs(actual.astype(np.float64) - expected.astype(np.float64))
        role = "bias" if key.endswith(".bias") else "weight"
        gate = GATES[role]
        tolerances = gate["absolute"] + gate["relative"] * np.abs(expected.astype(np.float64))
        failed = (~finite_mask) | (differences > tolerances)
        failure_count = int(np.count_nonzero(failed))
        finite_differences = differences[finite_mask]
        max_absolute = float(finite_differences.max(initial=0))
        nonzero = finite_mask & (expected != 0)
        max_relative = float((differences[nonzero] / np.abs(expected[nonzero].astype(np.float64))).max(initial=0))
        if failure_count and len(self.failures) < 16:
            indices = np.flatnonzero(failed)[:16 - len(self.failures)]
            for index in indices:
                self.failures.append({"caseId": case_id, "targetKey": key, "coordinate": int(offset + index),
                    "actual": float(actual[index]) if finite_mask[index] else str(float(actual[index])),
                    "expected": float(expected[index]), "absolute": float(differences[index]) if finite_mask[index] else None})
        case["next"][key] += count
        case["comparedElements"] += count
        case["failedElements"] += failure_count
        case["blocks"] += 1
        case["maxAbsolute"] = max(case["maxAbsolute"], max_absolute)
        case["maxRelative"] = max(case["maxRelative"], max_relative)
        case["actualHash"].update(raw)
        case["expectedHash"].update(expected.tobytes())
        case["traversalHash"].update(json.dumps([key, offset, count], separators=(",", ":")).encode() + b"\n")
        return {"ok": True, "passed": failure_count == 0, "failedElements": failure_count,
                "comparedElements": count, "cumulativeComparedElements": case["comparedElements"],
                "maxAbsolute": max_absolute, "maxRelative": max_relative}

    def summary(self, terminal=False):
        cases = []
        for case in self.cases.values():
            incomplete = [{"targetKey": key, "comparedElements": case["next"][key], "expectedElements": math.prod(shape)}
                          for key, shape in case["targets"].items() if case["next"][key] != math.prod(shape)]
            complete_targets = len(case["targets"]) - len(incomplete)
            cases.append({"id": case["id"], "side": case["side"],
                "coverage": case["coverage"], "fullSourceTargetCount": case["fullSourceTargetCount"],
                "fullSourceElements": case["fullSourceElements"],
                "sources": [{"sourceId": source.id, "strength": strength} for source, strength in case["contributions"]],
                "coverageSources": case["coverageSources"], "expectedTargets": len(case["targets"]),
                "completeTargets": complete_targets, "incompleteTargets": len(incomplete), "firstIncompleteTargets": incomplete[:8],
                "expectedElements": case["expectedElements"], "comparedElements": case["comparedElements"],
                "failedElements": case["failedElements"], "blocks": case["blocks"],
                "maxAbsolute": case["maxAbsolute"], "maxRelative": case["maxRelative"],
                "targetSetSha256": case["targetSetSha256"], "actualSha256": case["actualHash"].hexdigest(),
                "independentRoundedExpectedSha256": case["expectedHash"].hexdigest(),
                "traversalSha256": case["traversalHash"].hexdigest(),
                "passed": not incomplete and case["failedElements"] == 0})
        return {"ok": True, "protocol": PROTOCOL, "terminal": terminal,
                "coverage": "FULL" if cases and all(case["coverage"] == "FULL" for case in cases) else "PARTIAL",
                "passed": bool(cases) and all(case["passed"] for case in cases), "loaderPolicyId": POLICY,
                "comparison": "Every independently selected original full coordinate; no sampling", "gates": GATES,
                "base": {"kind": "synthetic-deterministic-F32", "formula": BASE_FORMULA, "trainingBaseIdentityClaim": False},
                "precision": "Independent NumPy binary64 products; ordered per-source F32 output rounding; exact F32 additive bias",
                "referenceSourceSha256": self.reference_source_sha256, "numpyVersion": np.__version__,
                "threadConfiguration": {name: os.environ.get(name) for name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS")},
                "elapsedSeconds": time.monotonic() - self.started,
                "sources": [source.summary() for source in self.sources.values()], "cases": cases,
                "failureSamples": self.failures, "cache": {"factors": self.factors.summary(), "deltaBlocks": self.deltas.summary()}}

    def handle(self, header, payload=b""):
        if self.finalized:
            raise ValueError("Session finalized")
        operation = header.get("op")
        if operation == "init":
            return self.initialize(header)
        if not self.cases:
            raise ValueError("Initialize the session first")
        if operation == "compare":
            return self.compare(header, payload)
        if operation in ("summary", "finalize"):
            self.finalized = operation == "finalize"
            return self.summary(self.finalized)
        raise ValueError("Unknown protocol operation")


def read_exact(stream, count):
    parts = bytearray()
    while len(parts) < count:
        part = stream.read(count - len(parts))
        if not part:
            raise ValueError("Truncated protocol frame")
        parts.extend(part)
    return bytes(parts)


def read_frame(stream):
    prefix = stream.read(4)
    if not prefix:
        return None
    if len(prefix) != 4:
        prefix += read_exact(stream, 4 - len(prefix))
    length = struct.unpack("<I", prefix)[0]
    if not 2 <= length <= 1024 * 1024:
        raise ValueError("Protocol JSON header budget exceeded")
    header = json.loads(read_exact(stream, length), object_pairs_hook=unique)
    if not isinstance(header, dict):
        raise ValueError("Protocol header must be an object")
    count = integer(header.get("count"), "protocol element count", 1) if header.get("op") == "compare" else 0
    if count > MAX_FRAME_ELEMENTS:
        raise ValueError("Protocol actual payload budget exceeded")
    return header, read_exact(stream, count * 4) if count else b""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--factor-cache-mib", type=int, default=64)
    parser.add_argument("--delta-cache-mib", type=int, default=32)
    args = parser.parse_args()
    if not 0 <= args.factor_cache_mib <= 1024 or not 0 <= args.delta_cache_mib <= 1024:
        parser.error("cache limits must be between 0 and 1024 MiB")
    session = Session(args.factor_cache_mib * 1024 * 1024, args.delta_cache_mib * 1024 * 1024)
    try:
        while (frame := read_frame(sys.stdin.buffer)) is not None:
            header, payload = frame
            result = session.handle(header, payload)
            print(json.dumps(result, separators=(",", ":"), allow_nan=False), flush=True)
            if session.finalized:
                return 0 if result["passed"] else 2
        raise ValueError("Protocol EOF before finalize; no completed acceptance verdict")
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(json.dumps({"ok": False, "error": str(error), "errorType": type(error).__name__}), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
