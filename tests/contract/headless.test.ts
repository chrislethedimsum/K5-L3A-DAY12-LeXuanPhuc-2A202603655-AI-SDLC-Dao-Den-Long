import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const temp = mkdtempSync(join(tmpdir(), 'lantern-test-'));
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

describe('headless contract v1.0', () => {
  it('emits byte-identical JSONL for same seed with default snapshot interval 10 and final end record', () => {
    const a = run('--seed', '42', '--night', '1', '--ticks', '100');
    const b = run('--seed', '42', '--night', '1', '--ticks', '100');
    expect(a.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    expect(a.stderr).toBe('');

    const r = records(a.stdout);
    const snapshots = r.filter((x) => x.type === 'snapshot');
    expect(snapshots.map((x) => x.tick)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(snapshots[0].sim_tick).toBe(0);
    expect(snapshots[0].state).toBe('playing');
    expect(snapshots[0].motes_active).toBe(12);
    expect(r.at(-1)).toMatchObject({ type: 'end', ticks: 100, state: 'playing' });
  });

  it('scenario/inputs/out follow exact Test Contract v1.0 schema', () => {
    const scenario = json('win.json', {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: 3, flames: 3 },
      lanterns: [
        { id: 'L1', lit: true },
        { id: 'L2', lit: true },
        { id: 'L3', lit: true },
        { id: 'L4', lit: true },
        { id: 'L5', pos: [0, 0, 0], deposited: 0 }
      ]
    });
    const inputs = json('input.json', { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] });
    const out = join(temp, 'result.jsonl');
    const result = run('--seed', '1', '--night', '1', '--scenario', scenario, '--inputs', inputs, '--out', out, '--ticks', '99');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');

    const r = records(readFileSync(out, 'utf8'));
    expect(r.filter((x) => x.type === 'snapshot').map((x) => x.tick)).toEqual([0]);
    expect(r.filter((x) => x.type === 'event').map((x) => x.name)).toEqual(['deposit', 'lantern_lit', 'game_over']);
    expect(r.at(-1)).toMatchObject({ type: 'end', ticks: 1, state: 'won' });
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
    expect(snaps[1].tick).toBe(10);
    expect(snaps[1].player.pos).toEqual([0, 0, 1]); // 10 ticks * 6 m/s / 60 = 1m
    expect(snaps[2].tick).toBe(20);
    expect(snaps[2].player.pos).toEqual([0, 0, 1]); // stopped after tick 10
  });

  it('zero ticks outputs tick 0 snapshot and end record', () => {
    const r = records(run('--ticks', '0').stdout);
    expect(r.map((x) => x.type)).toEqual(['snapshot', 'end']);
    expect(r[1]).toMatchObject({ type: 'end', ticks: 0 });
  });

  it.each([
    ['--bad', '1'],
    ['--seed', '-1'],
    ['--seed', '1.2'],
    ['--night', '2'],
    ['--ticks', 'NaN'],
    ['--snapshot-every', '0'],
    ['--seed'],
    ['--ticks', '1', '--ticks', '2'],
    ['--seed', '4294967296'],
    ['--out', '/not/a/real/folder/out.jsonl']
  ])('invalid flags exit 2 %j', (...args: string[]) => {
    const r = run(...args);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Error:');
    expect(r.stdout).toBe('');
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
});
