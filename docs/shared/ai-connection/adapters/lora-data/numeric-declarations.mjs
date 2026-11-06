/** Public owner data only. This does not evaluate compatibility, admit a
 * snapshot, perform model arithmetic, or replace the canonical owner adapter. */
export const LORA_NUMERIC_DECLARATIONS_VERSION = 'lora-numeric-declarations/0.1-draft.1';

const OWNER_VERSION = 'lora-diffusion-diagnostic-adapter/0.1';
const SDK_VERSION = 'lora-connection/2.0-draft.1';
const HASH = /^[a-f0-9]{64}$/;
const text = value => typeof value === 'string' && value.length > 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const clone = value => value === undefined ? null : structuredClone(value);
function identity(condition, message) {
  if (!condition) throw Object.assign(new TypeError(message), {code: 'LORA_DECLARATION_IDENTITY_ERROR'});
}
function jsonMetadata(value, ancestors = new Set(), arrayItem = false) {
  if (value === undefined) { identity(!arrayItem, 'Undefined array metadata is not JSON data'); return; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { identity(Number.isFinite(value), 'Finite JSON metadata required'); return; }
  identity((plain(value) || Array.isArray(value)) && !ancestors.has(value),
    'Acyclic ordinary JSON metadata required; mutable collections are not declarations');
  ancestors.add(value);
  if (Array.isArray(value)) {
    identity(Reflect.ownKeys(value).every(key => key === 'length'
      || typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length),
    'JSON array metadata cannot have non-index or symbol properties');
    for (let index = 0; index < value.length; index++) {
      identity(Object.hasOwn(value, index), 'Sparse array metadata is not JSON data');
      jsonMetadata(value[index], ancestors, true);
    }
  } else {
    identity(Object.getOwnPropertySymbols(value).length === 0, 'JSON metadata cannot have symbol keys');
    Object.values(value).forEach(item => jsonMetadata(item, ancestors));
  }
  ancestors.delete(value);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Describe an actual SDK plan and its public canonical owner binding.
 * `ownerBinding` may be the canonical describeBinding() result or the explicit
 * management facade envelope whose `.owner` contains that result.
 *
 * Dtype/layout values are observations, including known conflicting values.
 * Missing properties become null with presence:false; explicit null remains
 * declared. Consumers choose which properties are mandatory/applicable.
 * Only ordinary JSON-shaped metadata is supported; mutable collections are
 * refused rather than superficially frozen. Undefined object fields represent
 * absence. No F32/row-major fallback, source-storage substitution, or dtype aliasing is
 * performed. outputDtype refers to prepared weight/bias, never projection data.
 * sourceStorageDtype describes the native base parameter's original storage;
 * original LoRA tensor dtypes remain inspection data and are not inferred here.
 * Hashes are syntax/cross-reference identities here, not new byte verification.
 */
export function describeLoraNumericDeclarations({plan, ownerBinding} = {}) {
  identity(plain(plan) && plain(ownerBinding), 'Explicit plan and public owner binding required');
  const envelope = Object.hasOwn(ownerBinding, 'owner');
  const binding = envelope ? ownerBinding.owner : ownerBinding;
  identity(plain(binding) && binding.adapterVersion === OWNER_VERSION
    && plan.contractVersion === SDK_VERSION, 'Matching canonical owner and SDK versions required');
  jsonMetadata(plan); jsonMetadata(binding);
  const p = clone(plan), b = clone(binding), prefix = envelope ? '/owner' : '';
  const native = b.nativeRegistry, connection = b.connectionRegistry;
  identity(plain(native) && plain(connection) && plain(p.registry)
    && HASH.test(p.sourceSha256) && HASH.test(p.planId)
    && HASH.test(p.registryHash) && HASH.test(b.nativeRegistryHash)
    && HASH.test(b.connectionRegistryHash) && native.registryHash === b.nativeRegistryHash
    && p.registryHash === b.connectionRegistryHash,
  'Plan source/registry identity differs from the public owner binding');
  for (const field of ['modelHash', 'graphHash']) {
    identity(HASH.test(native[field]) && native[field] === connection[field]
      && native[field] === p.registry[field], 'Foreign model/graph identity in public binding');
  }
  identity(text(native.side) && native.side === connection.side && native.side === p.registry.side,
    'Foreign side identity in public binding');
  identity(Array.isArray(p.operations) && p.operations.length > 0
    && Array.isArray(native.targets) && Array.isArray(connection.targets),
  'Joinable public targets and plan operations required');

  const seen = new Set();
  const patches = p.operations.map((op, operationIndex) => {
    identity(plain(op) && plain(op.target) && text(op.key) && text(op.target.weightId)
      && op.target.key === op.key, 'Operation key and target identity must agree');
    const key = op.key, weightId = op.target.weightId, token = key + '\0' + weightId;
    identity(!seen.has(token), 'Duplicate plan target is ambiguous');
    seen.add(token);
    function joined(targets) {
      const byKey = targets.map((target, index) => ({target, index})).filter(x => x.target?.key === key);
      const byId = targets.map((target, index) => ({target, index})).filter(x => x.target?.weightId === weightId);
      identity(byKey.length === 1 && byId.length === 1 && byKey[0].index === byId[0].index,
        'Target key/weightId is absent, aliased or ambiguous');
      return byKey[0];
    }
    const n = joined(native.targets), c = joined(connection.targets);
    const operationPath = '/operations/' + operationIndex;
    const nativePath = prefix + '/nativeRegistry/targets/' + n.index;
    const connectionPath = prefix + '/connectionRegistry/targets/' + c.index;
    const missingPaths = [], presence = {}, origins = {};
    function observed(container, path, object, property) {
      const present = plain(object) && Object.hasOwn(object, property) && object[property] !== undefined;
      const origin = {container, path: path + '/' + property, key, weightId};
      if (!present) missingPaths.push(origin.path);
      return {value: present ? clone(object[property]) : null, present, origin};
    }
    function field(name, container, path, object, property) {
      const observation = observed(container, path, object, property);
      presence[name] = observation.present;
      origins[name] = observation.origin;
      return observation.value;
    }
    const patch = {key, weightId};
    for (const name of ['loaderPolicyId', 'strength', 'sourceSha256', 'planId', 'selection']) {
      patch[name] = field(name, 'plan', '', p, name);
    }
    for (const name of ['variant', 'rank', 'alpha', 'alphaName', 'scale', 'fullShape', 'slice', 'names']) {
      patch[name] = field(name, 'plan', operationPath, op, name);
    }
    patch.nativeRegistryHash = field('nativeRegistryHash', 'ownerBinding', prefix, b, 'nativeRegistryHash');
    patch.connectionRegistryHash = field('connectionRegistryHash', 'ownerBinding', prefix, b, 'connectionRegistryHash');
    patch.baseDtype = field('baseDtype', 'ownerBinding', nativePath, n.target, 'computeDtype');
    patch.outputDtype = field('outputDtype', 'ownerBinding', connectionPath, c.target, 'dtype');
    patch.layout = field('layout', 'ownerBinding', connectionPath, c.target, 'layout');
    patch.baseLayout = field('baseLayout', 'ownerBinding', nativePath, n.target, 'layout');
    patch.sourceStorageDtype = field('sourceStorageDtype', 'ownerBinding', nativePath, n.target, 'storageDtype');

    const values = {}, observedPresence = {}, observedOrigins = {};
    for (const [group, container, path, object, fields] of [
      ['native', 'ownerBinding', nativePath, n.target, ['dtype', 'computeDtype', 'layout', 'storageDtype']],
      ['connection', 'ownerBinding', connectionPath, c.target, ['dtype', 'layout']],
      ['target', 'plan', operationPath + '/target', op.target, ['dtype', 'layout']]
    ]) {
      values[group] = {}; observedPresence[group] = {}; observedOrigins[group] = {};
      for (const name of fields) {
        const value = observed(container, path, object, name);
        values[group][name] = value.value;
        observedPresence[group][name] = value.present;
        observedOrigins[group][name] = value.origin;
      }
    }
    presence.observed = observedPresence;
    origins.observed = observedOrigins;
    return {...patch, observed: values, presence, origins, missingPaths: [...new Set(missingPaths)]};
  });
  const declaration = {schemaVersion: LORA_NUMERIC_DECLARATIONS_VERSION,
    declarationScope: 'prepared-weight-bias',
    presencePolicy: 'own non-undefined property; explicit null is retained as declared, not defaulted',
    bindingInput: envelope ? 'facade-envelope' : 'canonical-owner',
    patches, presence: {}, origins: {}, missingPaths: []};
  for (const [container, path, object, fields] of [
    ['plan', '', p, ['sourceSha256', 'planId', 'sdkInstanceId', 'localInputRevision', 'localApplicationRevision', 'buildId', 'selection', 'coverage', 'scope']],
    ['ownerBinding', prefix, b, ['adapterVersion', 'nativeRegistryHash', 'connectionRegistryHash']]
  ]) {
    for (const field of fields) {
      const present = Object.hasOwn(object, field) && object[field] !== undefined;
      declaration[field] = present ? clone(object[field]) : null;
      declaration.presence[field] = present;
      declaration.origins[field] = {container, path: path + '/' + field};
      if (!present) declaration.missingPaths.push(path + '/' + field);
    }
  }
  return freeze(declaration);
}
