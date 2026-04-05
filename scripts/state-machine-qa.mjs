import assert from 'node:assert/strict';

const JOB_TRANSITIONS = {
  claim: ['queued', 'dispatched', 'running', 'claimed'],
  callback: ['claimed', 'running', 'dispatched'],
  manualResult: ['queued', 'claimed', 'running', 'dispatched'],
  retry: ['failed', 'timed_out', 'dispatched', 'queued'],
  timeout: ['queued', 'claimed', 'running', 'dispatched'],
  complete: ['queued', 'claimed', 'running', 'dispatched'],
  fail: ['queued', 'claimed', 'running', 'dispatched']
};

function normalizeJobStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isTerminalJobStatus(status) {
  return ['completed', 'failed', 'timed_out'].includes(normalizeJobStatus(status));
}

function canTransitionJob(job, action) {
  const status = normalizeJobStatus(job?.status);
  const allowed = JOB_TRANSITIONS[action] || [];
  return allowed.includes(status);
}

function transitionErrorCode(job, action) {
  if (isTerminalJobStatus(job?.status)) return 'job_already_terminal';
  if (action === 'callback') return 'invalid_callback_transition';
  return 'invalid_job_transition';
}

assert.equal(canTransitionJob({ status: 'queued' }, 'claim'), true);
assert.equal(canTransitionJob({ status: 'dispatched' }, 'claim'), true);
assert.equal(canTransitionJob({ status: 'completed' }, 'claim'), false);

assert.equal(canTransitionJob({ status: 'queued' }, 'callback'), false);
assert.equal(canTransitionJob({ status: 'running' }, 'callback'), true);
assert.equal(transitionErrorCode({ status: 'queued' }, 'callback'), 'invalid_callback_transition');

assert.equal(canTransitionJob({ status: 'failed' }, 'retry'), true);
assert.equal(canTransitionJob({ status: 'timed_out' }, 'retry'), true);
assert.equal(canTransitionJob({ status: 'completed' }, 'retry'), false);
assert.equal(transitionErrorCode({ status: 'completed' }, 'retry'), 'job_already_terminal');

assert.equal(canTransitionJob({ status: 'queued' }, 'manualResult'), true);
assert.equal(canTransitionJob({ status: 'dispatched' }, 'timeout'), true);
assert.equal(canTransitionJob({ status: 'failed' }, 'timeout'), false);

console.log('state machine qa passed');
