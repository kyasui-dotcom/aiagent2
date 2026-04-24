import { spawnSync } from 'node:child_process';

const steps = [
  'qa:callback',
  'qa:retry-timeout',
  'qa:state-machine',
  'qa:e2e-mock',
  'qa:worker-api',
  'qa:worker-runs'
];

for (const label of steps) {
  console.log(`\n=== ${label} ===`);
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm', 'run', label], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env
    })
    : spawnSync('npm', ['run', label], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: process.env
    });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\nruns qa passed');
