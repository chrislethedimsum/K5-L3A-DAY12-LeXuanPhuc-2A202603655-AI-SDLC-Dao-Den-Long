import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { GameWorld } = require('../dist-headless/src/core/simulation.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

test('3 nights initialized deterministically with Ticket-03 durations and fuel fields', () => {
  for (const [night, dur] of [[1, 240], [2, 270], [3, 300]]) {
    const a = new GameWorld({ seed: 42, night });
    const b = new GameWorld({ seed: 42, night });
    assert.equal(a.snapshot().time_left_s, dur);
    assert.equal(a.snapshot().player.capacity, 10);
    for (let i = 0; i < 600; i++) a.step();
    for (let i = 0; i < 600; i++) b.step();
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
});

test('fuel decay, lantern_out, relight for 5, refuel, capacity growth, and dawn_survived', () => {
  const w = new GameWorld({
    scenario: {
      random_motes: false,
      random_shades: false,
      motes: [],
      shades: [],
      player: { pos: [0, 0, 0], carried: 5 },
      lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true, fuel: 0.05 }]
    }
  });
  for (let i = 0; i < 3; i++) w.step();
  assert.equal(w.snapshot().lanterns[0].lit, false);
  assert.equal(w.snapshot().lanterns[0].ever_lit, true);
  w.step({ interact: true });
  assert.equal(w.snapshot().lanterns[0].lit, true);
  assert.equal(w.snapshot().lanterns[0].relit_count, 1);
  assert.equal(w.snapshot().player.capacity, 12);
});

const cli = resolve('dist-headless/src/headless/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI Night 3 malformed flags exit 2', () => {
  for (const args of [['--night', '4'], ['--snapshot-every', '0'], ['--seed', '-1']]) {
    assert.equal(run(...args).status, 2);
  }
});

const tmp = mkdtempSync(join(tmpdir(), 'island-smoke-v12-'));
try {
  test('CLI invalid inputs exit 2', () => {
    const path = join(tmp, 'inputs.json');
    writeFileSync(path, JSON.stringify({ frames: [{ tick: 0 }, { tick: 0 }] }));
    assert.equal(run('--inputs', path).status, 2);
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} smoke checks passed.`);
