# Pages publication boundary

Baseline: 134fa4e6cd32e783138f414f70e8c92121a112d8. Preserve this Composer implementation; do not import newer Sites functions.

Only exact files in public-files.json are approved for Pages. Inventory is evidence, never approval. Additions require human review of purpose, content, dependencies and license before registry edits. Unknown files, symlinks, unsafe paths and missing dependencies fail closed. Export creates a new isolated directory; it never replaces docs or publishes. A failed export leaves no target. Review and deploy the successful artifact separately.

Retired FT routes and X archive are removed from current public files. Their historical Git commits remain public; this is not historical erasure. Shared FT runtime bytes and license are preserved and imports relocated. No MA/Pose functionality is added.

Static checks do not prevent an authorized person bypassing publication review. Runtime network privacy remains a separate browser validation requirement. Restore only a previously verified sanitized artifact, never the pre-cleanup docs tree.

Commands: python3 -m unittest discover -s tests -v; node tests/relocation.mjs; python3 scripts/sync-static.py docs --output /absolute/new/stage

Validation scope: the exporter checks literal local HTML/module/CSS references. Dynamically constructed URLs require code review; it is not a JavaScript semantic analyzer. Source bytes, copied bytes and registry bytes are hash-checked before completion; changes abort export. Run against an isolated checkout: a hostile concurrent process with filesystem access remains outside this tool's security boundary. The path allowlist does not authorize new secret content within an already approved file, so source review and publication ACL remain mandatory.

Relocation verification compares the seven shared files to the baseline commit and every Composer JavaScript file to the baseline with only import-path replacement allowed. Synthetic package bytes/round-trip, WASM outputs and catalog behavior are checked. The archive writer fixes timestamps, so no output nondeterminism is accepted in this fixture. This is not a full browser or real-avatar generation test.

The JavaScript reference check scans literal import/from, fetch and new URL arguments outside quoted data and comments; template expressions are scanned, while constructed URLs still require manual review and runtime checks. A directory is valid as a new URL base without index.html, but HTML links, imports and fetches retain the entry-point requirement. `reference-exceptions.json` records only exact file/SHA256/specifier identities for reviewed Node-only vendor branches and the existing public Node rebuild source. Changing those bytes requires renewed content/dependency review; arbitrary bare imports and node: imports are not exempted. Export also aborts if this policy changes during copying. This bounded lexer is not a complete JavaScript parser or proof of all dynamic URL dependencies.
