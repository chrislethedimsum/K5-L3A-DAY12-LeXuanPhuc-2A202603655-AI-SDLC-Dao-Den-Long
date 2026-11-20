import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const dir = resolve('docs/proof');
mkdirSync(dir, { recursive: true });
const results = [];

function run(name, cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: root });
  writeFileSync(resolve(dir, `${name}.log`), `$ ${cmd} ${args.join(' ')}\nexit=${r.status}\n${r.stdout ?? ''}${r.stderr ?? ''}${r.error ?? ''}`);
  results.push({ name, status: r.status });
  return r;
}

const smokeOnly = process.argv.includes('--smoke-only');
if (smokeOnly) {
  const extra = process.env.OFFLINE_TYPE_ROOTS ? ['--typeRoots', process.env.OFFLINE_TYPE_ROOTS] : [];
  run('headless-build', 'tsc', ['-p', 'tsconfig.headless.json', ...extra]);
} else {
  run('tests', 'npm', ['test']);
  run('browser-build', 'npm', ['run', 'build']);
}

run('smoke', process.execPath, ['scripts/smoke.mjs']);
const cli = 'dist-headless/src/headless/cli.js';
const a = run('seed42-a', process.execPath, [cli, '--seed', '42', '--night', '1', '--ticks', '1200', '--snapshot-every', '10', '--out', 'docs/proof/seed42-a.jsonl']);
const b = run('seed42-b', process.execPath, [cli, '--seed', '42', '--night', '1', '--ticks', '1200', '--snapshot-every', '10', '--out', 'docs/proof/seed42-b.jsonl']);

if (a.status === 0 && b.status === 0) {
  const left = readFileSync(resolve(dir, 'seed42-a.jsonl'));
  const right = readFileSync(resolve(dir, 'seed42-b.jsonl'));
  const equal = left.equals(right);
  writeFileSync(resolve(dir, 'determinism.log'), `byte_identical=${equal}\nsha256=${createHash('sha256').update(left).digest('hex')}\n`);
  results.push({ name: 'determinism', status: equal ? 0 : 1 });
}

for (const name of ['win', 'dawn', 'hit', 'pulse', 'spawn', 'pickup']) {
  run(`scenario-${name}`, process.execPath, [
    cli,
    '--seed',
    '42',
    '--night',
    '1',
    '--scenario',
    `tests/fixtures/${name}.json`,
    '--inputs',
    `tests/fixtures/${name}-inputs.json`,
    '--ticks',
    name === 'spawn' ? '2700' : '120',
    '--out',
    `docs/proof/${name}.jsonl`
  ]);
}

const coverage = new Set();
for (const name of ['win', 'dawn', 'hit', 'pulse', 'spawn', 'pickup']) {
  try {
    for (const line of readFileSync(resolve(dir, `${name}.jsonl`), 'utf8').trim().split('\n')) {
      const r = JSON.parse(line);
      if (r.type === 'event') coverage.add(r.name);
    }
  } catch {
    results.push({ name: `coverage-read-${name}`, status: 1 });
  }
}

const expected = ['mote_picked', 'deposit', 'lantern_lit', 'pulse', 'player_hit', 'shade_spawned', 'game_over'];
const missing = expected.filter((e) => !coverage.has(e));
writeFileSync(
  resolve(dir, 'event-coverage.log'),
  `${missing.length ? 'FAIL missing ' + missing.join(',') : 'PASS all 7 Test Contract v1.0 events'}\n${[...coverage].join('\n')}\n`
);
results.push({ name: 'event-coverage', status: missing.length ? 1 : 0 });
writeFileSync(resolve(dir, 'run-summary.json'), JSON.stringify({ mode: smokeOnly ? 'offline-smoke-only' : 'full', results }, null, 2) + '\n');
if (results.some((r) => r.status !== 0)) process.exitCode = 1;
console.log(JSON.stringify(results, null, 2));
