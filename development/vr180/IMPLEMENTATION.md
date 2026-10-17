# VR180 browser b1 execution contract

2026-10-17 JST. Parent: VR180_Browser_Implementation_Plan_2026-10-17.md 1.1 (SHA256 2007a3ce2c02ae4e8ed382e8328bb027bfff0b087792b8b560322c11a45456cd). This fixes the first experimental implementation, not the whole product's final supported inputs. User authorized implementation after the attached audit.

## Goal and initial boundary

Goal: 動画をVR180動画として、ブラウザ上で簡単に加工できること. Input is confirmed VR180 capture / stereo video, not ordinary 2D.

- b1 accepts one non-fragmented MP4 with one H.264 SDR video track and zero/one AAC audio track. Stereo is already packed left/right or top/bottom; the user explicitly confirms equirectangular projection and per-eye 180x180 or 360x180 degrees. Existing conflicting/unknown projection metadata is rejected, not guessed from aspect ratio. This b1 gate additionally requires square per-eye raster for 180 and 2:1 per-eye raster for 360; this is an explicit implementation limit, not projection inference. The geometry helper itself supports other confirmed raster shapes, but the public worker gate does not yet admit them.
- Route A: unchanged 180-degree samples, metadata-only export; no resize, crop, eye swap, codec or audio changes. Keep packed layout and exact sample/timing data. Append rewritten moov and turn old moov into free, preserving media offsets. Reject structures whose preservation cannot be established.
- Route B: actual pixel transformation: 360-degree input central 180-degree crop, or top/bottom to left/right repacking, optional output downscale with explicit dimensions. Same transformation for each corresponding eye. Output per-eye square, SBS, H.264/AAC MP4. No implicit frame dropping or silent audio loss.
- AAC leading-trim admission is narrowed to the independently checked remux contract: one rate-1 edit with nonnegative media time, no trailing trim/extension; original audio packets retain negative presentation timestamps. The pinned muxer movie timescale is 57600. The selected audio end must map to an integer movie tick, and the muxer's separately rounded duration plus start offset must equal that end tick. Runtime additionally requires contiguous AAC packet times on the audio sample grid. Any condition failure rejects conversion; it never silently strips the edit list, drops audio, or substitutes audio re-encoding. Video leading edits remain rejected unless the existing video condition holds. Node compressed-packet remux evidence alone does not certify the browser pixel route. The pinned muxer does not reproduce AAC seek-preroll sample groups (sgpd/sbgp roll/prol); sequential decode evidence is not random-seek evidence. This remains a release-blocking compatibility check for Route B, not a claim of complete audio-track metadata preservation. Route A retains original boxes.
- Output contract is Spherical Video V2 cropped equirectangular 180x180 stereo (`st3d`, `sv3d/equi`); not a claim of Google's native camera mesh-format conformance. Compatibility with a named VR headset/player remains NOT VERIFIED until that consumer is available. Desktop codec playback and independent viewport rendering are separate evidence.
- Native fisheye/mesh, camm stabilization, unknown calibration, HDR, extra/data tracks, separate-eye files are explicitly rejected in b1 and remain future product work. This is implementation order, not deletion of the parent plan's functionality.

## Audit A1: separate-eye contract before any future acceptance

Do not equate two zero PTS values with the same capture time. No separate-eye merge is enabled in b1. For later adoption: identify pair and left/right assignment; require common capture timestamps or measured shared events; record mapping tCommon = scaleEye * tEye + offsetEye, its provenance, units and uncertainty. Check start/middle/end events and frame cadence. Do not infer drift correction from a single event. Missing-eye intervals, unknown pairing/timebase, excessive residual or unverifiable drift cause rejection. Choose common overlap and one audio source explicitly; no unrequested mixing, extension or synthetic missing frames. Define a measured application-specific synchronization tolerance before that experiment, not retrospectively. Rejection tests are valid now; successful separate-eye synchronization cannot be claimed.

## Resource and state contract

- Module Worker owns input, decoder, encoder, canvases and temporary output. Samples close in finally; only a finite number are held and awaited. Main UI has operationId + inputRevision and rejects stale success/error/progress. Hard worker termination after cancellation is allowed only with cleanup of its known temporary directory by the main owner.
- Parse bounded metadata (16 MiB moov candidate budget); never read full input solely for metadata. Patcher exports Blob slices retaining source bytes and streams to chosen destination. Zero-size atom / fragmented / external data / unsupported offsets are rejected when appending would change semantics.
- Transform output uses OPFS random-access temporary storage. Keep a successful result until completed save or explicit result disposal; returning a File alone is not proof of consumption. Remove failed/cancelled job storage. Confirm free capacity and bound output bytes (initial experimental cap 1 GiB) and total samples (100000); caps are distinct from total memory. MP4 index/mux metadata remains O(samples). If streaming/OPFS unavailable, do not silently use an unbounded RAM muxer.
- Measure metadata scan, conversion, mux/finalize, metadata patch, output preparation and save separately. UI download click does not mean recovery. CPU/GPU/native peak is null unless observed. Include inputRevision, settings, build, timestamps, file sizes and available hashes in local receipt; no new remote telemetry.

## Minimal experiment, before expansion

Two adopted routes therefore require two roundtrips. Synthetic packed stereo fixture: known left/right labels, angular grid, moving object shared at equal presentation time, colored orientation boundaries and timed audio beeps. Generate independently with Python/FFmpeg, record script and SHA256. Expected crop/layout is derived geometrically and checked separately, not by reusing production functions.

1. Metadata route: input 180 SBS H.264/AAC -> stored MP4. ffprobe and independent MP4 parser identify stereo/equi; compare encoded packet hashes, PTS/DTS/duration and audio against original. Repeated tagging must not accumulate active conflicting metadata. Reject malformed and conflicting inputs.
2. Pixel route: 360 TB -> 180 SBS, and 180 TB -> SBS. Read saved output with FFmpeg, compare eye regions/direction/short events and audio synchronization. Keep presentation timing; regenerate DTS for the new encoding. Test cancellation, late response, then successful retry.
3. Test 4096x2048 stereo180 short interval and longer same-dimension interval if codec permits, before committing to resource architecture. Record codec rejection as a limit, not success. Track index/mux growth, audio waiting, output temporary storage, postprocess I/O as well as frame count. No promise of general 4K/8K or arbitrary duration yet.
4. Candidate: isolated owner-private Sites staging, same static files destined for Works. Browser QA through available permitted tooling (TinyFish first candidate); actual input and recovery required. No ad hoc local server when Sites managed preview forbids it. If cloud access/capability blocks a gate, preserve that blocker and continue independent code/fixture tests.
5. Independent playback: ffprobe + FFmpeg viewport rendering and available browser video decoding establish only those conditions. A target VR player/version or headset is not supplied/available yet; investigate available independent player route before requesting user work. Do not report full VR consumer interoperability or novice usability from developer operation.

## Preimplementation and release gates

Read/critique this contract before production code. Fix findings and recheck. Meaningful failing tests precede code. Reviewer checks actual outputs; independent auditor checks goal/procedure. Documentation/log updates precede implementation changes. Existing FT/Unity/media-basic remain unchanged; importing the existing pinned vendor does not modify their code.

Sites is the staging environment; Pages production follows only after required candidate evidence. A private staging publication is an experiment with restricted audience, not a declaration of product completion. Public Pages release and full-product completion remain gated on the unresolved consumer/input contract; do not change audience or publish partial functionality as full completion. Current implementation request authorizes source development and staging work, not arbitrary third-party video uploads.

## Fixed sources and audit mapping

- Works initial base: 0ee9b175b75890f42c965770af0d06b0b77cd003, confirmed through GitHub connector at implementation start. Fast-forwarded to concurrent main 34368e769def983d7709ed21a6ac4a93c9b4b2b4 before commit; existing compute preparation recovery retained without edits.
- Mediabunny 1.61.5, existing official vendor archive/bundle and MPL-2.0 license under docs/shared/media-basic/vendor; no modification. Validate installed API, not latest docs assumptions.
- Google spatial-media: 2308497c39bb604a7c3ba56ac17e302f2b1b6a96, docs/vr180.md and docs/spherical-video-v2-rfc.md.
- Technical Tips: document1.2, Library libfile_4a72acc0497881918259f559cdf3bef0 (audit identifies saved version2). Locally available earlier copy is not silently relabeled that version.
- Saved workflow: libfile_6ef17a0847c4819196e76712738e1756; existing reference_workflow.md is a saved procedure, not full chat. Original full chat remains unavailable.
- Audit A1 addressed by separate-eye rejection plus future acceptance contract; A2 early representative resolution/storage check; A3 fixed identifiers; A4 both adopted routes require testing; A5 usability evidence records operator experience/instructions.

At the original contract freeze, not yet observed: browser execution, saved output playback, target VR consumer, real camera footage, practical full-length scale or speed improvement. See RESULT.md for subsequent cloud execution, diagnostic findings and the remaining gates; this sentence records the original baseline.

## Diagnosis revision after first cloud trial

Keep Route A/B contracts unchanged. First cloud trial reached Route A prepared state but returned only an edited automation report, not recovered media. Route B failed at combined decoder/encoder capability validation. Revision vr180-b1-diag1 adds nullable per-direction capability results and required configurations to failure metrics, carries failed status with operationId/inputRevision through the existing Worker boundary, and exports the local failure receipt from the diagnostics area. A failure never exposes a successful result or downloadable media. Existing cleanup and stale-response checks remain mandatory. Real codec capability values require the next browser observation; Node tests only validate transport/state behavior.
