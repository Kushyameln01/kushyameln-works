import {Sha256} from '../../vr180/sha256.mjs';
// Restricted JSON registry schema using RFC8785 string/number/key ordering.
// This is a native registry digest, not a manager snapshot identity.
export function canonicalRegistryJSON(v){
 if(v===null||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isFinite(v))throw TypeError('Nonfinite canonical number');return JSON.stringify(v);}
 if(typeof v==='string'){if(!v.isWellFormed())throw TypeError('Invalid Unicode');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+Array.from(v,canonicalRegistryJSON).join(',')+']';
 if(v&&Object.getPrototypeOf(v)===Object.prototype)return '{'+Object.keys(v).sort().map(k=>canonicalRegistryJSON(k)+':'+canonicalRegistryJSON(v[k])).join(',')+'}';
 throw TypeError('JSON-only registry required');
}
export function diagnosticRegistryHash(registry){
 const {registryHash,...descriptor}=registry,hasher=new Sha256();
 hasher.update(new TextEncoder().encode(canonicalRegistryJSON(descriptor)));return hasher.digestHex();
}
export function verifyDiagnosticRegistryHash(registry){
 if(typeof registry?.registryHash!=='string'||!/^[a-f0-9]{64}$/.test(registry.registryHash)||diagnosticRegistryHash(registry)!==registry.registryHash)throw Object.assign(new Error('Diagnostic registry hash/metadata mismatch'),{code:'REGISTRY_INTEGRITY_ERROR'});
}
