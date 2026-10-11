# Purpose and acceptance criteria

- Goal: reduce initial display latency for third-party visitors; GitHub Pages is the requested public delivery destination.
- Preserve the current public content, category navigation, browser tools, Hike/WASM, and existing analytics configuration.
- Source snapshot: Sites commit 76687b2153feab542a091ef2e4cb6c0720b6219e, 2026-10-12 JST.
- Static mirror: only root-relative HTML href/src paths are converted to portable relative links; .nojekyll added.
- Publish through main /docs. Keep the original Sites deployment available until migration checks complete.
- Artifact validity, successful deployment, browser functionality, and measured latency improvement are separate acceptance criteria.
- Do not claim speed improvement from successful publication, isolated timing, or unrepresentative network measurements.
- Reproduction: python3 scripts/sync-static.py /path/to/reviewed/dist, inspect git diff, commit/push to main.
- Remaining validation: full Unitypackage generation requires user-selected input data; this migration does not alter generator logic.
