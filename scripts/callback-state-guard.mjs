import assert from 'node:assert/strict';

function isTerminalJobStatus(status) {
  return ['completed', 'failed', 'timed_out'].includes(String(status || '').toLowerCase());
}

function canCallbackMutateJob(job) {
  const status = String(job?.status || '').toLowerCase();
  return ['claimed', 'running', 'dispatched'].includes(status);
}

assert.equal(canCallbackMutateJob({ status: 'claimed' }), true);
assert.equal(canCallbackMutateJob({ status: 'running' }), true);
assert.equal(canCallbackMutateJob({ status: 'dispatched' }), true);
assert.equal(canCallbackMutateJob({ status: 'queued' }), false);
assert.equal(canCallbackMutateJob({ status: 'completed' }), false);
assert.equal(canCallbackMutateJob({ status: 'failed' }), false);
assert.equal(canCallbackMutateJob({ status: 'timed_out' }), false);

assert.equal(isTerminalJobStatus('completed'), true);
assert.equal(isTerminalJobStatus('failed'), true);
assert.equal(isTerminalJobStatus('timed_out'), true);
assert.equal(isTerminalJobStatus('queued'), false);
assert.equal(isTerminalJobStatus('dispatched'), false);

console.log('callback state guard passed');
