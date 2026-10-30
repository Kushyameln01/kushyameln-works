# LoRA implementation contract, revision 2

User authorized implementation on 2026-10-31 JST, based on SOURCE_PLAN.md (LoRA scope).
- Latest user correction: direct original .safetensors in USER TERMINAL LOCAL FOLDER; no site upload or browser-persistent registration. Folder is selected with native browser file permission and File.slice. Both HighNoise/LowNoise are discovered as a pair. This supersedes administered-source primary input.
- light: Bernini-R_LightX2V_{high,low}_noise.safetensors; detail: NSFW-22-{H,L}-e8.safetensors.
- Independent API integrates with another Codex's inference modules and their coordinated UI.
- Hike WASM performs low-rank product, scaling, additions and dtype conversion. No JS numerical fallback.
- Preserve immutable base, explicit complete target mapping, application revision, cancellation, rollback and ownership.
- Previous revision selected Pages catalog/external source delivery. Retained only as optional programmatic provider; revision2 local folder is primary. No publication/upload authorized.

As-is: four originals at /workspace/work/lora/{light-safetensors,detail-safetensors}; upstream consumer/base model/ONNX graph and real ComfyUI reference outputs not supplied. Independent API/kernel/provider tests can proceed. Actual upstream inference integration, final accuracy/performance and production delivery remain NOT VERIFIED until those dependencies are available. Never substitute fixture success for these gates.

Implementation decisions: ES modules + bounded block operations, target-owned transactional sink/package loader. target registry must explicitly identify model/graph/initializer mapping; this component never guesses fused/transposed target mappings. Initial numerical profile F32 application, BF16/F16/F32 source; quantized, Conv and specialized variants explicitly rejected.

Sources: Hike Space page_3146974dd7248191bdcc4ef6bb1ac63d and page_59933a2efe9c81919f9f1040992aa690 read; compiler pinned 3c51fde6675f317453919bd505d0e2d0f638e7f1. ComfyUI b5a432157de6b8884f81104cd02926adf4d597e4 comfy/weight_adapter/lora.py: absent alpha means scale=1; present alpha/rank. comfy/lora.py: .diff and .diff_b additive weight/bias patches. These policies are explicit, not metadata-inferred base compatibility.
