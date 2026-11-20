import { it, expect } from 'vitest';
import { GameWorld } from '../../src/core/simulation';
import type { Pos3 } from '../../src/core/types';

const p = (x: number): Pos3 => [x, 0, 0];

it('resolves overlapping lit zones together and protects player', () => {
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
      shades: [{ id: 'S1', pos: p(4) }]
    }
  });
  w.step();
  const s = w.snapshot();
  const v = s.shades[0].pos;
  expect(Math.hypot(v[0], v[2])).toBeGreaterThanOrEqual(4.999);
  expect(Math.hypot(v[0] - 8, v[2])).toBeGreaterThanOrEqual(4.999);
  expect(s.player.flames).toBe(3);
});

it('keeps shade on island when lantern protection overlaps shore', () => {
  const w = new GameWorld({
    scenario: {
      random_motes: false,
      random_shades: false,
      lanterns: [
        { id: 'L1', pos: p(34), lit: true },
        { id: 'L2', pos: p(0), lit: false }
      ],
      shades: [{ id: 'S1', pos: p(35), stun_left_s: 1 }]
    }
  });
  w.step();
  const v = w.snapshot().shades[0].pos;
  expect(Math.hypot(v[0], v[2])).toBeLessThanOrEqual(35.001);
  expect(Math.hypot(v[0] - 34, v[2])).toBeGreaterThanOrEqual(4.999);
});
