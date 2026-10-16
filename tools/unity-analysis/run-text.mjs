import {receipt} from './cloud-harness.mjs';
import {checkTextParser} from './test-text.mjs';
console.log(JSON.stringify({commit:receipt.commit,...await checkTextParser()},null,2));
