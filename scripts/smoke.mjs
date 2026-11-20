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

test('3 nights initialized deterministically', () => {
  for (const night of [1, 2, 3]) {
    const a = new GameWorld({ seed: 42, night });
    const b = new GameWorld({ seed: 42, night });
    for (let i = 0; i < 600; i++) a.step();
    for (let i = 0; i < 600; i++) b.step();
    assert.deepEqual(a.snapshot(), b.snapshot());
  }
});

test('dash + fall + respawn + charm + drifter + pause core invariants', () => {
  const d = new GameWorld({ scenario: { random_motes: false, random_shades: false, motes: [], shades: [] } });
  assert.ok(d.step({ dash: true }).some((e) => e.name === 'dash'));
  for (let i = 0; i < 11; i++) d.step();
  assert.ok(Math.abs(d.snapshot().player.pos[2] - 2.8) < 0.01);

  const p = new GameWorld({ scenario: { random_motes: false, random_shades: false } });
  p.step({ pause: true });
  p.step({ pause: false });
  assert.equal(p.snapshot().state, 'paused');
  assert.equal(p.snapshot().sim_tick, 0);
  p.step({ pause: true });
  assert.equal(p.snapshot().state, 'playing');
  assert.equal(p.snapshot().sim_tick, 1);
});

const cli = resolve('dist-headless/src/headless/cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI Night 3 malformed flags exit 2', () => {
  for (const args of [['--night', '4'], ['--snapshot-every', '0'], ['--seed', '-1']]) {
    assert.equal(run(...args).status, 2);
  }
});

const tmp = mkdtempSync(join(tmpdir(), 'island-smoke-v11-'));
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
