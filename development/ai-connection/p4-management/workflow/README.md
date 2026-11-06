# Workflow handoff public packet

2026-11-02 JST. Public edition; external delivery is still pending. This packet keeps the original workflow/source facts and unknown media fields from the working draft.

- [VAE handoff](VAE-WORKFLOW-HANDOFF.md) and [machine-readable handoff](VAE-WORKFLOW-HANDOFF.json)
- [Acquisition receipt](SOURCE-ACQUISITION.json), [static validation](VALIDATION.json), and [SHA-256 checksums](SHA256SUMS)
- Six source files: the exact upstream workflow, Python node, editor JavaScript, pinned tree metadata, and the two fixed VAE P6 documents.
- Pages evidence appears only as bounded citation metadata and the retained private-read bundle hash. Page bodies, uploaded Custom instructions and ProductBrief content or file IDs are excluded. No private body is required to rebuild this packet.
- Historical P6 source documents retain their original bytes and original relative references. Resolve those source-document references in the pinned VAE repository commit recorded in the acquisition receipt.

Rebuild from any checkout containing baseline commit `5aa5a806f84a875c542b2922fe80ef6faafc7915`:

```sh
python path/to/workflow-public/build_inventory.py --repo /path/to/kushyameln-works
```

The packet directory defaults to the builder's own directory. To use another copy containing the same six source files and Markdown documents:

```sh
python path/to/build_inventory.py --repo /path/to/kushyameln-works --root /path/to/copied-packet
```

Verify the resulting packet from its directory:

```sh
sha256sum -c SHA256SUMS
```

The builder uses the fixed repository inventory and the six public source files. It checks the original workflow hash, all 20 node projections and 27 links, five Git blob identities, eight slots, unknown frame/time/shape fields, and local handoff links. It only parses the acquired Python source as text/AST. It performs no network access, media reading or resizing, model export, native module execution, inference, publication, or external messaging.

The configured source/output grid remains a conditional requirement. Actual media supply, selected wired/editor origins, exact processed dimensions and frame mappings remain unknown. Final generated decode still requires P5's real sample, producer identities, numerical restoration receipt and a matching VAE profile.
