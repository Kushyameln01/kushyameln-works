// FT-NAMES / ft-hike-20261011 revision 4.
// Naming only: this module never creates or changes Animator/ExpressionParameters.
// Reference: supplied OSCmooth-master/Packages/dev.azmidi.oscmooth/Script/OSCmoothFilters.cs
// SHA-256 fef6b9cb5100ce19dc788d5c7e45d666914c0f304bb8a48cb3d585bb888ba5ac.
// Proxy, Smooth coefficients, and BlendSet follow OSCmNameManager exactly.
// Binary/Magnitude and Decode/Cartesian are this generator's explicit extensions.
// Decoded preserves NK's existing decoded destination. Upstream Binary wrappers
// and Shuffle are deliberately not applied to the original external v2 inputs.

const CONTROL = /\p{Cc}/u;

function parameterName(value, field = 'name') {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  if (value.length === 0 || value.trim().length === 0) throw new RangeError(`${field} must not be empty`);
  if (CONTROL.test(value)) throw new RangeError(`${field} must not contain control characters`);
  return value; // Validate without trimming, sanitizing, or Unicode normalization.
}

function sourceName(value) {
  parameterName(value, 'input');
  if (!value.startsWith('v2/') || value.length === 3 || value.slice(3).trim().length === 0) {
    throw new RangeError('input must preserve a full, nonempty v2/ source name');
  }
  return value;
}

/** Ordinary range module only. Family selection belongs to the source manifest. */
export function ordinaryNames(input) {
  const p = sourceName(input);
  return Object.freeze({
    input: p,
    magnitude: `OSCm/Binary/Magnitude/${p}`,
    cartesian: `OSCm/Decode/Cartesian/${p}`,
    decoded: `OSCm/Decoded/${p}`,
    output: `OSCm/Proxy/${p}`,
    // These are smoothing COEFFICIENT names, not additional Smooth outputs.
    localCoefficient: `OSCm/Local/Smooth/${p}`,
    remoteCoefficient: `OSCm/Remote/Smooth/${p}`,
    directWeight: 'OSCm/BlendSet',
  });
}

/** Preserve source bit/sign names. No upstream OSCm/Binary/ prefix or Shuffle. */
export function externalInputs(input, bitCount, signed) {
  const p = sourceName(input);
  // Exact integer suffix generation, not a claim that a module supports 53 bits.
  if (!Number.isSafeInteger(bitCount) || bitCount < 1 || bitCount > 53) {
    throw new RangeError('bitCount must be an integer from 1 to 53');
  }
  if (typeof signed !== 'boolean') throw new TypeError('signed must be an explicit boolean');
  return Object.freeze({
    bits: Object.freeze(Array.from({ length: bitCount }, (_, i) => `${p}${2 ** i}`)),
    negative: signed ? `${p}Negative` : null,
  });
}

/** Transform only the three known old families. Unknown/canonical names survive. */
export function canonicalizeExisting(name) {
  parameterName(name);
  for (const side of ['Local', 'Remote']) {
    const prefix = `OSCm/${side}/v2/`;
    const suffix = 'Smoother';
    if (name.startsWith(prefix) && name.endsWith(suffix)) {
      const p = name.slice(`OSCm/${side}/`.length, -suffix.length);
      if (p.length > 3 && p.slice(3).trim().length > 0) return `OSCm/${side}/Smooth/${p}`;
    }
  }
  const binaryProxy = 'OSCm/Binary/Proxy/';
  if (name.startsWith(`${binaryProxy}v2/`)) {
    const p = name.slice(binaryProxy.length);
    if (p.length > 3 && p.slice(3).trim().length > 0) return `OSCm/Decoded/${p}`;
  }
  return name;
}

/** Explicit expanded-range module: retain the supplied output without aliases. */
export function expandedNames({ input, output } = {}) {
  return Object.freeze({ input: sourceName(input), output: parameterName(output, 'output') });
}

/** Route by an explicit source/module flag, never by suffix or numeric extrema. */
export function moduleNames(spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) throw new TypeError('module specification must be an object');
  if (spec.family === 'expanded') return expandedNames(spec);
  if (spec.family === 'ordinary') {
    if (spec.output !== undefined) throw new RangeError('ordinary module must not override its derived output; use the explicit expanded family when applicable');
    return ordinaryNames(spec.input);
  }
  throw new RangeError('module family must explicitly be ordinary or expanded');
}

/**
 * Validate a list of parameter DECLARATIONS, not repeated references to them.
 * Register the intentional shared OSCm/BlendSet declaration once. Apply any
 * canonicalization first. A collision is an error, never a suffixed rename.
 */
export function assertNoParameterCollisions(names) {
  if (!Array.isArray(names)) throw new TypeError('names must be an array of declarations');
  const first = new Map();
  names.forEach((name, index) => {
    parameterName(name, `names[${index}]`);
    if (first.has(name)) throw new RangeError(`Parameter collision: ${name} (indices ${first.get(name)} and ${index})`);
    first.set(name, index);
  });
  return true;
}
