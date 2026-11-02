# Text standalone T1–T3

The frozen plan has nine numeric cases, nine NN0 rejection cases and nine cancellation/publication controls. The numeric cases include empty plain text; multilingual text with newlines; exactly512 tokens including EOS; explicit ID lengths1,2,511,512; ID0 and256383; internal and trailing masks; and512 active positions. The requested511/512 masked cases use short active prefixes. Dense512 positions are exercised by both the long plain case and the all-active ID case. The two-token ID case reads only block0 as a Uint8Array; all remaining graphs and the original model stay File-backed.

The source oracle loads each original block once and runs every case separately at batch1 and512 positions. It retains original scaled-FP8-to-FP32 conversion, pinned source and CPU adapters. Final normalization and masked zeroing run at512 before the reference is sliced to the requested native ID length. Cases are never batched together or shortened in the source oracle. The selected final max-absolute/atol/rtol gates remain0.001. No graph export is required.

From the repository root, use a committed execution source whose bytes match these tools. Replace `TEXT_SOURCE_SHA` below with that full40-character commit. Each output directory must be fresh. Run the oracle to completion before starting Chromium or another model job.

```sh
python tools/inference/text-encoder/plain_reference.py \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --model /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --deps /workspace/work/inference/vae-proof/deps \
  --tokenizer-deps /workspace/work/inference/tokenizer-python \
  --execution-source-sha TEXT_SOURCE_SHA \
  --output /workspace/work/inference/standalone-20261102/text-oracle

python tools/inference/text-encoder/accept_plain.py \
  --plan development/inference/standalone-20261102/text/predeclared-plan.json \
  --bundle /workspace/work/inference/text-implementation/bundle \
  --source /workspace/work/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
  --reference /workspace/work/inference/standalone-20261102/text-oracle \
  --execution-source-sha TEXT_SOURCE_SHA \
  --case-id id-l512-all-active --skip-controls \
  --output /workspace/work/inference/standalone-20261102/text-canary
```

After the512-active canary's numeric and resource results are reviewed, invoke the same browser command with a fresh output directory and repeat `--case-id` for the remaining eight IDs in the plan, omitting `--skip-controls`. This avoids rerunning the completed canary. Controls run only until their observed boundary, followed by one normal recovery on the same API after `cancel-run`. Each successful output and that recovery are compared against every independent reference value. Counts distinguish native job attempts, completed full neural runs and cancelled jobs.

For T1 alone, append `--preflight-only` to the oracle command with a fresh output, then point the browser command's reference at it and append `--preflight-only`. Python/browser tokenizer IDs and masks, overflow, mixed input modes and invalid ID/mask contracts are checked with zero Workers and zero neural runs. A localhost HTTP server and Chromium require permission to bind local sockets in the managed shell.

Cancellation evidence records the observed worker boundary followed by owner termination; it does not assert an exact paused ORT operation. The save control invalidates a host revision after the real tensor serializer starts its awaited hash, then confirms no download is published. It does not claim that `textEncoder.cancel()` aborts serialization. The recovery advances the native input revision, executes the real worker and returns its complete short output for the independent comparator.

Historical single-prompt commands, output names and fixed512 comparator defaults remain supported. New evidence is separate from the old Hello-world acceptance. T2/T3 numeric and resource acceptance remain pending until the committed-source runs finish; production generation readiness is unchanged.
