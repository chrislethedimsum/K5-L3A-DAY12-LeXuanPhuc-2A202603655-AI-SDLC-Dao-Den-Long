import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const temp = mkdtempSync(join(tmpdir(), 'lantern-test-v12-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const cli = resolve('dist-headless/src/headless/cli.js');
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const json = (name: string, v: unknown) => {
  const path = join(temp, name);
  writeFileSync(path, JSON.stringify(v));
  return path;
};
const records = (s: string) =>
  s
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

describe('headless contract v1.3', () => {
  it.each([1, 2, 3])('emits byte-identical JSONL for Night %i with snapshot & end record', (night) => {
    const a = run('--seed', '42', '--night', String(night), '--ticks', '100');
    const b = run('--seed', '42', '--night', String(night), '--ticks', '100');
    expect(a.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stderr).toBe('');

    const r = records(a.stdout);
    const snapshots = r.filter((x) => x.type === 'snapshot');
    expect(snapshots.map((x) => x.tick)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(snapshots[0].night).toBe(night);
    expect(snapshots[0].player.capacity).toBe(10);
    expect(snapshots[0].lanterns[0]).toMatchObject({ fuel: 0, ever_lit: false, relit_count: 0 });
    expect(r.at(-1)).toMatchObject({ type: 'end', ticks: 100, state: 'playing' });
  });

  it('runs all Phase 2 & Phase 3 feature scenarios via CLI cleanly', () => {
    const cases: [string, number, string][] = [
      ['dash', 1, 'dash'],
      ['fall', 1, 'player_hit'],
      ['launchpad', 2, 'night_start'],
      ['night3-terrain', 3, 'night_start'],
      ['drifter', 2, 'drifter_steal'],
      ['charm', 2, 'charm_picked'],
      ['pause', 1, 'paused'],
      ['safe-push', 1, 'lantern_lit'],
      ['refuel', 1, 'refuel'],
      ['lantern-out-relight', 1, 'lantern_out'],
      ['shade-drain', 1, 'fuel_drain'],
      ['dawn-survived', 1, 'game_over'],
      ['capacity-growth', 1, 'lantern_lit']
    ];
    for (const [name, night, expectedEvent] of cases) {
      const res = run(
        '--seed',
        '42',
        '--night',
        String(night),
        '--scenario',
        resolve(`tests/fixtures/${name}.json`),
        '--inputs',
        resolve(`tests/fixtures/${name}-inputs.json`),
        '--ticks',
        '120'
      );
      expect(res.status).toBe(0);
      const recs = records(res.stdout);
      expect(recs.some((r) => r.type === 'event' && r.name === expectedEvent)).toBe(true);
      expect(recs.at(-1).type).toBe('end');
    }
  });

  it('runs a full Night 3 18,000-tick (300s) headless game within 30 seconds', () => {
    const safeBench = json('bench-n3.json', {
      night: 3,
      wind_enabled: false,
      lanterns: [{ id: 'L1', pos: [0, 6, 6], lit: true, fuel: 100 }],
      player: { pos: [0, 6, 4] }
    });
    const out = join(temp, 'bench.jsonl');
    const started = Date.now();
    const res = run('--seed', '42', '--night', '3', '--scenario', safeBench, '--ticks', '18000', '--snapshot-every', '60', '--out', out);
    const elapsedMs = Date.now() - started;
    expect(res.status).toBe(0);
    expect(elapsedMs).toBeLessThan(30_000);
    const last = records(readFileSync(out, 'utf8')).at(-1);
    expect(last).toMatchObject({ type: 'end', ticks: 18000 });
  });

  it('holds sticky input fields across gap frames until changed', () => {
    const scenario = json('quiet.json', { random_motes: false, random_shades: false });
    const inputs = json('sticky.json', {
      frames: [
        { tick: 0, move: [0, 1], cam_yaw_deg: 0 },
        { tick: 10, move: [0, 0] }
      ]
    });
    const r = records(run('--scenario', scenario, '--inputs', inputs, '--ticks', '20', '--snapshot-every', '10').stdout);
    const snaps = r.filter((x) => x.type === 'snapshot');
    expect(snaps[1].player.pos).toEqual([0, 0, 1]);
    expect(snaps[2].player.pos).toEqual([0, 0, 1]);
  });

  it.each([
    ['--bad', '1'],
    ['--seed', '-1'],
    ['--night', '4'],
    ['--ticks', 'NaN'],
    ['--snapshot-every', '0'],
    ['--seed'],
    ['--ticks', '1', '--ticks', '2'],
    ['--out', '/not/a/real/folder/out.jsonl']
  ])('invalid flags exit 2 %j', (...args: string[]) => {
    const r = run(...args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Error:');
  });

  it.each([
    { frames: [{ tick: 1 }, { tick: 1 }] },
    { frames: [{ tick: 2 }, { tick: 1 }] },
    { frames: [{ tick: 0, move: [4, 0] }] },
    [{ tick: 0 }]
  ])('invalid inputs exit 2 %j', (v: unknown) => {
    expect(run('--inputs', json('bad-input.json', v)).status).toBe(2);
  });

  it('malformed JSON and scenario exit 2', () => {
    const path = join(temp, 'broken.json');
    writeFileSync(path, '{bad');
    expect(run('--scenario', path).status).toBe(2);
    expect(run('--scenario', json('bad-scenario.json', { player: { flames: -1 } })).status).toBe(2);
  });

  it('runs soak test CLI across multiple nights cleanly and rejects bad flags with exit 2', () => {
    const soakCli = resolve('dist-headless/src/headless/soak.js');
    const outPath = join(temp, 'soak-test.json');
    const r = spawnSync(
      process.execPath,
      ['--jitless', '--max-semi-space-size=1', '--no-lazy', '--optimize-for-size', '--expose-gc', soakCli, '--seed', '7', '--nights', '3', '--out', outPath],
      { encoding: 'utf8' }
    );
    expect(r.status).toBe(0);
    const parsed = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(parsed.nights).toBe(3);
    expect(parsed.crashes).toBe(0);
    expect(parsed.results).toHaveLength(3);
    expect(spawnSync(process.execPath, [soakCli, '--nights', '0'], { encoding: 'utf8' }).status).toBe(2);
  });

  it('exports sorted local leaderboard via run_cmd --export-leaderboard', () => {
    const runScript = resolve('scripts/run.mjs');
    const dataDir = join(temp, 'lb-data');
    const outEmpty = join(temp, 'lb-empty.json');
    const rEmpty = spawnSync(process.execPath, [runScript, '--export-leaderboard', outEmpty], {
      encoding: 'utf8',
      env: { ...process.env, DAO_DEN_LONG_DATA_DIR: dataDir }
    });
    expect(rEmpty.status).toBe(0);
    expect(JSON.parse(readFileSync(outEmpty, 'utf8'))).toEqual({ entries: [] });

    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'leaderboard.json'),
      JSON.stringify({
        entries: [
          { name: 'Binh', score: 1200, nights_won: 2, achieved_at: '2026-11-20T10:05:00+07:00', seed: 42 },
          { name: 'Mây_01', score: 1500, nights_won: 3, achieved_at: '2026-11-20T10:10:00+07:00', seed: 42 },
          { name: 'An_99', score: 1200, nights_won: 2, achieved_at: '2026-11-20T10:01:00+07:00', seed: 7 }
        ]
      })
    );
    const outSorted = join(temp, 'lb-sorted.json');
    const rSorted = spawnSync(process.execPath, [runScript, '--export-leaderboard', outSorted], {
      encoding: 'utf8',
      env: { ...process.env, DAO_DEN_LONG_DATA_DIR: dataDir }
    });
    expect(rSorted.status).toBe(0);
    const exported = JSON.parse(readFileSync(outSorted, 'utf8'));
    expect(exported.entries.map((e: { name: string }) => e.name)).toEqual(['Mây_01', 'An_99', 'Binh']);
  });
});
