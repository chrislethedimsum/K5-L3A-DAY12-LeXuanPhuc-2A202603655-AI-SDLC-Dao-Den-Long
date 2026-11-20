import { describe, it, expect } from 'vitest';
import { GameWorld } from '../../src/core/simulation';
import type { Pos3 } from '../../src/core/types';

const p = (x = 0, y = 0, z = 0): Pos3 => [x, y, z];

describe('Phase 3 Ticket-03 ("Đèn cạn dầu" · Contract v1.2)', () => {
  it('uses integer 1/60 fuel decay, extinguishes at <= 0 with lantern_out, and relights for 5 motes (+40)', () => {
    const w = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        player: { pos: p(0), carried: 5 },
        lanterns: [{ id: 'L1', pos: p(0), lit: true, fuel: 1 }]
      }
    });
    for (let i = 0; i < 59; i++) {
      expect(w.step().some((e) => e.name === 'lantern_out')).toBe(false);
    }
    expect(w.snapshot().lanterns[0].lit).toBe(true);
    const outEv = w.step();
    expect(outEv).toContainEqual({ type: 'event', tick: 60, name: 'lantern_out', data: { lantern_id: 'L1' } });
    expect(w.snapshot().lanterns[0]).toMatchObject({ lit: false, fuel: 0, deposited: 0, ever_lit: true, relit_count: 0 });

    // Relighting costs only 5 motes and grants +40 relight + 5*5 deposit = 65 score
    const relightEv = w.step({ interact: true });
    expect(relightEv).toContainEqual({
      type: 'event',
      tick: 61,
      name: 'lantern_lit',
      data: { lantern_id: 'L1', relight: true }
    });
    expect(w.snapshot().lanterns[0]).toMatchObject({ lit: true, ever_lit: true, relit_count: 1 });
    expect(w.snapshot().score).toBe(65);
    expect(w.snapshot().player.capacity).toBe(12);
  });

  it('refuels lit lanterns via ceil((100 - fuel)/10), handles empty carry, and restores safe zone at >= 30', () => {
    const w = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [{ id: 'S1', pos: p(2, 0.8), state: 'wander' }],
        player: { pos: p(0), carried: 10 },
        lanterns: [
          { id: 'L1', pos: p(20), lit: true, fuel: 100 },
          { id: 'L2', pos: p(0.5), lit: true, fuel: 25 }
        ]
      }
    });
    // L2 gets ceil((100 - 25)/10) = 8 motes, capped at 100
    const ev = w.step({ interact: true });
    expect(ev.find((e) => e.name === 'refuel')).toMatchObject({
      name: 'refuel',
      data: { lantern_id: 'L2', amount: 8 }
    });
    expect(w.snapshot().player.carried).toBe(2);
    expect(w.snapshot().score).toBe(40); // 8 * 5

    // S1 inside 6m gets pushed out within 30 ticks once L2 reaches >= 30
    for (let i = 0; i < 30; i++) w.step();
    expect(Math.hypot(w.snapshot().shades[0].pos[0] - 0.5, w.snapshot().shades[0].pos[2])).toBeGreaterThanOrEqual(5.999);
  });

  it('safe zone stays active at fuel == 30 and vanishes below 30', () => {
    const exact30 = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        player: { pos: p(0) },
        lanterns: [{ id: 'L1', pos: p(0), lit: true, fuel: 30.1 }], // after 1 tick decay: 30.08 >= 30
        shades: [{ id: 'S1', pos: p(2, 0.8), state: 'chase' }]
      }
    });
    exact30.step();
    expect(exact30.snapshot().shades[0].pos[0]).toBeGreaterThanOrEqual(5.999);

    const low29 = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        player: { pos: p(0) },
        lanterns: [{ id: 'L1', pos: p(0), lit: true, fuel: 29 }],
        shades: [{ id: 'S1', pos: p(0.8, 0.8), state: 'chase' }]
      }
    });
    expect(low29.step().some((e) => e.name === 'player_hit')).toBe(true);
  });

  it('wander Shades target < 30 fuel lanterns, enter drain (5/s stacking, fuel_drain every 60 ticks), chase <= 6m, and give +15 pulse score', () => {
    const w = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        player: { pos: p(-20), carried: 5 },
        lanterns: [
          { id: 'L1', pos: p(10), lit: true, fuel: 25 },
          { id: 'L2', pos: p(15), lit: true, fuel: 25 }
        ],
        shades: [
          { id: 'S1', pos: p(10.5, 0.8), state: 'wander' },
          { id: 'S2', pos: p(11, 0.8), state: 'wander' }
        ]
      }
    });
    const evs: ReturnType<GameWorld['step']> = [];
    for (let i = 0; i < 65; i++) evs.push(...w.step());
    const drainEvents = evs.filter((e) => e.name === 'fuel_drain');
    expect(drainEvents.length).toBe(2); // both S1 and S2 emitted fuel_drain at 60 ticks
    // 25 - (1/s natural + 10/s from 2 shades) over ~1s -> ~14 fuel remaining
    expect(w.snapshot().lanterns[0].fuel).toBeLessThan(15);

    // Pulse on draining shade awards +15 total per draining shade (test directly in Step 7 before Step 8)
    const pulseDrain = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        player: { pos: p(7), carried: 3 },
        lanterns: [{ id: 'L1', pos: p(10), lit: true, fuel: 25 }],
        shades: [{ id: 'S1', pos: p(10.5, 0.8), state: 'drain', target_lantern_id: 'L1' }]
      }
    });
    pulseDrain.step({ pulse: true });
    expect(pulseDrain.snapshot().score).toBe(15);
    expect(pulseDrain.snapshot().shades[0].state).toBe('stunned');

    // Player entering <= 6m switches drain -> chase
    const aggro = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        player: { pos: p(5) },
        lanterns: [{ id: 'L1', pos: p(10), lit: true, fuel: 25 }],
        shades: [{ id: 'S1', pos: p(10, 0.8), state: 'drain', target_lantern_id: 'L1' }]
      }
    });
    aggro.step();
    expect(aggro.snapshot().shades[0].state).toBe('chase');
  });

  it('grows player capacity by +2 per successful light up to 20, ignoring pre-lit scenario lanterns', () => {
    const w = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        player: { pos: p(0), carried: 10, successful_lights: 4 },
        lanterns: [
          { id: 'L1', pos: p(0), deposited: 0 },
          { id: 'L2', pos: p(20), lit: true, fuel: 100 } // pre-lit ignored
        ]
      }
    });
    expect(w.snapshot().player.capacity).toBe(18);
    w.step({ interact: true });
    expect(w.snapshot().player.capacity).toBe(20);
    // Lighting another lantern does not exceed 20
    const capped = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        player: { pos: p(0), carried: 10, successful_lights: 5 },
        lanterns: [{ id: 'L1', pos: p(0), deposited: 0 }]
      }
    });
    expect(capped.snapshot().player.capacity).toBe(20);
    capped.step({ interact: true });
    expect(capped.snapshot().player.capacity).toBe(20);
  });

  it('enforces Night 2 (4/6) and Night 3 (5/7) dawn survival thresholds and no_flames priority on dawn tick', () => {
    // Night 2 needs ceil(0.6*6) = 4
    const n2Win = new GameWorld({
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        motes: [],
        shades: [],
        time_left_s: 1 / 60,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
          { id: 'L4', lit: true, fuel: 50 }
        ]
      }
    });
    n2Win.step();
    expect(n2Win.snapshot().state).toBe('won');
    expect(n2Win.hudState().reason).toBe('dawn_survived');

    // Night 3 needs ceil(0.6*7) = 5; 4 lit loses
    const n3Loss = new GameWorld({
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        time_left_s: 1 / 60,
        lanterns: [
          { id: 'L1', lit: true, fuel: 50 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 50 },
          { id: 'L4', lit: true, fuel: 50 }
        ]
      }
    });
    n3Loss.step();
    expect(n3Loss.snapshot().state).toBe('lost');
    expect(n3Loss.hudState().reason).toBe('dawn');

    // no_flames at the exact dawn tick overrides dawn_survived
    const fatalAtDawn = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [{ id: 'S1', pos: p(0, 0.8), state: 'chase' }],
        player: { pos: p(0), flames: 1 },
        time_left_s: 1 / 60,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 }
        ]
      }
    });
    fatalAtDawn.step();
    expect(fatalAtDawn.snapshot().state).toBe('lost');
    expect(fatalAtDawn.hudState().reason).toBe('no_flames');
  });
});
