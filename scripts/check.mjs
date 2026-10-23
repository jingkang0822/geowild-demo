import { spawnSync } from 'node:child_process';
const commands = [
  ['node', ['--test', 'tests/bank.test.cjs', 'tests/engine.test.cjs', 'tests/geography.test.cjs', 'tests/ui.test.cjs']],
  ['node', ['scripts/verify-package.cjs']],
  ['node', ['scripts/verify-release.cjs']],
  ['node', ['scripts/browser.mjs']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: new URL('..', import.meta.url), stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
