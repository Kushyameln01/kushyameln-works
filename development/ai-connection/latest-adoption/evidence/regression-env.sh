#!/usr/bin/env bash
# Source this file before the complete historical Node regression suite.
# Exact retained roots; no adoption-pin substitutions.
# Source: development/ai-connection/p4-management/REGRESSION-ENVIRONMENT.json,
# normal-execution/VERIFY.md and normal-r13/runner/SOURCE-FREEZE.json.
export WORKS_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/2c171a0
export WORKS_NATIVE_CODEC_PATH=/workspace/work/ai-connection/resume/native/2c171a0/docs/shared/inference/tensor.mjs
export WORKS_LORA_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/dcb1f50
export WORKS_DIFFUSION_NATIVE_ROOT=/workspace/work/ai-connection/resume/native/438972f
export WORKS_VAE_PROFILE_ROOT=/workspace/work/ai-connection/resume/native/7e09119
export WORKS_ADOPTED_LORA_ROOT=/workspace/work/ai-connection/e1-adopt/native/0c27874
export WORKS_ADOPTED_DIFFUSION_ROOT=/workspace/work/ai-connection/resume/native/438972f
export WORKS_RECT_DIFFUSION_ROOT=/workspace/work/ai-connection/e1-adopt/native/5f880fd
export WORKS_RECT_VAE_ROOT=/workspace/work/ai-connection/profile-adopt/native/855f435
export WORKS_SNAPSHOT_LORA_ROOT=/workspace/work/ai-connection/profile-adopt/native/fc2789a
export WORKS_SNAPSHOT_DIFFUSION_ROOT=/workspace/work/ai-connection/e1-adopt/native/5f880fd
export WORKS_NORM_RECT_NATIVE_ROOT=/workspace/work/ai-connection/profile-adopt/native/855f435
export WORKS_NORM_RECT_INPUT=/workspace/work/ai-connection/vae-dispatch-discovery/restored.wktensor
export WORKS_LORA_ADMISSION_ROOT=/workspace/work/ai-connection/owner-data-r6/82cd9bb
export P4_NATIVE_SOURCE_ROOT=/workspace/work/ai-connection/p4-r11/native-source
export WORKS_N2_TAIL_NATIVE_ROOT=/workspace/work/ai-connection/n2-tail-r7/native/a49aac4
export NORMAL_VAE_NATIVE_ROOT=/workspace/work/ai-connection/normal-r13/runner/native-vae-498
export NORMAL_P4_NATIVE_SOURCE_ROOT=/workspace/work/ai-connection/normal-r13/runner/native-p4-30e
# Run from full-route-r17/checkout after source freeze:
# node --test --test-isolation=none tools/ai-connection/test-*.mjs
