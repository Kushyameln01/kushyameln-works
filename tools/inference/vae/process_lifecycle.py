"""Sample a disposable harness's descendants; never kill or reap other owners.

Create/start before launching the browser/driver. Call finish after their close
methods return. Linux subreaper state is process-local: use only in the task's
helper process, never the long-lived coordinator. Sampling cannot observe every
short-lived fork; an empty final list is bounded evidence, not a fork audit.
"""
import ctypes
import os
import sys
import threading
import time

import psutil


def cleanup_complete(live, zombies, errors):
    """For the E6 cleanup gate, absence of live children alone is insufficient."""
    return not live and not zombies and not errors


class ProcessOwnership:
    def __init__(self, enable_subreaper=True):
        self.root = psutil.Process()
        self.pid, self.ctime = self.root.pid, self.root.create_time()
        self.errors, self.observed, self.reaped = [], {}, []
        self.initial, self.excluded = [], set()
        self.interval, self.thread = .05, None
        self.stop = threading.Event()
        for process in self.root.children(recursive=True):
            try:
                record = self._identity(process)
                self.initial.append(record)
                self.excluded.add((record['pid'], record['ctime']))
            except psutil.NoSuchProcess:
                pass
            except psutil.AccessDenied as error:
                self._error(error)
        self.subreaper = False
        if enable_subreaper and sys.platform.startswith('linux'):
            try:
                libc = ctypes.CDLL(None, use_errno=True)
                if libc.prctl(36, 1, 0, 0, 0):  # PR_SET_CHILD_SUBREAPER
                    raise OSError(ctypes.get_errno(), 'PR_SET_CHILD_SUBREAPER')
                self.subreaper = True
            except (OSError, AttributeError) as error:
                self._error(error)

    @staticmethod
    def _identity(process):
        return {'pid': process.pid, 'ctime': process.create_time(),
                'ppid': process.ppid(), 'name': process.name(),
                'status': process.status()}

    def _error(self, error):
        message = f'{type(error).__name__}: {error}'
        if message not in self.errors:
            self.errors.append(message)

    def _sample(self):
        try:
            children = self.root.children(recursive=True)
        except (psutil.NoSuchProcess, psutil.AccessDenied) as error:
            self._error(error)
            return
        for process in children:
            try:
                record = self._identity(process)
                key = record['pid'], record['ctime']
                if key in self.excluded:
                    continue
                # Descendants of an initial child also belong to its old owner.
                if any((p.pid, p.create_time()) in self.excluded
                       for p in process.parents() if p.pid != self.pid):
                    self.excluded.add(key)
                    continue
                previous = self.observed.get(key)
                record['firstPpid'] = previous['firstPpid'] if previous else record['ppid']
                self.observed[key] = record
            except psutil.NoSuchProcess:
                pass
            except psutil.AccessDenied as error:
                self._error(error)

    def start(self):
        if self.thread is None:
            self._sample()  # Seed synchronously before the first launch.
            def sample_loop():
                while not self.stop.wait(self.interval):
                    self._sample()
            self.thread = threading.Thread(target=sample_loop, daemon=True)
            self.thread.start()
        return self

    def _remaining(self, reap):
        live, zombies = [], []
        for (pid, ctime), previous in list(self.observed.items()):
            try:
                process = psutil.Process(pid)
                if process.create_time() != ctime:  # PID reuse is a new owner.
                    continue
                record = self._identity(process)
                record['firstPpid'] = previous['firstPpid']
                if record['status'] == psutil.STATUS_ZOMBIE:
                    # No waitpid(-1), no non-owned PID, no live-process wait.
                    if reap and record['ppid'] == self.pid:
                        try:
                            waited, status = os.waitpid(pid, os.WNOHANG)
                            if waited == pid:
                                self.reaped.append({**record, 'waitStatus': status})
                                continue
                        except ChildProcessError:
                            pass
                    zombies.append(record)
                else:
                    live.append(record)
            except psutil.NoSuchProcess:
                pass
            except (psutil.AccessDenied, OSError) as error:
                self._error(error)
        return live, zombies

    def finish(self, timeout_seconds=5):
        if timeout_seconds < 0:
            raise ValueError('timeout_seconds must be nonnegative')
        self.stop.set()
        if self.thread:
            self.thread.join()
        deadline = time.monotonic() + timeout_seconds
        while True:
            self._sample()  # Include children observed during driver shutdown.
            live, zombies = self._remaining(reap=True)
            if (not live and not zombies) or time.monotonic() >= deadline:
                break
            time.sleep(min(self.interval, max(0, deadline - time.monotonic())))
        return {'harnessPid': self.pid, 'harnessCtime': self.ctime,
                'subreaper': self.subreaper, 'initialDescendants': self.initial,
                'observedChildren': list(self.observed.values()),
                'reapedChildren': self.reaped, 'liveAfterClose': live,
                'zombiesAfterClose': zombies, 'errors': self.errors,
                'scope': {'method': 'sampled descendant identities',
                          'sampleIntervalSeconds': self.interval,
                          'signalsSent': 0, 'initialDescendantsExcluded': True,
                          'limitation': 'Short-lived unobserved children may be missed; '
                                        'this is not an exhaustive fork audit.'}}
