import { it, expect } from 'vitest';
import { GameWorld } from '../../src/core/simulation';
import type { Pos3 } from '../../src/core/types';

const p = (x: number, y = 0, z = 0): Pos3 => [x, y, z];

it('resolves overlapping lit 6m safe zones together and protects player', () => {
  const w = new GameWorld({
    scenario: {
      random_motes: false,
      random_shades: false,
      player: { pos: p(3) },
      lanterns: [
        { id: 'L1', pos: p(0), lit: true },
        { id: 'L2', pos: p(8), lit: true },
        { id: 'L3', pos: p(20), lit: false }
      ],
      shades: [{ id: 'S1', pos: p(4, 0.8), state: 'chase' }]
    }
  });
  w.step();
  const s = w.snapshot();
  const v = s.shades[0].pos;
  expect(Math.hypot(v[0], v[2])).toBeGreaterThanOrEqual(5.999);
  expect(Math.hypot(v[0] - 8, v[2])).toBeGreaterThanOrEqual(5.999);
  expect(s.player.flames).toBe(3);
});

it('keeps shade on 40m island when lantern protection overlaps shore', () => {
  const w = new GameWorld({
    scenario: {
      random_motes: false,
      random_shades: false,
      lanterns: [
        { id: 'L1', pos: p(38), lit: true },
        { id: 'L2', pos: p(0), lit: false }
      ],
      shades: [{ id: 'S1', pos: p(39, 0.8), state: 'stunned', state_ticks_left: 60 }]
    }
  });
  w.step();
  const v = w.snapshot().shades[0].pos;
  expect(Math.hypot(v[0], v[2])).toBeLessThanOrEqual(40.001);
  expect(Math.hypot(v[0] - 38, v[2])).toBeGreaterThanOrEqual(5.999);
});

it('pushes shade inside newly lit lantern outside 6m within 30 ticks without hitting player', () => {
  const w = new GameWorld({
    scenario: {
      random_motes: false,
      random_shades: false,
      player: { pos: p(0), carried: 10 },
      lanterns: [{ id: 'L1', pos: p(0), deposited: 0 }],
      shades: [{ id: 'S1', pos: p(0.5, 0.8), state: 'chase' }]
    }
  });
  w.step({ interact: true });
  for (let i = 0; i < 30; i++) w.step();
  const s = w.snapshot();
  expect(s.player.flames).toBe(3);
  expect(Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2])).toBeGreaterThanOrEqual(5.999);
});
