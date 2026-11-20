import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { GameWorld } = require('../dist-headless/src/core/simulation.js');
const position = (x = 0, z = 0) => [x, 0, z];
const allLitExceptL1 = (l1 = {}) => [
  { id: 'L1', pos: position(0), deposited: 0, ...l1 },
  { id: 'L2', lit: true },
  { id: 'L3', lit: true },
  { id: 'L4', lit: true },
  { id: 'L5', lit: true }
];
const world = (s = {}) => new GameWorld({ scenario: { random_motes: false, random_shades: false, motes: [], shades: [], ...s } });
const advance = (w, n) => {
  for (let i = 0; i < n; i++) w.step();
};

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

test('seeded deterministic world', () => {
  const a = new GameWorld({ seed: 42 });
  const b = new GameWorld({ seed: 42 });
  advance(a, 1200);
  advance(b, 1200);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('normalized movement, camera rotation, jump and island clamp', () => {
  const w = world();
  w.step({ move: [1, 1], jump: true });
  assert.ok(w.snapshot().player.pos[1] > 0);
  assert.ok(Math.abs(Math.hypot(w.snapshot().player.pos[0], w.snapshot().player.pos[2]) - 0.1) < 0.001);
  advance(w, 60);
  assert.equal(w.snapshot().player.pos[1], 0);
  const r = world();
  r.step({ move: [0, 1], cam_yaw_deg: 90 });
  assert.equal(r.snapshot().player.pos[0], 0.1);
  const e = world({ player: { pos: position(35) } });
  e.step({ move: [1, 0] });
  assert.equal(e.snapshot().player.pos[0], 35);
});

test('pickup capacity and score', () => {
  const w = world({ motes: Array.from({ length: 6 }, () => position()) });
  assert.equal(w.step().length, 5);
  assert.equal(w.snapshot().player.carried, 5);
  assert.equal(w.snapshot().score, 50);
});

test('partial deposit, rising edge and win', () => {
  const w = world({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: position() }] });
  assert.equal(w.step({ interact: true })[0].data.amount, 2);
  assert.deepEqual(w.step({ interact: true }), []);
  const v = world({ player: { carried: 3 }, lanterns: allLitExceptL1() });
  assert.deepEqual(v.step({ interact: true }).map((e) => e.name), ['deposit', 'lantern_lit', 'game_over']);
  assert.equal(v.hudState().reason, 'all_lit');
  assert.equal(v.snapshot().score, 1145);
});

test('pulse cost, stun, push and cooldown', () => {
  const w = world({ player: { carried: 5 }, shades: [{ id: 's', pos: position(6) }] });
  assert.deepEqual(w.step({ pulse: true }).map((e) => e.name), ['pulse']);
  assert.equal(w.snapshot().shades[0].pos[0], 10);
  assert.equal(w.snapshot().shades[0].state, 'stunned');
  assert.equal(w.snapshot().player.carried, 3);
  assert.deepEqual(w.step({ pulse: true }), []);
  advance(w, 178);
  assert.ok(w.step({ pulse: true }).some((e) => e.name === 'pulse'));
});

test('damage, dropped motes and invulnerability', () => {
  const w = world({ player: { carried: 5 }, shades: [{ id: 's', pos: position() }] });
  assert.equal(w.step()[0].data.dropped, 2);
  assert.equal(w.snapshot().motes.length, 2);
  w.step();
  assert.equal(w.snapshot().player.flames, 2);
  assert.equal(w.snapshot().player.carried, 5);
});

test('overlapping safe zones never leak or damage protected player', () => {
  const w = world({
    player: { pos: position(3) },
    lanterns: [
      { id: 'L1', pos: position(0), lit: true },
      { id: 'L2', pos: position(8), lit: true },
      { id: 'L3', pos: position(20), lit: false }
    ],
    shades: [{ id: 's', pos: position(4) }]
  });
  assert.equal(w.step().length, 0);
  const p = w.snapshot().shades[0].pos;
  assert.ok(Math.hypot(p[0], p[2]) >= 4.999);
  assert.ok(Math.hypot(p[0] - 8, p[2]) >= 4.999);
  assert.equal(w.snapshot().player.flames, 3);
});

test('edge safe zone respects island and exclusion together', () => {
  const w = world({
    lanterns: [{ id: 'L1', pos: position(34), lit: true }],
    shades: [{ id: 's', pos: position(35), stun_left_s: 1 }]
  });
  w.step();
  const p = w.snapshot().shades[0].pos;
  assert.ok(Math.hypot(p[0], p[2]) <= 35.001);
  assert.ok(Math.hypot(p[0] - 34, p[2]) >= 4.999);
});

test('dawn at exactly 10800 and frozen terminal state', () => {
  const w = world();
  advance(w, 10799);
  assert.equal(w.snapshot().state, 'playing');
  w.step();
  assert.equal(w.hudState().reason, 'dawn');
  const s = w.snapshot();
  assert.deepEqual(w.step(), []);
  assert.deepEqual(w.snapshot(), s);
});

test('no flames ending', () => {
  const w = world({ player: { flames: 1 }, shades: [{ id: 's', pos: position() }] });
  w.step();
  assert.equal(w.hudState().reason, 'no_flames');
});

test('periodic shade spawning', () => {
  const w = world({ random_shades: true });
  advance(w, 2699);
  assert.ok(w.step().some((e) => e.name === 'shade_spawned'));
});

test('scenario initialization silent', () => {
  const w = world({ lanterns: [{ id: 'L1', pos: position(0), lit: true }] });
  assert.equal(w.snapshot().score, 0);
  assert.equal(w.snapshot().tick, 0);
});

const cli = resolve('dist-headless/src/headless/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI byte identical JSONL with end record', () => {
  const a = run('--seed', '42', '--night', '1', '--ticks', '1200');
  const b = run('--seed', '42', '--night', '1', '--ticks', '1200');
  assert.equal(a.status, 0);
  assert.equal(a.stdout, b.stdout);
  const lines = a.stdout.trim().split('\n');
  assert.equal(JSON.parse(lines[0]).tick, 0);
  assert.equal(JSON.parse(lines.at(-1)).type, 'end');
});

test('CLI malformed flags exit 2', () => {
  for (const args of [['--night', '2'], ['--snapshot-every', '0'], ['--seed', '-1'], ['--wat', '2']]) {
    assert.equal(run(...args).status, 2);
  }
});

const tmp = mkdtempSync(join(tmpdir(), 'island-smoke-'));
try {
  test('CLI duplicate ticks and malformed JSON exit 2', () => {
    const path = join(tmp, 'inputs.json');
    writeFileSync(path, JSON.stringify({ frames: [{ tick: 0 }, { tick: 0 }] }));
    assert.equal(run('--inputs', path).status, 2);
    writeFileSync(path, '{bad');
    assert.equal(run('--scenario', path).status, 2);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} smoke checks passed.`);
