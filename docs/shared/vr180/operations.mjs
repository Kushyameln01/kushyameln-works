// One operation covers preparation, Worker work, and (separately) saving.
// Cancellation invalidates continuations even before a Worker exists.
export class OperationScope {
  current = null;
  begin(kind) {
    if (this.current) throw Error('OPERATION_IN_PROGRESS');
    return (this.current = {kind, controller: new AbortController()});
  }
  owns(op) { return this.current === op; }
  check(op) {
    if (!this.owns(op) || op.controller.signal.aborted) {
      throw new DOMException('処理を取り消しました', 'AbortError');
    }
  }
  cancel() { this.current?.controller.abort(); }
  finish(op) {
    if (!this.owns(op)) return false;
    this.current = null;
    return true;
  }
}
