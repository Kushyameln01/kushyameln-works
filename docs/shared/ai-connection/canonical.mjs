// RFC 8785 serialization on the stricter works artifact JSON value profile.
// No Unicode normalization. Array order is significant. Binary payloads are separate.
const encoder = new TextEncoder();
function validString(value) {
  for(let i=0;i<value.length;i++) {
    const c=value.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff) {const low=value.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))throw TypeError('JCS forbids unpaired Unicode surrogates.');}
    else if(c>=0xdc00&&c<=0xdfff) throw TypeError('JCS forbids unpaired Unicode surrogates.');
  }
}
function compareUTF16(a,b) {
  const n=Math.min(a.length,b.length);
  for(let i=0;i<n;i++) {const difference=a.charCodeAt(i)-b.charCodeAt(i);if(difference)return difference;}
  return a.length-b.length;
}
export function canonicalize(value) {
  const active=new Set();
  function encode(v) {
    if(v===null)return 'null';
    if(typeof v==='string'){validString(v);return JSON.stringify(v);}
    if(typeof v==='boolean')return v?'true':'false';
    if(typeof v==='number') {
      if(!Number.isFinite(v)||(Number.isInteger(v)&&!Number.isSafeInteger(v)))throw TypeError('Artifact JSON uses finite numbers and decimal strings for unsafe integers.');
      return JSON.stringify(v);
    }
    if(typeof v!=='object')throw TypeError('Only JSON values can be canonicalized.');
    if(active.has(v))throw TypeError('JSON cannot contain object cycles.');
    if(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw TypeError('JSON object must be plain; runtime handles and TypedArrays are payloads.');
    if(Object.getOwnPropertySymbols(v).length)throw TypeError('JSON cannot contain symbol keys.');
    if(Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>p.get||p.set))throw TypeError('JSON cannot contain accessor properties.');
    active.add(v);
    let result;
    if(Array.isArray(v)) {
      const items=[];
      for(let i=0;i<v.length;i++){if(!Object.hasOwn(v,i))throw TypeError('Sparse arrays are not permitted.');items.push(encode(v[i]));}
      if(Object.keys(v).some(key=>!/^(0|[1-9][0-9]*)$/.test(key)||!Number.isSafeInteger(Number(key))||Number(key)>=v.length))throw TypeError('JSON array has extra properties.');
      result='['+items.join(',')+']';
    } else {
      if(Object.getOwnPropertySymbols(v).length)throw TypeError('JSON object cannot contain symbol keys.');
      const keys=Object.keys(v);keys.forEach(validString);keys.sort(compareUTF16);
      result='{'+keys.map(key=>JSON.stringify(key)+':'+encode(v[key])).join(',')+'}';
    }
    active.delete(v);return result;
  }
  return encode(value);
}
export const canonicalBytes = value => encoder.encode(canonicalize(value));
export async function sha256Bytes(bytes) {
  if(!(bytes instanceof Uint8Array))throw TypeError('SHA-256 input must be Uint8Array actual bytes.');
  if(!globalThis.crypto?.subtle)throw Error('Web Crypto SHA-256 is unavailable in this environment.');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function hashCanonical(value) {return sha256Bytes(canonicalBytes(value));}
