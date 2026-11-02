// Opt in with NODE_OPTIONS=--require=<this file> for a disposable diagnostic
// Node process. Prefer stopping this process if the shared cgroup exhausts RAM;
// this changes neither model arithmetic nor another process's priority.
const fs = require('node:fs');
fs.writeFileSync('/proc/self/oom_score_adj', '1000');
if (fs.readFileSync('/proc/self/oom_score_adj', 'utf8').trim() !== '1000') {
  throw new Error('The requested diagnostic OOM priority was not applied');
}
