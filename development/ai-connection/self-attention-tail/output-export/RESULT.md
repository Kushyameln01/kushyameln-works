# Accepted tail output persistence

HIGH1 and LOW3 each ran the immutable tail once in a separate persistence replay. All five output F32 hashes matched the existing accepted tail receipt exactly in browser memory and again after JSON serialization in Python. This saved the accepted output bits for the next cross-attention task; it adds no numerical acceptance or resource-budget measurement. The accepted runtime, harness, receipts, gates and resource metrics remain unchanged.

New private directory: `/workspace/work/diffusion-private-tail-saved-outputs-20261101/` (0700). Both files are 0600 and were created exclusively:

| Side | Private file | Private artifact SHA256 |
|---|---|---|
| HIGH1 | `high-tail-outputs.json` | `5040656cf0bf6bd9f06bbf007b16d22ae026a25a5080d666758e0b52a10e86bd` |
| LOW3 | `low-tail-outputs.json` | `714d96b41cb9e5ba8349b4a9202722f2f94e3fdeeaa984dbc1850b449190d37d` |

Each private artifact has schema `bernini-self-attention-tail-saved-outputs/0.1`, all five arrays at `arrays.{o,gateProjection,gate,gated,residual}`, their shapes/F32 identities, all three exact inputs at `inputs.{attention,patchHidden,timeAct1}`, and full `source`, `inputBindings` and private runtime `evidence`. The next task can consume `arrays.residual` directly after checking the public export receipt's artifact hash and the residual F32 hash, without recalculating the tail.

Public `high-export-receipt.json` and `low-export-receipt.json` contain hashes, shapes, byte extents, source inventories and scope flags. They contain no array payload or numeric model-scale value. New replay sources are listed separately from the reused admission sources and accepted execution sources. `verification.json` confirms both artifacts, five saved outputs, three saved inputs, unchanged accepted sources/receipts and current100 build identity.

No resource observer was installed. Each replay disposed its native owner; HIGH browser closed before LOW browser launched, and both browsers closed. Models entered as local browser Files; HTTP served only docs. Private files were never served or added to Git. No prefix/attention stage or full model was run, no model was downloaded/rehashed, and no commit/push occurred. `load/predict/sample=NOT_READY`.
