# Separate-receiver short calibration wrapper (private)

This gate transports a **new execution** of the existing, unchanged `p5-calibration-prototype/probe-calibration.py --case 32-32` before attempting the long-media experiment. It does not generate media, repeat the codec operation, raise a public limit, or establish 5/10 GB capacity. The original 300-frame calibration remains unchanged.

The workflow must run the original calibration and this wrapper consecutively in the same candidate checkout/job:

```sh
python development/vr180/p5-receiver-calibration/prepare.py \
  --calibration-output "$RUNNER_TEMP/fresh-calibration" \
  --output "$RUNNER_TEMP/receiver-calibration"
```

Both paths must be separate directories under `RUNNER_TEMP`, outside the checkout; output must not exist. Required identity is `Kushyameln01/kushyameln-works`, candidate ref `refs/heads/codex/vr180-plan-*`, current `GITHUB_SHA`, run/attempt, and `GITHUB_JOB=p5-receiver-calibration`. The fixed profile is `p5-receiver-calibration32`. Original run ID must equal `<runId>-p5-32-32-<runAttempt>`.

The original report has **no GITHUB_JOB field**. Same-job attribution comes from the fixed workflow's consecutive commands, not an invented field in the old report. The original report independently binds run, attempt, commit and case. The wrapper records this limitation in `wrapper-provenance.json`.

## Admission and source provenance

The wrapper requires the original READY report, native committed output, complete downloads, zero remaining indexed resources/locks, removed owned namespace, and all required verifier and packet scans through EOF. It binds media size/hash to browser, original media manifest, and independent verifier records. It calls the **original** `calibration_verdict` on the saved independent verification and packet statistics and requires agreement with both saved verdicts. Complete quality `PASS` and `FAIL` are transported unchanged. Incomplete scans, missing metadata, or inconsistent reports produce no source manifest.

`ORIGINAL_SOURCES` covers the fixed calibration generator, frame helper, conversion/runtime modules, public geometry/save/hash/input parser, shared native harnesses and independent verification helpers. Every source must equal its tracked HEAD bytes, and the original before/after source maps must equal those same hashes. The wrapper checks this closure before importing the original verdict and again before publication. `sourceSHA256` identifies `prepare.py`; `generator.producerSHA256` identifies the unchanged original calibration script. `wrapper-provenance.json` contains both and the full map. A test compares the explicit closure to the original producer's actual dependencies.

## Transport contract

`output/media/` contains:

- `input.mp4` and `output.mp4`: each positive and at most 80 MiB; sum at most 120 MiB. Copy uses 1 MiB chunks, `flush`/`fsync`/close, then a complete independent reread hash. Original files are not modified.
- `quality-evidence.json`: at most 64 KiB, schema `vr180-p5-long-quality-evidence-v1` (existing generic transport schema name), short profile, six-field identity, actual media hashes, source hash, full-scan status, preserved media verdict and references.
- `producer-evidence.tar.gz`: at most 8 MiB compressed, 16 MiB sum of raw regular-file payloads, at most 256 regular files. Entries are exactly `quality-evidence.json` plus every referenced metadata file. The archive has no symlinks, directories, media or arbitrary paths. Every raw entry is reopened and hashed after archive creation. The wrapper refuses detected credential/signed-URL forms; it never redacts original evidence.
- `source-manifest.json`: schema `vr180-segmented-source-v1`, `GENERATED_AND_REREAD`, two files ordered input/output, `partBytes=134217728`, media-only `totalBytes`, fixed generator descriptor, raw quality descriptor, and `evidenceBundle={name,bytes,sha256}`.

`output/evidence/` has the exact raw quality file, copied originals under `calibration/`, `calibration-media-manifest.json`, and `wrapper-provenance.json`. Original evidence `manifest.json` is checked against the complete original file set before copying. All original zero-byte stderr files remain present and are referenced with `bytes=0`; this allowance belongs only to the short calibration profile. Quality references are at most 255 because the quality file itself consumes one archive entry. The sender uploads two media parts, then the evidence artifact (`evidence.bin` as a single ZIP entry), then completion. Evidence bytes do not count toward media totals.

The wrapper's successful exit means readiness for transfer, **not** receiver recovery or independent receiver quality acceptance. Those remain `PENDING`. The receiver must check the raw evidence bundle, exact tar entry set, every quality reference, original evidence manifest, whole media hashes, then rerun the fixed independent media oracle. A complete quality FAIL remains evidence and does not become PASS merely because transport succeeds.

## Bounds and failure cleanup

Metadata uses bounded reads (4 MiB per file, 16 MiB total archive payload); media is never read into one array. The wrapper has a monotonic 180-second deadline with mandatory checks before and after final source-manifest publication. Any exception independently attempts to roll back every file created by this invocation by device/inode identity only. Unknown replacements and individual cleanup failures are retained as `HOLD`; they do not skip other cleanup or replace the primary error. The CLI reports the held count and at most eight details. Original input is never deleted. Empty owned directories may remain for diagnosis. A failed preparation never reports readiness, even if failed cleanup leaves a previously created manifest on disk; the workflow must require a successful exit before sending. The CLI emits a bounded JSON result rather than transporting media through logs.

This wrapper does not supply crash recovery, a save dialog, VR-player validation, real-camera quality, large AAC or long-media acceptance. The calibration media still uses the original browser configuration; this gate does not claim persistent-profile storage solely from the separate 16 MiB capability experiment.

## Local validation

```sh
python -m unittest discover -s development/vr180/p5-receiver-calibration -p 'test_*.py' -v
```

The tests use deliberately non-media tiny bytes and synthetic reports. They exercise identity/closure binding, exact raw bundle recovery, complete quality FAIL preservation, missing EOF rejection, bounds, corruption, signed URL/unknown file rejection and owned rollback. They are not native browser, media quality or Actions artifact-service tests. Native generation, transfer and separate-receiver acceptance are subsequent gates.
