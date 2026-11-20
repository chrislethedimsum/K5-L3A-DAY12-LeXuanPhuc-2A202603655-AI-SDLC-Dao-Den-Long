import { describe, it, expect } from 'vitest';
import { GameWorld } from '../../src/core/simulation';
import contract from '../../src/core/contract';
import { validateInputsFile, validateScenario } from '../../src/core/validators';
import type { Pos3, Scenario, ScenarioLanternPatch } from '../../src/core/types';

const pos = (x = 0, z = 0, y = 0): Pos3 => [x, y, z];
const allLitExceptL1 = (l1Patch: Partial<ScenarioLanternPatch> = {}): ScenarioLanternPatch[] => [
  { id: 'L1', pos: pos(0, 0), deposited: 0, ...l1Patch },
  { id: 'L2', lit: true },
  { id: 'L3', lit: true },
  { id: 'L4', lit: true },
  { id: 'L5', lit: true }
];

const base: Scenario = { random_motes: false, random_shades: false, motes: [], shades: [] };
const world = (s: Scenario = {}) => new GameWorld({ scenario: { ...base, ...s } });
const advance = (w: GameWorld, n: number) => {
  for (let i = 0; i < n; i++) w.step();
};

describe('Phase 1 regression under Ticket-02 standardized values (Contract v1.1)', () => {
  it('uses exact Contract v1.1 tuning and isolated snapshots/scenarios', () => {
    expect(contract.contract_version).toBe('1.1');
    expect(contract.tuning.player_speed).toBe(6);
    expect(contract.tuning.carry_capacity).toBe(10);
    expect(contract.tuning.lantern_cost).toBe(10);
    expect(Object.isFrozen(contract.tuning)).toBe(true);

    const scenario: Scenario = { ...base, player: { pos: pos(2) } };
    const w = new GameWorld({ scenario });
    scenario.player!.pos![0] = 20;
    const s = w.snapshot();
    s.player.pos[0] = 30;
    expect(w.snapshot().player.pos[0]).toBe(2);
    expect(w.snapshot().score).toBe(0);
  });

  it('same seed reproduces, different seeds diverge, seed 0 works', () => {
    const a = new GameWorld({ seed: 0 });
    const b = new GameWorld({ seed: 0 });
    const c = new GameWorld({ seed: 1 });
    for (let i = 0; i < 300; i++) {
      expect(a.step({ move: [1, 0] })).toEqual(b.step({ move: [1, 0] }));
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot().motes).not.toEqual(c.snapshot().motes);
  });

  it('normalizes diagonal movement, rotates camera per contract, and handles rising-edge jump (7.0 / -20)', () => {
    const w = world();
    w.step({ move: [1, 1] });
    expect(Math.hypot(w.snapshot().player.pos[0], w.snapshot().player.pos[2])).toBeCloseTo(0.1, 2);

    const r = world();
    r.step({ move: [0, 1], cam_yaw_deg: 90 });
    expect(r.snapshot().player.pos[0]).toBe(0.1);
    expect(r.snapshot().player.pos[2]).toBe(0);

    const jumper = world({ player: { pos: pos(0) } });
    jumper.step({ jump: true });
    expect(jumper.snapshot().player.pos[1]).toBeGreaterThan(0);
    expect(jumper.snapshot().player.grounded).toBe(false);
    for (let i = 0; i < 45; i++) jumper.step({ jump: true });
    expect(jumper.snapshot().player.pos[1]).toBe(0);
    expect(jumper.snapshot().player.grounded).toBe(true);
    // Holding jump does not re-jump; must release then press again
    jumper.step({ jump: true });
    expect(jumper.snapshot().player.pos[1]).toBe(0);
    jumper.step({ jump: false });
    jumper.step({ jump: true });
    expect(jumper.snapshot().player.pos[1]).toBeGreaterThan(0);
  });

  // Ticket-02 order: step 3 move -> step 4 pickup (XZ <= 1.0, |dY| <= 1.5, no score on pickup) -> step 5 deposit (+10/mote)
  it('pickup uses XZ <= 1.0, |dY| <= 1.5, capacity 10, and score is awarded on deposit per Ticket-02', () => {
    const w = world({
      player: { carried: 4, pos: pos(0, 0, 1.5) },
      motes: [pos(1.0), pos(1.01), pos(0)],
      lanterns: allLitExceptL1({ deposited: 6 })
    });
    const ev = w.step({ interact: true });
    expect(ev.map((e) => e.name)).toEqual(['night_start', 'mote_picked', 'mote_picked', 'deposit', 'lantern_lit', 'game_over']);
    expect(w.snapshot().player.carried).toBe(2);

    const cap = world({ motes: Array.from({ length: 12 }, () => pos()) });
    const capEvents = cap.step();
    expect(capEvents.filter((e) => e.name === 'mote_picked')).toHaveLength(10);
    expect(cap.snapshot().motes).toHaveLength(2);
    expect(cap.snapshot().motes_active).toBe(2);
    expect(cap.snapshot().score).toBe(0); // Ticket-02: +10 on deposit, not pickup
  });

  it('supports partial deposit, nearest lamp with id tiebreak, rising-edge suppression and leftovers', () => {
    const w = world({
      player: { carried: 3 },
      lanterns: [
        { id: 'L1', pos: pos(1.5), deposited: 0 },
        { id: 'L2', pos: pos(1), deposited: 0 }
      ]
    });
    expect(w.step({ interact: true }).find((e) => e.name === 'deposit')).toMatchObject({
      name: 'deposit',
      data: { lantern_id: 'L2', amount: 3, deposited: 3 }
    });
    expect(w.snapshot().score).toBe(30);
    expect(w.snapshot().lanterns[1].lit).toBe(false);
    expect(w.step({ interact: true }).filter((e) => e.name === 'deposit')).toEqual([]);

    // Tie-break by smaller id when equidistant
    const tie = world({
      player: { carried: 2 },
      lanterns: [
        { id: 'L1', pos: pos(1), deposited: 0 },
        { id: 'L2', pos: pos(-1), deposited: 0 }
      ]
    });
    expect(tie.step({ interact: true }).find((e) => e.name === 'deposit')).toMatchObject({
      data: { lantern_id: 'L1', amount: 2 }
    });
  });

  // Ticket-02: pulse center is y + 0.8m, 3D dist <= 5m, cost 3, stun 120 ticks, push 4m over 15 ticks, +5 score
  it('pulse costs 3, uses 3D radius 5m from y+0.8, stuns 120 ticks, pushes 4m in 15 ticks, cooldown 180 ticks', () => {
    const w = world({
      player: { carried: 9 },
      shades: [
        { id: 's', pos: pos(4.9, 0, 0.8), state: 'chase' },
        { id: 'outside', pos: pos(5.1, 0, 0.8), state: 'chase' }
      ]
    });
    const events = w.step({ pulse: true });
    expect(events.filter((e) => e.name === 'pulse')).toEqual([
      { type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['s'] } }
    ]);
    expect(w.snapshot().shades[0].state).toBe('stunned');
    expect(w.snapshot().score).toBe(5);
    expect(w.snapshot().player.carried).toBe(6);

    // 15 ticks push totals 4m (from x=4.9 -> x=8.9)
    advance(w, 15);
    expect(w.snapshot().shades[0].pos[0]).toBeCloseTo(8.9, 2);

    // Pulse cooldown is 180 ticks (3s) tested in clean world without outside shade hitting player
    const cd = world({ player: { carried: 9 } });
    expect(cd.step({ pulse: true }).some((e) => e.name === 'pulse')).toBe(true);
    expect(cd.step({ pulse: true }).some((e) => e.name === 'pulse')).toBe(false);
    advance(cd, 178);
    expect(cd.snapshot().player.pulse_cd_s).toBeCloseTo(1 / 60, 3);
    expect(cd.step({ pulse: true }).some((e) => e.name === 'pulse')).toBe(true);
    expect(cd.snapshot().player.carried).toBe(3);
  });

  it('coincident pulse pushes +X and stunned shades do not hit', () => {
    const w = world({ player: { carried: 3 }, shades: [{ id: 's', pos: pos(0, 0, 0.8), state: 'chase' }] });
    w.step({ pulse: true });
    advance(w, 15);
    expect(w.snapshot().shades[0].pos[0]).toBeCloseTo(4, 2);
    expect(w.snapshot().player.flames).toBe(3);
  });

  it('hit drops floor half on ring with TTL 480, grants 90 ticks invuln, and shades recoil', () => {
    const w = world({
      player: { carried: 5, pos: pos(0) },
      shades: [
        { id: 'S1', pos: pos(0, 0, 0.8), state: 'chase' },
        { id: 'S2', pos: pos(0, 0, 0.8), state: 'chase' }
      ]
    });
    const ev = w.step();
    expect(ev.filter((e) => e.name === 'player_hit')).toEqual([
      { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } }
    ]);
    expect(w.snapshot().motes).toHaveLength(2);
    expect(w.snapshot().motes[0].kind).toBe('dropped');
    expect(w.snapshot().shades[0].state).toBe('recoil');

    // Invulnerable for 90 ticks (1.5s)
    advance(w, 88);
    expect(w.snapshot().player.flames).toBe(2);
    // Once invuln ends and shade finishes 60-tick recoil and walks back to player, next hit can occur
    const odd = world({ player: { carried: 1 }, shades: [{ id: 'S1', pos: pos(0, 0, 0.8), state: 'chase' }] });
    expect(odd.step().find((e) => e.name === 'player_hit')).toMatchObject({
      data: { by: 'shade', flames: 2, dropped: 0 }
    });
  });

  // Ticket-02: initial 20 motes at tick 0; shades spawn 2 at tick 300 then every 480 ticks (Night 1)
  it('spawns 20 initial motes and schedules shades at tick 300 then 300+480k', () => {
    const w = new GameWorld({ seed: 42, night: 1 });
    expect(w.snapshot().motes).toHaveLength(20);
    expect(w.snapshot().shades).toHaveLength(0);
    advance(w, 299);
    expect(w.snapshot().shades).toHaveLength(0);
    const ev300 = w.step();
    expect(ev300.filter((e) => e.name === 'shade_spawned')).toHaveLength(2);
    expect(w.snapshot().shades.every((s) => s.state === 'spawning')).toBe(true);

    // After 30 ticks, spawning transitions to wander/chase
    advance(w, 30);
    expect(w.snapshot().shades.every((s) => s.state !== 'spawning')).toBe(true);

    const off = world();
    advance(off, 1000);
    expect(off.snapshot().shades).toHaveLength(0);
    expect(off.snapshot().motes).toHaveLength(0);
  });

  it('scenario construction has no score or implicit events and preserves unmentioned lanterns', () => {
    const w = world({
      lanterns: [{ id: 'L1', pos: pos(0), lit: true }],
      motes: [pos()],
      time_left_s: 300
    });
    expect(w.snapshot().tick).toBe(0);
    expect(w.snapshot().score).toBe(0);
    expect(w.snapshot().player.carried).toBe(0);
    expect(w.snapshot().time_left_s).toBe(300);
    expect(w.snapshot().lanterns).toHaveLength(5);
    expect(w.snapshot().lanterns[0].lit).toBe(true);
    expect(w.snapshot().lanterns[1].lit).toBe(false);
  });

  // Ticket-02: win bonus floor(time_left_s)*2 + flames*50, and can win on exact final tick; no_flames always loses
  it('all_lit wins on final tick and adds exact Ticket-02 bonus; no_flames precedes all_lit', () => {
    const w = world({ player: { carried: 10 }, lanterns: allLitExceptL1(), time_left_s: 1 / 60 });
    expect(w.step({ interact: true })).toEqual([
      { type: 'event', tick: 1, name: 'night_start', data: { night: 1 } },
      { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: 10, deposited: 10 } },
      { type: 'event', tick: 1, name: 'lantern_lit', data: { lantern_id: 'L1' } },
      { type: 'event', tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } }
    ]);
    // 10*10 (deposit) + 100 (lit) + 0*2 (time) + 3*50 (flames) = 350
    expect(w.snapshot()).toMatchObject({ state: 'won', score: 350 });

    const before = w.snapshot();
    expect(w.step({ move: [1, 0] })).toEqual([]);
    expect(w.snapshot()).toEqual(before);

    // Night 1 duration 300s = 18000 ticks for dawn
    const dawn = world({ time_left_s: 0.05 });
    advance(dawn, 2);
    expect(dawn.snapshot().state).toBe('playing');
    expect(dawn.step()[0]).toMatchObject({ name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
    expect(dawn.snapshot().time_left_s).toBe(0);
  });
});

describe('strict validation v1.1', () => {
  it.each([
    null,
    [],
    { oops: 1 },
    { seed: -1 },
    { night: 4 },
    { player: { carried: 11 } },
    { player: { flames: 0 } },
    { time_left_s: 0 },
    { lanterns: [{ id: 'INVALID' }] },
    { lanterns: [{ id: 'L1', deposited: 0, lit: true }] },
    { shades: [{ id: 'a', pos: pos() }, { id: 'a', pos: pos() }] },
    { shades: [{ pos: pos(), state: 'invalid' }] },
    { drifters: [{ pos: pos(), state: 'bad' }] },
    { random_motes: 1 }
  ])('rejects malformed scenario %j', (s: unknown) => expect(() => validateScenario(s)).toThrow());

  it.each([
    {},
    [],
    { frames: [{ tick: 0 }, { tick: 0 }] },
    { frames: [{ tick: 2 }, { tick: 1 }] },
    { frames: [{ tick: -1 }] },
    { frames: [{ tick: 0, move: [2, 0] }] },
    { frames: [{ tick: 0, move: [0, NaN] }] },
    { frames: [{ tick: 0, pulse: 1 }] },
    { frames: [{ tick: 0, dash: 'yes' }] },
    { frames: [{ tick: 0, junk: true }] },
    { frames: [{ tick: 0, move: [0, 0, 0] }] }
  ])('rejects malformed inputs %j', (s: unknown) => expect(() => validateInputsFile(s)).toThrow());

  it('checks direct input tick and finite values', () => {
    const w = world();
    expect(() => w.step({ tick: 1 })).toThrow();
    expect(() => w.step({ cam_yaw_deg: Infinity })).toThrow();
    expect(w.snapshot().tick).toBe(0);
  });
});
