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
  const start = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: root });
  const ms = Date.now() - start;
  writeFileSync(resolve(dir, `${name}.log`), `$ ${cmd} ${args.join(' ')}\nexit=${r.status} elapsed_ms=${ms}\n${r.stdout ?? ''}${r.stderr ?? ''}${r.error ?? ''}`);
  results.push({ name, status: r.status, elapsed_ms: ms });
  return r;
}

run('tests', 'npm', ['test']);
run('browser-build', 'npm', ['run', 'build']);
run('smoke', process.execPath, ['scripts/smoke.mjs']);

const cli = 'dist-headless/src/headless/cli.js';
for (const night of [1, 2, 3]) {
  const a = run(`night${night}-a`, process.execPath, [cli, '--seed', '42', '--night', String(night), '--ticks', '1200', '--out', `docs/proof/night${night}-a.jsonl`]);
  const b = run(`night${night}-b`, process.execPath, [cli, '--seed', '42', '--night', String(night), '--ticks', '1200', '--out', `docs/proof/night${night}-b.jsonl`]);
  if (a.status === 0 && b.status === 0) {
    const left = readFileSync(resolve(dir, `night${night}-a.jsonl`));
    const right = readFileSync(resolve(dir, `night${night}-b.jsonl`));
    const equal = left.equals(right);
    writeFileSync(resolve(dir, `determinism-night${night}.log`), `night=${night}\nbyte_identical=${equal}\nsha256=${createHash('sha256').update(left).digest('hex')}\n`);
    results.push({ name: `determinism-night${night}`, status: equal ? 0 : 1 });
  }
}

const scenarios = [
  ['win', 1, '120'],
  ['dawn', 1, '120'],
  ['hit', 1, '120'],
  ['pulse', 1, '120'],
  ['spawn', 1, '900'],
  ['pickup', 1, '120'],
  ['dash', 1, '120'],
  ['fall', 1, '120'],
  ['launchpad', 2, '120'],
  ['night3-terrain', 3, '120'],
  ['drifter', 2, '120'],
  ['charm', 2, '120'],
  ['pause', 1, '120'],
  ['safe-push', 1, '120']
];

const coverage = new Set();
for (const [name, night, ticks] of scenarios) {
  run(`scenario-${name}`, process.execPath, [
    cli,
    '--seed',
    '42',
    '--night',
    String(night),
    '--scenario',
    `tests/fixtures/${name}.json`,
    '--inputs',
    `tests/fixtures/${name}-inputs.json`,
    '--ticks',
    ticks,
    '--out',
    `docs/proof/${name}.jsonl`
  ]);
  try {
    for (const line of readFileSync(resolve(dir, `${name}.jsonl`), 'utf8').trim().split('\n')) {
      const r = JSON.parse(line);
      if (r.type === 'event') coverage.add(r.name);
    }
  } catch {
    results.push({ name: `coverage-read-${name}`, status: 1 });
  }
}

const expected = [
  'mote_picked', 'deposit', 'lantern_lit', 'pulse', 'player_hit', 'shade_spawned', 'game_over',
  'dash', 'charm_picked', 'drifter_steal', 'drifter_drop', 'night_start', 'paused', 'resumed'
];
const missing = expected.filter((e) => !coverage.has(e));
writeFileSync(
  resolve(dir, 'event-coverage.log'),
  `${missing.length ? 'FAIL missing ' + missing.join(',') : 'PASS all 14 Test Contract v1.1 events'}\n${[...coverage].join('\n')}\n`
);
results.push({ name: 'event-coverage', status: missing.length ? 1 : 0 });

// Night 3 21,600-tick benchmark (must be <= 30,000 ms)
const benchScenario = resolve('docs/proof/bench-n3-scenario.json');
writeFileSync(benchScenario, JSON.stringify({ night: 3, wind_enabled: false, lanterns: [{ id: 'L1', pos: [0, 6, 6], lit: true }], player: { pos: [0, 6, 4] } }));
const bench = run('perf-headless', process.execPath, [cli, '--seed', '42', '--night', '3', '--scenario', benchScenario, '--ticks', '21600', '--snapshot-every', '60', '--out', 'docs/proof/perf-headless.jsonl']);
const benchEntry = results.at(-1);
writeFileSync(resolve(dir, 'perf-headless.log'), `ticks=21600\nnight=3\nelapsed_ms=${benchEntry.elapsed_ms}\nthreshold_ms=30000\npassed=${bench.status === 0 && benchEntry.elapsed_ms <= 30000}\n`);

writeFileSync(resolve(dir, 'run-summary.json'), JSON.stringify({ mode: 'phase-2-full', results }, null, 2) + '\n');
if (results.some((r) => r.status !== 0)) process.exitCode = 1;
console.log(JSON.stringify(results, null, 2));
