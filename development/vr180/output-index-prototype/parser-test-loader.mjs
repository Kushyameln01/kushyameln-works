// Test-only: run the unchanged product parser suite against the private variant.
import {registerHooks} from 'node:module';
const publicParser = new URL('../../../docs/shared/vr180/mp4.mjs', import.meta.url).href;
const privateParser = new URL('./mp4-output-inspect.mjs', import.meta.url).href;
registerHooks({resolve(specifier, context, nextResolve) {
  const result = nextResolve(specifier, context);
  return result.url === publicParser ? {...result, url: privateParser} : result;
}});
