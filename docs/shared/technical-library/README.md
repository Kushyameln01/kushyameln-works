# Technical library candidate contract

Feature version v6. Protocol 1, task `knowledge-index-step` version 1, build
`compute-knowledge-b2`. Existing FT/Unity tasks, cancellation, capacity and
moduleReuse=false defaults remain unchanged. A task is a bounded WASM posting
step, not arbitrary code execution. See kernel/ABI.md source counterpart in
`tools/technical-library/kernel/ABI.md` and `pool-task.mjs` for exact validation.

`createLibrarySession(dataset, options)` opens a private IndexedDB v3 store.
`start({runId})` and `resume(runId)` return a promise for a terminal/saved state.
`pause()` stops new submissions, waits for active segments and atomic commits.
`status()` identifies current run and committed progress; `result()` returns the
complete, validated posting index only; `metrics()` returns actual job records.
`close()` rejects new work synchronously, waits for saving, disposes only its
pool and releases memory references. Close preserves persisted runs.

Resume is implemented within the same browser profile and origin. This is the
chosen storage boundary, not a redefinition of the user's broader phrase
“same browser”. No cross-browser/device or Sites-to-Pages transfer is provided.
Browser storage eviction/deletion and hardware failures are not guaranteed safe.

Immutable input snapshots are in `inputs`; small run states in `runs`; posting
chunks in `segments`. Run/input initial creation is atomic. Segment/checkpoint
commit is atomic; complete event defines saved status. One commit queue serializes
shard completion. Epoch and per-run incarnation fencing reject older tab owners, including delete/recreate of the same run ID. v1/v2 databases are
migrated without deleting their runs. Dataset/task/algorithm/WASM/config/term
mapping/entry order/input hashes and stored segment integrity are checked before
resume. Corruption rejects without deleting original records.

The UI remembers the latest run ID and lists saved runs. At most eight new runs
are accepted, checked atomically with creation. This provisional count limit is
not a byte/quota limit. Existing migrated runs are never automatically deleted.
Deletion requires an explicit selection and confirmation naming the run and its
intermediate results. Run/input/segments are removed atomically; other runs remain.
A late writer cannot recreate the deleted run. Storage quota failures preserve the
previous committed checkpoint.

Limits: model candidate cap 10,000 entries; task at most 65,536 token tuples,
1 MiB logical input and 2 MiB logical output, timeout <=30s. Default UI chunk is
8192 tokens and 2 workers. Performance harness uses 65536 tokens as a separately
recorded configuration. No speed claim is made for default UI configuration from
that harness alone. A task's buffers are copied and caller input remains intact.

Static browsing never imports the compute session until indexing is requested.
Publication paths are explicitly listed in `security/public-files.json`.

## Private registration (separate browser data)

`private-library.mjs` and the explicitly opened private panel use the separate
IndexedDB database `works-technical-library-private-v1` (version 1). They do not
pass records to the public model, public search, index session or sharing API.
No private export/share route is provided. The private UI accepts the internal
schema below. Import requires a prepared mapping JSON and its declared raw artifacts.

Import `openPrivateLibrary({dbName?})`; alternate test names must start with
`works-technical-library-private-`. Methods are:

- `register(dataset, artifacts, {expected:null})` creates a new ID only.
- `replace(dataset, artifacts, {expected})` requires the current snapshot and a
  new datasetVersion for changed content. Same content is an idempotent no-op.
- `remove(datasetId, {expected})` atomically removes that dataset and artifacts.
- `read(datasetId, {expected?})` returns `{dataset,artifacts,snapshot,counts}` after
  complete metadata and original-byte hash validation.
- `search(datasetId, {query,offset,limit,expected?})` returns metadata hits,
  coverage, pagination and the snapshot used by those hits.
- `readEntry(datasetId, entryId, {expected})` requires the search snapshot and
  returns the entry, resolved sources and provenance after full verification.
- `listDatasets()`, `status()`, `close()` provide inventory and connection state.

The snapshot is `{incarnation,generation,hash}`. Register/replace return it;
remove returns `{deleted:true,datasetId}`. All asynchronous reads/writes return
Promises. Close is synchronous and idempotent: it rejects new work and closes the
connection after any transaction already in flight finishes. It does not cancel
an accepted atomic write. No cached corpus, Worker or timer is retained by this
handle. Search reads and hashes metadata including the artifact manifest, without
reading attachment bytes on every query; full `read` and `readEntry` verify the
bytes. The result's `verification` field distinguishes those scopes. Inventory
fails closed if a dataset's metadata is corrupt; it does not silently omit a
corrupt dataset or report an incomplete list as complete. Known IDs can still be
read independently, or explicitly removed with their previously recorded snapshot.

Dataset schema 1 requires `namespace:'private'`, `visibility:'private'`,
`publicationDecision:'not-approved'`, datasetId/datasetVersion, entries, sources,
folders and provenance. Each entry requires entryId, positive entryVersion, the
same private visibility/decision, title, summary, aliases/tags/folderIds/sourceIds
arrays. Optional claims have text, kind (specification/measurement/inference/
unverified), sourceIds and a string locator. Sources have sourceId/title,
reference `{kind:'url'|'space-page'|'library-file',value}`, access
(public/restricted/unknown) and contentStatus (unread/partial/read). Folders have
folderId/title. Provenance requires mappingVersion and sourceArtifacts entries
`{artifactId,name,sha256,bytes}`. The matching import argument is
`[{artifactId,name,bytes:Uint8Array}]`; all original bytes must match their manifest.
Unknown JSON fields remain in the snapshot, bounded by the complete JSON limit;
they are not executed or exported. Missing originals must remain explicit
unretrieved references, never fabricated byte artifacts.

IDs use lowercase letters/digits/dot/underscore/hyphen, 1–80 characters, starting
with a letter or digit. Metadata JSON and original bytes each have a separate
16 MiB bound; entries/sources/folders/artifact manifest collections are bounded
at 10,000 each. Limits are local implementation choices, not a guarantee that
every possible dataset will fit. Input is copied before asynchronous
validation. Hashes cover canonical JSON (object keys sorted, array order retained)
and exact original bytes. Commit success means transaction complete; quota,
abort and stale snapshot errors preserve the prior generation. Replace verifies
existing originals before changing them. Incarnation fencing rejects an older
writer after deletion and recreation of the same ID. Corruption rejects without
automatic deletion. Full verification is not a claim that source content is true
or that restricted sources have become publicly accessible.

Private storage is confined to the same browser profile/origin. This selected
storage boundary is not the user's original definition of “same browser”. It is
not encryption or an authorization boundary against other scripts in that origin.
No external authentication service, cross-device migration or public distribution
is added. Private data and test fixtures must remain outside the served source
root; the browser receives user-selected files directly. Actual registration,
restart verification and classification-source correspondence remain separate
acceptance steps.

### R01: preserved classification evidence (read-only)

`readEntry(datasetId, entryId, {expected})` also returns `evidence`, including the
first 20 evidence occurrences from the same fully verified snapshot. Use
`readEvidence(datasetId, entryId, {expected,offset=0,limit=20})` for subsequent
pages (limit 1–50). Both require and copy the expected
`{incarnation,generation,hash}` before asynchronous reads. Changing entryId
explicitly within the same dataset snapshot is permitted; the UI uses a separate
selection token to prevent late pages from being rendered for another entry.

The resolver in `private-evidence.mjs` projects the preserved `originalCatalog`,
`originalCorrespondence`, and `attachmentFollowup` without modifying them or
promoting source passages/citation occurrences into approved claims. It supports
`classification-preparation-1.0`. Legacy datasets with none of these fields and
no entry.originalSourceId return `available:false` with reason
`NO_CLASSIFICATION_CORRESPONDENCE`; partially present, unsupported, ambiguous or
inconsistent correspondence rejects with `PRIVATE_EVIDENCE_INVALID`.

The response includes dataset/entry identity and snapshot, `page` source metadata,
`items`, `counts:{citations,attachments}`, totalCount, offset, limit, hasMore,
nextOffset and completeness. A valid source with no evidence returns
available:true and zero items. Order is original citation order followed by
original attachment occurrence order. A repeated URL at different positions is
not deduplicated. All target-source occurrences are checked before slicing a
page, so a broken reference on a later page cannot be hidden by pagination.

`type:'citation'` items retain external source identity/URL, original label and
sourceText, heading/lineInBlock/blockId/blockHash, relationshipStatus, and external
version/commit/verificationStatus/check dates/access conditions. Null metadata
remains null. The catalog Page identity/bodyHash must match the private source;
passages must match citation source+block identity and blockHash. The resolver
computes SHA-256 of exact UTF-8 passage text, then checks that its LF-delimited
line equals the recorded quote. The quote must contain the exact external URL;
attachment context must likewise contain its exact reference. This verifies the stored correspondence, not a
fresh retrieval of the Page or independent truth of the external source.
External URLs must use HTTP(S) without credentials.

`type:'attachment'` items retain original reference/labels/context/location and
originalStatus:'unread'. A matching followup reference with verified text hash
and byte count adds the original receipt metadata and note, with
effectiveStatus:'report-text-retrieved'; otherwise effectiveStatus is
'unretrieved'. Intentional non-retrieval is valid evidence state, while a missing
or mismatched passage is corruption. Followup text is not returned. Report text
receipt does not assert raw-log recovery, execution reproduction or claim truth.
The original unread ledger is never overwritten.

The private detail panel displays source and quote location/hash/version/status,
with separate evidence pagination. It renders strings using textContent and
only navigates to an external URL after a user clicks it. It does not fetch,
embed, prefetch, share or export private evidence. Stale/error responses clear
old evidence, and changed selection/close/pagehide prevents late rendering.
This addition does not change the DB schema, dataset validator, search coverage
or public data path. Dynamic acceptance is restricted to synthetic fixtures;
private registration is a separate explicit local-file operation.

Followup receipt validation currently accepts only `kind:'text'` and
`text_representation:'source'`, with an explicit MIME type and equal
byte_size/text_byte_size matching UTF-8 text and SHA-256. Missing fields, unequal
source byte counts or other representations reject as unsupported/corrupt
evidence; they are not silently interpreted as an unread attachment. An explicit
`attachmentFollowup:{result:null}` represents no receipt in synthetic or future
compatible inputs.

Exact-reference validation supports only a complete Markdown target `](reference)`,
an autolink `<reference>`, or a bare reference delimited by whitespace/backticks.
It compares the complete extracted token, never a prefix. Markdown titles,
escaped/nested-parenthesis targets and bare URLs adjoining Japanese prose are
not interpreted by this limited reader; ambiguous or mismatched references reject
with `PRIVATE_EVIDENCE_INVALID`. This restriction applies equally to external
URLs and attachment references. It does not repair or rewrite original records.


### Explicit correction overlays

An optional private field `citationCorrections:{artifactId,addendum}` references
an additional raw JSON artifact through provenance.sourceArtifacts. The original
catalog, correspondence, followup and five raw originals remain unchanged.
`private-corrections.mjs` exports `applyCitationCorrections(dataset, artifacts)`;
it returns an effective in-memory correspondence plus annotations, or null when
no overlay exists. The supplied artifact array uses the existing
`{artifactId,name,bytes:Uint8Array}` format. `resolvePrivateEvidence` accepts those
bytes through its internal options.artifacts; readEntry/readEvidence pass their
already-read artifacts without additional DB reads. There is no independently
trusted annotation argument.

The helper supports citation-correction-addendum-1.0 with two target corrections
and one unchanged-target boundary/role annotation. It verifies every raw original
and addendum against the private manifest and declared base hashes, checks raw
JSON value equality with embedded data, checks the exact old citation and stable
locator, then verifies source/block hashes, line identity, all Unicode code-point,
UTF-16 and UTF-8 spans, and preceding/following source text. The block span must
refer to the same range on the recorded line. Target corrections additionally
require a complete Markdown destination boundary and the declared new source
whose ID matches the exact URL's SHA-256. Old source rows are retained. A failed
check returns PRIVATE_CORRECTION_INVALID without changing data.

Only these fully verified overlay occurrences bypass the general token grammar.
The unchanged-target annotation must retain its original URL/source identity and
explicit local_execution_example / eligibleAsExternalTechnicalEvidence:false.
It is returned with the receipt hash, locator and boundary status, and the UI
renders its URL as text rather than a link. The role does not establish that an
example was executed. Corrected external destinations retain their raw Unicode
path and externalBodyVerification:not_performed. General token parsing is not
relaxed. originalLabel may be string or null; null remains null in the API and
appears as “ラベル未記録” in the UI. Missing labels and other types are rejected.

No real source ID, correction index, URL or private artifact hash is embedded in
product code. Separate synthetic originals/addenda can exercise the same checks.
Hash consistency proves neither publisher authenticity nor contextual truth;
a completely self-consistent different raw package is not cryptographically
identified as unauthorized by this integrity check. Import authorization and
source receipt remain separate recorded decisions. Static projection and synthetic UI tests do not by themselves establish successful registration of a user dataset. Validate each explicit local import and its source correspondence separately.
