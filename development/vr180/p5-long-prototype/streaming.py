"""One-MiB sequential loopback media receiver; no upload or browser dependency."""
import hashlib
import os
from pathlib import Path
import re
import stat
import threading
import time
CHUNK_BYTES = 1024 ** 2


def need(value, message):
    if not value:
        raise ValueError(message)


def hash_file(path, deadline):
    h = hashlib.sha256(); total = 0
    with path.open('rb') as source:
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError('RUNNER_FILE_READBACK_DEADLINE')
            data = source.read(CHUNK_BYTES)
            if not data:
                break
            total += len(data); h.update(data)
    return total, h.hexdigest()


class MediaReceiver:
    def __init__(self, directory, caps, deadline):
        self.directory = Path(directory)
        need(self.directory.is_dir() and not self.directory.is_symlink(), 'RECEIVER_DIRECTORY')
        self.caps = caps; self.deadline = deadline; self.files = {}; self.lock = threading.Lock()

    def check(self):
        if time.monotonic() >= self.deadline:
            raise TimeoutError('RUNNER_TRANSFER_DEADLINE')

    def prepare(self, entries):
        self.check(); need(not self.files, 'RECEIVER_ALREADY_PREPARED')
        need(isinstance(entries, list) and len(entries) == 2, 'RECEIVER_TWO_FILES_REQUIRED')
        for entry, ident in zip(entries, ['input', 'output']):
            need(entry.get('id') == ident and entry.get('name') == ident + '.mp4', 'RECEIVER_FILE_IDENTITY')
            need(type(entry.get('bytes')) is int and 0 < entry['bytes'] <= self.caps[ident], 'RECEIVER_FILE_CAP')
            need(isinstance(entry.get('sha256'), str) and re.fullmatch('[0-9a-f]{64}', entry['sha256']), 'RECEIVER_HASH')
        try:
            for entry in entries:
                path = self.directory / entry['name']; stream = path.open('xb'); info = os.fstat(stream.fileno())
                self.files[entry['id']] = {'entry': dict(entry), 'path': path, 'stream': stream,
                    'identity': (info.st_dev, info.st_ino), 'count': 0, 'chunks': 0, 'sha': hashlib.sha256(),
                    'complete': False, 'prepared': time.monotonic(), 'started': None}
        except BaseException:
            self.abort(); raise

    def chunk(self, ident, offset, data):
        need(self.lock.acquire(blocking=False), 'CONCURRENT_TRANSFER_REFUSED')
        try:
            self.check(); need(ident in self.files, 'TRANSFER_ID'); row = self.files[ident]
            need(not row['complete'] and row['stream'] is not None, 'TRANSFER_ALREADY_CLOSED')
            need(type(offset) is int and offset == row['count'], 'TRANSFER_OFFSET')
            need(isinstance(data, bytes) and 0 < len(data) <= CHUNK_BYTES, 'TRANSFER_CHUNK_BOUND')
            need(offset + len(data) <= row['entry']['bytes'], 'TRANSFER_FILE_BOUND')
            if row['started'] is None:row['started'] = time.monotonic()
            need(row['stream'].write(data) == len(data), 'TRANSFER_SHORT_WRITE')
            row['sha'].update(data); row['count'] += len(data); row['chunks'] += 1
            return {'id': ident, 'acceptedBytes': row['count'], 'chunks': row['chunks']}
        finally:
            self.lock.release()

    def complete(self, ident):
        need(self.lock.acquire(blocking=False), 'CONCURRENT_TRANSFER_REFUSED')
        try:
            self.check(); need(ident in self.files, 'TRANSFER_ID'); row = self.files[ident]
            need(not row['complete'] and row['stream'] is not None, 'TRANSFER_ALREADY_CLOSED')
            need(row['count'] == row['entry']['bytes'] and row['sha'].hexdigest() == row['entry']['sha256'], 'TRANSFER_WHOLE_HASH')
            row['stream'].flush(); os.fsync(row['stream'].fileno()); row['stream'].close(); row['stream'] = None
            size, digest = hash_file(row['path'], self.deadline)
            need(size == row['entry']['bytes'] and digest == row['entry']['sha256'], 'RUNNER_COMPLETE_REREAD')
            row['complete'] = True
            row['receipt'] = {**row['entry'], 'chunks': row['chunks'], 'fsynced': True, 'closed': True,
                'rereadBytes': size, 'rereadSHA256': digest, 'elapsedSeconds': time.monotonic() - row['started'],
                'queuedBeforeFirstChunkSeconds': row['started'] - row['prepared']}
            return row['receipt']
        finally:
            self.lock.release()

    def receipts(self):
        need(set(self.files) == {'input', 'output'} and all(row['complete'] for row in self.files.values()), 'TRANSFER_INCOMPLETE')
        return [self.files[name]['receipt'] for name in ['input', 'output']]

    def abort(self):
        """Called only after transfer requests stop; identity-protect owned files."""
        removed = []; errors = []
        for ident, row in self.files.items():
            try:
                if row.get('removed'):
                    continue
                if row['stream'] is not None:
                    row['stream'].close(); row['stream'] = None
                path = row['path']; info = path.lstat()
                need(stat.S_ISREG(info.st_mode) and (info.st_dev, info.st_ino) == row['identity'], 'PARTIAL_FILE_OWNERSHIP_CHANGED')
                path.unlink(); row['removed'] = True
                removed.append({'id': ident, 'receivedBytes': row['count'], 'wasComplete': row['complete']})
            except Exception as error:
                errors.append({'id': ident, 'error': str(error)})
        need(not errors, 'PARTIAL_RECEIVER_CLEANUP_FAILED:' + str(errors))
        return {'status': 'REMOVED', 'files': removed}


def start_server(content, receiver, token):
    """Exact source routes plus authenticated loopback-only bounded POSTs."""
    import http.server
    import json
    need(re.fullmatch('[0-9a-f]{32}', token), 'TRANSFER_TOKEN_FORMAT')

    class Handler(http.server.BaseHTTPRequestHandler):
        def setup(self):
            super().setup(); self.connection.settimeout(30)

        def send_json(self, code, value):
            body = json.dumps(value, separators=(',', ':')).encode()
            need(len(body) <= 4096, 'TRANSFER_RESPONSE_BOUND')
            self.send_response(code); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            item = content.get(self.path)
            if item is None:
                self.send_error(404); return
            body, mime = item
            self.send_response(200); self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(body)

        def do_POST(self):
            try:
                origin = 'http://127.0.0.1:' + str(self.server.server_port)
                need(self.headers.get('Origin') == origin, 'TRANSFER_ORIGIN')
                match = re.fullmatch('/transfer/' + token + '/(input|output)/(chunk|complete)', self.path)
                need(match is not None, 'TRANSFER_ROUTE'); ident, action = match.groups()
                length = self.headers.get('Content-Length', '')
                need(re.fullmatch('[0-9]{1,7}', length) is not None and not self.headers.get('Transfer-Encoding'), 'TRANSFER_CONTENT_LENGTH')
                length = int(length); need(0 <= length <= CHUNK_BYTES, 'TRANSFER_CHUNK_BOUND')
                if action == 'complete':
                    need(length == 0, 'TRANSFER_COMPLETE_BODY'); value = receiver.complete(ident)
                else:
                    need(length > 0, 'TRANSFER_EMPTY_CHUNK'); raw_offset = self.headers.get('X-Byte-Offset', '')
                    need(re.fullmatch('[0-9]{1,16}', raw_offset) is not None, 'TRANSFER_OFFSET_FORMAT')
                    payload = self.rfile.read(length); need(len(payload) == length, 'TRANSFER_SHORT_BODY')
                    value = receiver.chunk(ident, int(raw_offset), payload)
                self.send_json(200, value)
            except Exception as error:
                self.close_connection = True; self.send_json(400, {'status': 'FAIL', 'error': str(error)[:256]})

        def log_message(self, *_):
            pass

    class Server(http.server.ThreadingHTTPServer):
        daemon_threads = False  # server_close joins requests before receiver cleanup.
    server = Server(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
