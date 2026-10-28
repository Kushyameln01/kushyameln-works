# Viseme Template implementation plan

Goal: Generate a new-GUID AnimatorController, Template BlendTrees and embedded
AnimationClips (shared Clip external) from the supplied Viseme package, changing only BlendShape mesh
paths, and expose the operation to the Works UI and future batch tools.

Base: `6cbe382ca313f344f8df22ccbd2007fa1488df88`.
Input: `Viseme_Template(1).unitypackage`, SHA-256
`c0d6510bf1fcd0cb806924a556c91c042aa6da0858785b6015b9b0dedfe20f77`.

## Contract and design decisions

- UI: Mesh名称, default `Body`, 起動 button, resulting unitypackage download.
- Preserve `Assets/Viseme/Viseme_Base.controller` and `BlendTree/*.asset` paths.
  Omit `Assets/Viseme/Animation`. Store the shared `Viseme_none.anim` directly in `Assets/Viseme`.
- Preserve the entire Controller text except remapped external GUIDs and removal of AvatarMask: 1 Layer,
  15 States, 15 Entry transitions, 15 State transitions, 2 StateMachines,
  2 Parameters, existing empty Clip; exclude the AvatarMask (user steering 2026-10-28). Keep 64-bit fileIDs as strings.
- Move 15 singly referenced Clips into their referencing BlendTree files. The
  shared `Viseme_none` stays external as `Assets/Viseme/Viseme_none.anim`, one
  asset shared by all 15 Trees. This replaces the earlier ownership tie-break
  per the explicit user steering received before implementation.
- Preserve Curve keys, attributes, flags, display names and Tree settings.
  Update runtime/Editor BlendShape paths and corresponding genericBinding CRC32.
- Every output file/folder receives a unique cryptographic GUID, disjoint from
  source GUIDs. Internal Controller IDs stay unchanged.
- Use existing Hike `FtCrc32Step` via shared compute kernel (digest
  b260ac37862014a9ebb3ebb25739283fe2778e638969e757b2fd34769cd989ad).
  Host handles text, references and archive I/O. No new compiler or WASM required.
- Reuse shared GNU tar/gzip writer: explicit GUID directories first, mode 0777,
  uid/gid/mtime 0, gzip filename archtemp.tar, level 6, folder entries without asset.
- Producer API owns template loading/version/hash. Shared pool adapter receives
  only meshName and delegates to that API; no duplicate Template in the bundle.
- Module API returns bytes plus Controller/Tree/Clip mapping and template/build
  identity. Worker client supports borrowed pools, cancellation, revision gates,
  timeout, delivery-only results, and dispose of owned resources only.
- No new ExpressionParameters, State, safety rules or changes to Decode/Smooth.
- Public target is the requested GitHub Pages repository. Space sources and the
  attached planning document are references, not public content to copy.

## References acquired

- Attached TechnicalLibrary ProductBrief 1.0 (2026-10-22): host/Worker/WASM
  responsibility, input ownership, result collection and scoped verification.
- Space Hike reference page_3146974dd7248191bdcc4ef6bb1ac63d §§0–6;
  Unity/WASM Tips page_795220c692808191927363c6a57ce520;
  Worker Tips page_9f301277a1948191bc8a075d5c954935.
- Decode/Smooth prototype page_2109c81620808191910900e6779ad028 and current
  docs/decode-smooth-builder/README.md, pipeline, parameter-template API/task.
- Internal preservation record page_34346e82d448819191cea807af95acda.
- Unity module plan page_2394936dec0881918c19a0d132313ea9: original bytes vs
  derived analysis, unknown fields, preserved Motion subassets. Its separate
  Composer task scope and historic execution restrictions are not adopted here.
- UnityPackage_Import_Fix_Confirmed.md, Library libfile_c93d08a613dc8191bfb70053614b07f1
  and libfile_6465dc3cce4881918fadd7f52b84fd13: complete packing recipe and caveats.

## Tasks and acceptance

- [x] Extract immutable template JSON with full Asset/meta text and source hashes.
- [x] Write generation tests before implementation: exact Controller preservation,
  source vs output Clip comparisons, shared Clip identity, all references resolved,
  new/disjoint GUIDs, default and Unicode paths, one shared Clip directly under Viseme, no Animation folder, no AvatarMask.
- [x] Implement docs/viseme-template/{core,api}.mjs. `generateVisemeTemplate(meshName)`
  produces the complete package; internal core receives immutable template and kernel.
- [x] Add shared/compute/viseme-template-task.mjs, registry routing and external
  bundle import. Test invalid input and module/bundle response/ownership contracts.
- [ ] Add client.mjs + simple UI and catalog entry. Verify default generation,
  edit invalidation, cancel/retry, timeout/failure, narrow viewport and saved bytes.
- [x] Independent Python gzip/tar/YAML verification against the original attachment.
- [x] Run shared pool/Template regression and publication checks; review final diff.
- [ ] Commit and publish within requested Works scope; verify served bytes and
  browser download separately from local candidate tests.

Unity Editor Import, serialized object recognition and VRChat runtime behavior
require a separate Unity environment; browser/static checks do not claim these.
Original package/meta/text are the independent comparison baseline, not generator output.
