# Indexed runtime integration candidate — 2026-10-18

This is an unpublished integration candidate, build `vr180-b8-indexed-candidate`.
It does not change public main, GitHub Pages deployment, or ChatGPT Sites.
The existing public/default conversion limit remains **1 GiB**. Passing a separate
private large-file trial does not qualify this adapter for 5–10 GB inputs.

## Implemented contract

- `settings.executionRoute === 'indexed'` selects the new route only for conversion
  with a preselected file handle. Existing inspect, metadata copy, prepared-output
  conversion and OPFS-free direct conversion retain their original route.
- Runtime modules live under `docs/shared/vr180/indexed/`. A dedicated combined
  Mediabunny fork is loaded lazily once per indexed Worker; the original shared
  media vendor is unchanged. Source archive, supplements, two patches, license,
  pinned toolchain and an offline reproduction script accompany the fork.
- Strict H.264 SDR/equirectangular input admission is unchanged. The private fixture
  parser opt-in and private 5/10 GB output profiles are absent. Limits remain
  100,000 samples, 16 MiB metadata and 8 MiB explicit index reservations. The latter
  is not a whole-browser or codec memory limit.
- The indexed runtime commits once, verifies the saved metadata, reparses the file,
  and retains an immutable saved observation before later cleanup or cancellation.
  Worker receipts adapt this observation without a second tag/finalize/commit.
  Whole-output SHA is observed after commit; only metadata has a prewrite comparison.
- A bounded identity header and two ownership tickets are written, flushed, read
  back, closed and reread before index use. Cleanup verifies ownership and obtains
  leases. Partial/unknown state is retained. Recovery never deletes external output.
- Client handling separates saved-output knowledge from internal-index cleanup.
  A verified result arriving during cancellation remains evidence, without becoming
  UI success. A duplicate terminal message cannot replace the first saved receipt.
  Unsupported profiles/input limits/missing handles terminate before vendor loading.

## Local validation before native trial

The main-agent regression set passed **181 Node tests** across client, Worker,
cleanup, direct output, file output, save record, legacy transform, indexed transform,
distribution runtime, entry and ownership registry. Independent review reproduced
and rechecked the two cancellation/duplicate-receipt regressions. Seven Python
evidence-boundary tests passed. These checks do not establish browser encoding.

All 25 generated distribution files compare exactly with the reviewed source.
Rebuilding from the distributed source produces the combined module SHA-256
`65a96894f5442fe92d3672e09b80e6841b7a30a745b002b071636352f5b790cd`.
An isolated static export validated the explicit 130-file candidate inventory.

## Native acceptance procedure

`tools/vr180/probe-indexed-entry.py` uses the real `StereoClient` and product Worker
in sandboxed Chrome. Its dedicated Actions trigger is `[vr180-indexed-entry]`.
It performs twelve operations: inspect, metadata copy, legacy prepared/direct,
unsupported indexed-profile rejection, then SBS/TB AAC, SBS/TB silent, TB360 AAC,
early cancellation and same-handle retry. Nine complete MP4 outputs are expected.

Acceptance requires the fixed checkout and served-byte inventory, codec module
isolation, operation/input-generation agreement, schema-2 save facts, bounded physical
ownership-record bytes and hashes, native `isSameEntry` on retry, index/lease cleanup,
complete browser downloads and recovered input/output hashes. Early cancellation
does not establish cancellation after output writes. Media acceptance remains pending
until the recovered MP4s pass the separate FFmpeg/metadata verifiers.

The native adapter trial and candidate UI connection are pending in this snapshot.
No OS picker, target VR-player, real-camera quality, novice-usability or public
deployment acceptance follows from local tests. ChatGPT Sites changes are delegated
to Works; this environment prepares reviewable source and evidence only.

## Separate large-file qualification

The accepted 5 GB trial is run `39093517116` at
`8fd5ef15f012c54774aa4d7b7984026a1527de0c`; its sanitized acceptance record is
[`evidence/2026-10-18-p5-5gb.json`](evidence/2026-10-18-p5-5gb.json).
The single 10 GB run `39096296302` uses fixed commit
`a0e5cc8178b29d5f263636f7790b309db1d97cdf`. It was still running when this
integration snapshot was prepared. It does not contain the adapter changes here.

## Recovered results after the initial snapshot

The same 10 GB run completed successfully in both producer and separate receiver.
The [sanitized acceptance record](evidence/2026-10-18-p5-10gb.json) records 50,397
frames, 10,002,254,447 input bytes, 9,995,870,920 output bytes and independent review.
The aggregate quality profile passed; three decoded positions per eye were below
the diagnostic 30 dB floor. This result remains separate from adapter qualification.

Initial adapter run `39104394239` at `984b0b790e10e869c918b227f42411c826e55a60`
failed while downloading the legacy prepared output. The harness disposed its Worker
and deleted its temporary OPFS file before the browser download. Inspection, metadata
copy and generation of the legacy prepared output had passed; one copy MP4 was fully
recovered and independently verified. The harness must keep that owner alive until
download completion and full hash verification, then acknowledge cleanup. No product
codec change or relaxation of acceptance criteria is warranted by this failure.
