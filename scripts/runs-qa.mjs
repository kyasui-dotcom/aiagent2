import { spawnSync } from 'node:child_process';

const steps = [
  ['qa:callback', 'npm', ['run', 'qa:callback']],
  ['qa:retry-timeout', 'npm', ['run', 'qa:retry-timeout']],
  ['qa:state-machine', 'npm', ['run', 'qa:state-machine']],
  ['qa:e2e-mock', 'npm', ['run', 'qa:e2e-mock']],
  ['qa:worker-api', 'npm', ['run', 'qa:worker-api']],
  ['qa:worker-runs', 'npm', ['run', 'qa:worker-runs']]
];

for (const [label, command, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\nruns qa passed');
