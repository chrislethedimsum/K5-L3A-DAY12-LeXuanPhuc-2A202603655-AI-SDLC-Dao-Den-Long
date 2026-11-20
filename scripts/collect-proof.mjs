import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
  ['safe-push', 1, '120'],
  ['refuel', 1, '120'],
  ['lantern-out-relight', 1, '120'],
  ['shade-drain', 1, '120'],
  ['dawn-survived', 1, '120'],
  ['capacity-growth', 1, '120']
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
  'mote_picked', 'deposit', 'lantern_lit', 'refuel', 'lantern_out', 'fuel_drain',
  'pulse', 'player_hit', 'shade_spawned', 'game_over',
  'dash', 'charm_picked', 'drifter_steal', 'drifter_drop', 'night_start', 'paused', 'resumed'
];
const missing = expected.filter((e) => !coverage.has(e));
writeFileSync(
  resolve(dir, 'event-coverage.log'),
  `${missing.length ? 'FAIL missing ' + missing.join(',') : 'PASS all 17 Test Contract v1.2 events'}\n${[...coverage].join('\n')}\n`
);
results.push({ name: 'event-coverage', status: missing.length ? 1 : 0 });

// Night 3 18,000-tick (300s) benchmark (must be <= 30,000 ms)
const benchScenario = resolve('docs/proof/bench-n3-scenario.json');
writeFileSync(benchScenario, JSON.stringify({ night: 3, wind_enabled: false, lanterns: [{ id: 'L1', pos: [0, 6, 6], lit: true, fuel: 100 }], player: { pos: [0, 6, 4] } }));
const bench = run('perf-headless', process.execPath, [cli, '--seed', '42', '--night', '3', '--scenario', benchScenario, '--ticks', '18000', '--snapshot-every', '60', '--out', 'docs/proof/perf-headless.jsonl']);
const benchEntry = results.at(-1);
writeFileSync(resolve(dir, 'perf-headless.log'), `ticks=18000\nnight=3\nelapsed_ms=${benchEntry.elapsed_ms}\nthreshold_ms=30000\npassed=${bench.status === 0 && benchEntry.elapsed_ms <= 30000}\n`);

// 10-night soak test check (Phase 4)
const soakCli = 'dist-headless/src/headless/soak.js';
const soakRun = run('soak-test', process.execPath, [
  '--jitless',
  '--max-semi-space-size=1',
  '--no-lazy',
  '--optimize-for-size',
  '--expose-gc',
  soakCli,
  '--seed',
  '7',
  '--nights',
  '10',
  '--out',
  'docs/proof/soak-proof.json'
]);
let soakOk = false;
if (soakRun.status === 0) {
  try {
    const s = JSON.parse(readFileSync(resolve(dir, 'soak-proof.json'), 'utf8'));
    soakOk = s.crashes === 0 && s.nights === 10 && s.mem_end_mb <= 1.2 * s.mem_start_mb;
  } catch {
    soakOk = false;
  }
}
results.push({ name: 'soak-thresholds', status: soakOk ? 0 : 1 });

// Leaderboard export check (Phase 4)
const lbTmpDir = mkdtempSync(join(tmpdir(), 'ddl-proof-lb-'));
try {
  writeFileSync(
    join(lbTmpDir, 'leaderboard.json'),
    JSON.stringify({
      entries: [
        { name: 'Thảo_2', score: 900, nights_won: 1, achieved_at: '2026-11-20T10:05:00+07:00', seed: 42 },
        { name: 'Minh_1', score: 1850, nights_won: 3, achieved_at: '2026-11-20T10:02:00+07:00', seed: 42 }
      ]
    })
  );
  const startLb = Date.now();
  const lbRes = spawnSync(process.execPath, ['scripts/run.mjs', '--export-leaderboard', 'docs/proof/leaderboard-export.json'], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, DAO_DEN_LONG_DATA_DIR: lbTmpDir }
  });
  let lbOk = lbRes.status === 0;
  if (lbOk) {
    const exp = JSON.parse(readFileSync(resolve(dir, 'leaderboard-export.json'), 'utf8'));
    lbOk = Array.isArray(exp.entries) && exp.entries.length === 2 && exp.entries[0].name === 'Minh_1';
  }
  results.push({ name: 'leaderboard-export', status: lbOk ? 0 : 1, elapsed_ms: Date.now() - startLb });
} finally {
  rmSync(lbTmpDir, { recursive: true, force: true });
}

writeFileSync(resolve(dir, 'run-summary.json'), JSON.stringify({ mode: 'phase-4-full', results }, null, 2) + '\n');
if (results.some((r) => r.status !== 0)) process.exitCode = 1;
console.log(JSON.stringify(results, null, 2));
