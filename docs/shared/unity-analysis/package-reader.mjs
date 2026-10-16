// Read-only fork of shared/ft/unity-package.mjs; keeps FT limits unchanged.
import { Gunzip } from '../ft/vendor/fflate.mjs';

export const MAX_UNITY_PACKAGE_BYTES = 64 * 1024 * 1024;
const BLOCK = 512;
const POSIX_MAGIC = 'ustar\0' + '00';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const GUID = /^[0-9a-f]{32}$/;
const children = new Set(['asset', 'asset.meta', 'pathname', 'preview.png']);
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function fail(message) { throw new Error(`Unitypackage: ${message}`); }
function crcUpdate(crc, bytes) {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
function crc32(bytes) { return (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0; }
function u32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}
function bytesRequired(bytes) {
  if (!(bytes instanceof Uint8Array)) fail('expected Uint8Array');
}
function text(bytes, label) {
  try { return decoder.decode(bytes); }
  catch { fail(`invalid UTF-8 in ${label}`); }
}
function isZero(bytes) { return bytes.every(byte => byte === 0); }
function validGuid(guid) {
  if (typeof guid !== 'string' || !GUID.test(guid) || /^0+$/.test(guid)) fail('invalid GUID');
}
function validPath(path) {
  if (typeof path !== 'string' || !path.startsWith('Assets/') || /[\\:\x00-\x1f\x7f]/.test(path)) {
    fail('asset path must be a safe path below Assets/');
  }
  if (path.split('/').some(part => part === '' || part === '.' || part === '..')) fail('unsafe asset path segment');
}
function folderMeta(meta, guid) {
  if (typeof meta !== 'string' || meta.includes('\0')) fail('invalid asset.meta');
  const matches = [...meta.matchAll(/^guid:\s*([0-9a-f]{32})\s*$/gm)];
  if (matches.length !== 1 || matches[0][1] !== guid) fail('asset.meta GUID mismatch');
  return /^folderAsset:\s*yes\s*$/m.test(meta);
}
function checkAsset(entry) {
  if (!entry || typeof entry !== 'object') fail('invalid asset entry');
  validGuid(entry.guid);
  validPath(entry.path);
  const folder = folderMeta(entry.meta, entry.guid);
  if (folder ? entry.asset !== null : !(entry.asset instanceof Uint8Array)) {
    fail(folder ? 'folderAsset must not contain asset data' : 'non-folder asset data is missing');
  }
  return folder;
}
function checkCollection(entries) {
  const guids = new Set();
  const paths = new Map();
  for (const entry of entries) {
    const folder = checkAsset(entry);
    if (guids.has(entry.guid)) fail(`duplicate GUID ${entry.guid}`);
    guids.add(entry.guid);
    const key = entry.path.toLowerCase();
    if (paths.has(key)) fail(`duplicate asset path ${entry.path}`);
    paths.set(key, folder);
  }
  for (const entry of entries) {
    const parts = entry.path.toLowerCase().split('/');
    for (let n = 2; n < parts.length; n++) {
      if (paths.get(parts.slice(0, n).join('/')) === false) fail('asset path has a non-folder parent');
    }
  }
}

function gzipHeader(bytes) {
  if (bytes.length < 18 || bytes[0] !== 31 || bytes[1] !== 139 || bytes[2] !== 8 || (bytes[3] & 0xe0)) {
    fail('invalid gzip header');
  }
  const flags = bytes[3];
  const end = bytes.length - 8;
  let offset = 10;
  if (flags & 4) {
    if (offset + 2 > end) fail('truncated gzip extra field');
    const length = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2 + length;
    if (offset > end) fail('truncated gzip extra field');
  }
  for (const flag of [8, 16]) {
    if (!(flags & flag)) continue;
    while (offset < end && bytes[offset] !== 0) offset++;
    if (offset >= end) fail('unterminated gzip header string');
    offset++;
  }
  if (flags & 2) {
    if (offset + 2 > end) fail('truncated gzip header checksum');
    if ((crc32(bytes.subarray(0, offset)) & 0xffff) !== (bytes[offset] | (bytes[offset + 1] << 8))) {
      fail('gzip header checksum mismatch');
    }
    offset += 2;
  }
  if (offset >= end) fail('gzip deflate data is missing');
  return offset;
}

function gunzipBounded(bytes) {
  bytesRequired(bytes);
  const headerLength = gzipHeader(bytes);
  const expectedSize = u32(bytes, bytes.length - 4);
  if (expectedSize > MAX_UNITY_PACKAGE_BYTES) fail('expanded data exceeds 64 MiB');
  let length = 0;
  let crc = 0xffffffff;
  const chunks = [];
  const stream = new Gunzip((chunk) => {
    length += chunk.length;
    if (length > MAX_UNITY_PACKAGE_BYTES) fail('expanded data exceeds 64 MiB');
    if (chunk.length) {
      crc = crcUpdate(crc, chunk);
      chunks.push(chunk);
    }
  });
  stream.onmember = () => fail('multiple gzip members are not supported');
  // Do not trust ISIZE to allocate the output: a forged trailer must not permit
  // an unbounded expansion. Small deflate chunks bound overshoot before callback.
  // Supply the full already-validated header first (filename may be long).
  stream.push(bytes.subarray(0, headerLength), false);
  for (let offset = headerLength; offset < bytes.length; offset += 1024) {
    stream.push(bytes.subarray(offset, Math.min(offset + 1024, bytes.length)), false);
  }
  // A non-final push above also detects a concatenated member in the last chunk.
  stream.push(new Uint8Array(), true);
  if (length !== expectedSize) fail('gzip size mismatch');
  if (((crc ^ 0xffffffff) >>> 0) !== u32(bytes, bytes.length - 8)) fail('gzip checksum mismatch');
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function headerString(header, start, size) {
  const field = header.subarray(start, start + size);
  const nul = field.indexOf(0);
  if (nul >= 0 && !isZero(field.subarray(nul))) fail('malformed tar string padding');
  return text(nul < 0 ? field : field.subarray(0, nul), 'tar header');
}
function octal(header, start, size, label) {
  const raw = text(header.subarray(start, start + size), `tar ${label}`);
  if (!/^[\x00 ]*[0-7]*[\x00 ]*$/.test(raw)) fail(`invalid tar ${label}`);
  const value = Number.parseInt(raw.replace(/[\x00 ]/g, '') || '0', 8);
  if (!Number.isSafeInteger(value)) fail(`tar ${label} is too large`);
  return value;
}

/** Read a gzip/GNU-or-USTAR Unity package without filesystem access.
 * Optional preview.png members are validated as regular files, then omitted.
 * Returned assets own their byte arrays; metadata and paths use strict UTF-8.
 */
export function readUnityPackage(bytes) {
  const tar = gunzipBounded(bytes);
  if (tar.length % BLOCK !== 0) fail('truncated tar block');
  const groups = new Map();
  const memberNames = new Set();
  let offset = 0;
  let ended = false;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (isZero(header)) {
      if (offset + 2 * BLOCK > tar.length || !isZero(tar.subarray(offset))) fail('invalid tar end marker');
      ended = true;
      break;
    }
    const expectedChecksum = octal(header, 148, 8, 'checksum');
    let checksum = 0;
    for (let i = 0; i < BLOCK; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== expectedChecksum) fail('tar checksum mismatch');
    const magic = text(header.subarray(257, 265), 'tar magic');
    if (magic !== 'ustar  \0' && magic !== POSIX_MAGIC) fail('unsupported tar format');
    // GNU uses this region for extensions, not a POSIX path prefix. Neither is
    // needed in a Unity package's fixed GUID/filename member layout.
    if (magic === POSIX_MAGIC && !isZero(header.subarray(345, 500))) fail('tar prefixes are not supported');
    for (const [start, size, label] of [[100, 8, 'mode'], [108, 8, 'uid'], [116, 8, 'gid'], [136, 12, 'mtime']]) {
      octal(header, start, size, label);
    }
    const size = octal(header, 124, 12, 'size');
    const name = headerString(header, 0, 100);
    if (!isZero(header.subarray(157, 257))) fail('tar links are not supported');
    const type = header[156];
    if (![0, 48, 53].includes(type)) fail('tar links and special members are not supported');
    const directory = type === 53;
    const match = directory ? /^([0-9a-f]{32})\/?$/.exec(name) : /^([0-9a-f]{32})\/([^/]+)$/.exec(name);
    if (!match || (!directory && !children.has(match[2]))) fail('invalid Unitypackage member path');
    const guid = match[1];
    validGuid(guid);
    const memberKey = directory ? guid : name;
    if (memberNames.has(memberKey)) fail('duplicate tar member');
    memberNames.add(memberKey);
    if (memberNames.size > 10240 || groups.size > 2048) fail('PACKAGE_ENTRY_LIMIT');
    if (directory && size !== 0) fail('tar directory has data');
    if (size > MAX_UNITY_PACKAGE_BYTES) fail('tar member exceeds 64 MiB');
    const start = offset + BLOCK;
    const padded = Math.ceil(size / BLOCK) * BLOCK;
    if (start + padded > tar.length) fail('truncated tar member');
    if (!isZero(tar.subarray(start + size, start + padded))) fail('nonzero tar member padding');
    let group = groups.get(guid);
    if (!group) groups.set(guid, group = { directory: false, files: new Map() });
    if (directory) group.directory = true;
    else group.files.set(match[2], tar.subarray(start, start + size));
    offset = start + padded;
  }
  if (!ended) fail('tar end marker is missing');
  const entries = [];
  for (const [guid, group] of groups) {
    if (!group.directory || !group.files.has('asset.meta') || !group.files.has('pathname')) fail('incomplete GUID directory');
    const path = text(group.files.get('pathname'), 'pathname');
    const meta = text(group.files.get('asset.meta'), 'asset.meta');
    const asset = group.files.has('asset') ? group.files.get('asset').slice() : null;
    entries.push({ guid, path, asset, meta });
  }
  checkCollection(entries);
  return new Map(entries.map(entry => [entry.guid, entry]));
}
