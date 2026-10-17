// Test adapter only; not a browser fallback or OPFS qualification.
import {mkdirSync, existsSync, writeFileSync, openSync, fstatSync, readSync, writeSync, fsyncSync, closeSync, rmSync, rmdirSync, statSync, readdirSync, openAsBlob} from 'node:fs';
import {join} from 'node:path';
export function testLocks() {
  const held = new Map(); return {held, request(name, options, callback) {
    if (options.mode !== 'exclusive' || options.ifAvailable !== true) throw Error('INVALID_TEST_LOCK_REQUEST');
    return Promise.resolve().then(async () => { if (held.has(name)) return callback(null);
      const lock = {name}; held.set(name, lock); try { return await callback(lock); } finally { held.delete(name); } });
  }};
}
export function nodeRoot(path, hooks = {}) {
  mkdirSync(path, {recursive: true}); const open = new Set(), calls = {writes: 0, reads: 0, maxIO: 0, remove: [], close: [], getFile: []};
  const directory = current => ({
    async *entries() { for (const entry of readdirSync(current, {withFileTypes: true})) yield [entry.name, {kind: entry.isDirectory() ? 'directory' : 'file'}]; },
    async getDirectoryHandle(name, {create = false} = {}) {
      if (!/^[A-Za-z0-9_-]+$/.test(name)) throw Error('TEST_PATH_INVALID'); const child = join(current, name);
      if (!existsSync(child)) { if (!create) throw new DOMException('missing', 'NotFoundError'); mkdirSync(child); } return directory(child);
    },
    async getFileHandle(name, {create = false} = {}) {
      if (!/^[A-Za-z0-9_.-]+$/.test(name)) throw Error('TEST_PATH_INVALID'); const file = join(current, name);
      if (!existsSync(file)) { if (!create) throw new DOMException('missing', 'NotFoundError'); writeFileSync(file, ''); }
      return {async getFile() { calls.getFile.push(file); if (open.has(file)) throw Error('TEST_GETFILE_BEFORE_CLOSE'); const blob = await openAsBlob(file); return hooks.getFile?.(file, blob) ?? blob; },
        async createSyncAccessHandle() {
          if (open.has(file)) throw Error('TEST_HANDLE_BUSY'); const fd = openSync(file, 'r+'); open.add(file);
          return {getSize() { return fstatSync(fd).size; },
            write(bytes, {at}) { calls.writes++; calls.maxIO = Math.max(calls.maxIO, bytes.length); const n = hooks.write?.(file, bytes, at);
              return n ?? writeSync(fd, bytes, 0, Math.min(bytes.length, hooks.shortWrite ?? Infinity), at); },
            read(bytes, {at}) { calls.reads++; calls.maxIO = Math.max(calls.maxIO, bytes.length); const n = hooks.read?.(file, bytes, at);
              return n ?? readSync(fd, bytes, 0, Math.min(bytes.length, hooks.shortRead ?? Infinity), at); },
            flush() { hooks.flush?.(file); fsyncSync(fd); },
            close() { hooks.close?.(file); closeSync(fd); open.delete(file); calls.close.push(file); },
          };
        }};
    },
    async removeEntry(name, {recursive = false} = {}) {
      const path = join(current, name); calls.remove.push(path); hooks.remove?.(path);
      if (!existsSync(path)) throw new DOMException('missing', 'NotFoundError');
      if (!recursive && statSync(path).isDirectory()) rmdirSync(path); else rmSync(path, {recursive});
    },
  });
  return {root: directory(path), open, calls};
}
