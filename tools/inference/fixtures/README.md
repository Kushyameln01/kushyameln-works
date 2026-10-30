# Small connection fixtures

`works-tensor-v1-legacy.wktensor` was generated with the unchanged codec from repository commit `a33b311e45a75a6c683242286fef608c7b3770a9`. It contains only Float32 values `[1,-2]`, shape `[1,2]`, layout `NC`, meaning `contract-fixture`; there are no model weights or real media. The connection test checks byte-identical legacy encoding and Node Buffer decoding.

Other fixtures are constructed inside `test-connection-contract.mjs`. Repeated `a/b/c` SHA strings are synthetic metadata for contract checks, not real producer identities or compatibility evidence. MessagePort fixtures exercise actual buffer transfer with a module double; Text lifecycle fixtures use ORT doubles. None is an actual generated-sample model-inference acceptance test.
