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

describe('deterministic core', () => {
  it('uses exact contract tuning and isolated snapshots/scenarios', () => {
    expect(contract.contract_version).toBe('1.0');
    expect(contract.tuning.player_speed).toBe(6);
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

  it('normalizes diagonal movement, rotates camera per contract, clamps island and handles rising-edge jump', () => {
    const w = world();
    w.step({ move: [1, 1] });
    expect(Math.hypot(w.snapshot().player.pos[0], w.snapshot().player.pos[2])).toBeCloseTo(0.1, 2);

    // Contract formula: x' = x*cosθ + z*sinθ, z' = -x*sinθ + z*cosθ
    // With move [0, 1] and cam_yaw_deg 90: x' = +1, z' = 0 -> +0.1 on X
    const r = world();
    r.step({ move: [0, 1], cam_yaw_deg: 90 });
    expect(r.snapshot().player.pos[0]).toBe(0.1);
    expect(r.snapshot().player.pos[2]).toBe(0);

    const edge = world({ player: { pos: pos(35) } });
    edge.step({ move: [1, 0], jump: true });
    expect(edge.snapshot().player.pos[0]).toBe(35);
    expect(edge.snapshot().player.pos[1]).toBeGreaterThan(0);
    for (let i = 0; i < 60; i++) edge.step({ jump: true });
    expect(edge.snapshot().player.pos[1]).toBe(0);
    // Holding jump does not re-jump; must release then press again
    edge.step({ jump: true });
    expect(edge.snapshot().player.pos[1]).toBe(0);
    edge.step({ jump: false });
    edge.step({ jump: true });
    expect(edge.snapshot().player.pos[1]).toBeGreaterThan(0);
  });

  it('pickup uses XZ inclusive boundary, capacity and score; interact precedes pickup', () => {
    const w = world({
      player: { carried: 4, pos: pos(0, 0, 4) },
      motes: [pos(1.5), pos(0)],
      lanterns: allLitExceptL1()
    });
    expect(w.step({ interact: true }).map((e) => e.name)).toEqual([
      'deposit',
      'lantern_lit',
      'mote_picked',
      'mote_picked',
      'game_over'
    ]);
    expect(w.snapshot().player.carried).toBe(3);

    const cap = world({ motes: Array.from({ length: 7 }, () => pos()) });
    expect(cap.step()).toHaveLength(5);
    expect(cap.snapshot().motes).toHaveLength(2);
    expect(cap.snapshot().motes_active).toBe(2);
    expect(cap.snapshot().score).toBe(50);
  });

  it('supports partial deposit, nearest lamp, rising-edge suppression and leftovers', () => {
    const w = world({
      player: { carried: 2 },
      lanterns: [
        { id: 'L1', pos: pos(2), deposited: 0 },
        { id: 'L2', pos: pos(1), deposited: 0 }
      ]
    });
    expect(w.step({ interact: true })[0]).toMatchObject({
      name: 'deposit',
      data: { lantern_id: 'L2', amount: 2, deposited: 2 }
    });
    expect(w.snapshot().lanterns[1].lit).toBe(false);
    expect(w.step({ interact: true })).toEqual([]);

    const v = world({
      player: { carried: 5 },
      lanterns: [
        { id: 'L1', pos: pos(0), deposited: 2 },
        { id: 'L2', pos: pos(20), deposited: 0 }
      ]
    });
    v.step({ interact: true });
    expect(v.snapshot().player.carried).toBe(4);
    expect(v.snapshot().score).toBe(100);
  });

  it('does not retroactively interact or pulse with newly picked motes', () => {
    const w = world({ motes: [pos(), pos()], lanterns: [{ id: 'L1', pos: pos() }] });
    expect(w.step({ pulse: true, interact: true }).map((e) => e.name)).toEqual(['mote_picked', 'mote_picked']);
    expect(w.step({ pulse: true, interact: true })).toEqual([]);
    w.step();
    expect(w.step({ pulse: true }).map((e) => e.name)).toEqual(['pulse']);
  });

  it('pulse inclusive radius, stun, push, score and edge/cooldown at exact zero', () => {
    const w = world({
      player: { carried: 5 },
      shades: [{ id: 's', pos: pos(6) }, { id: 'outside', pos: pos(6.01) }]
    });
    const events = w.step({ pulse: true });
    expect(events).toEqual([{ type: 'event', tick: 1, name: 'pulse', data: { stunned_ids: ['s'] } }]);
    expect(w.snapshot().shades[0]).toMatchObject({ pos: pos(10), state: 'stunned' });
    expect(w.snapshot().score).toBe(25);
    expect(w.step({ pulse: true })).toEqual([]);
    expect(w.snapshot().player.carried).toBe(3);
    advance(w, 178);
    expect(w.hudState().pulse_cooldown_left_s).toBeCloseTo(1 / 60, 3);
    expect(w.step({ pulse: true }).some((e) => e.name === 'pulse')).toBe(true);
    expect(w.snapshot().player.carried).toBe(1);
  });

  it('coincident pulse pushes +X and stunned shades do not hit', () => {
    const w = world({ player: { carried: 2 }, shades: [{ id: 's', pos: pos() }] });
    w.step({ pulse: true });
    expect(w.snapshot().shades[0].pos[0]).toBe(4);
    expect(w.snapshot().player.flames).toBe(3);
  });

  it('hit drops floor half at ground, grants invulnerability, pickup is next tick', () => {
    const w = world({
      player: { carried: 5, pos: pos(0, 0, 3) },
      shades: [{ id: 's', pos: pos() }, { id: 's2', pos: pos() }]
    });
    expect(w.step()).toEqual([
      { type: 'event', tick: 1, name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 2 } }
    ]);
    expect(w.snapshot().motes).toHaveLength(2);
    expect(w.snapshot().motes[0].pos[1]).toBe(0);
    expect(w.step().map((e) => e.name)).toEqual(['mote_picked', 'mote_picked']);
    advance(w, 88);
    expect(w.snapshot().player.flames).toBe(2);
    w.step();
    expect(w.snapshot().player.flames).toBe(1);

    const odd = world({ player: { carried: 1 }, shades: [{ id: 's', pos: pos() }] });
    expect(odd.step()[0]).toMatchObject({ name: 'player_hit', data: { by: 'shade', flames: 2, dropped: 0 } });
  });

  it('lit-only safe radius blocks shades even when stunned; unlit does not', () => {
    const w = world({
      lanterns: [{ id: 'L1', pos: pos(0), lit: true }, { id: 'L2', pos: pos(20), lit: false }],
      shades: [{ id: 's', pos: pos(4), stun_left_s: 1 }]
    });
    w.step();
    expect(w.snapshot().shades[0].pos[0]).toBe(5);
    advance(w, 120);
    expect(w.snapshot().player.flames).toBe(3);
    expect(w.snapshot().shades[0].pos[0]).toBe(5);

    const u = world({ lanterns: [{ id: 'L1', pos: pos(0), lit: false }], shades: [{ id: 's', pos: pos() }] });
    expect(u.step()[0].name).toBe('player_hit');
  });

  it('spawns at exact global intervals, respects disabled and shade cap', () => {
    const w = world({ random_motes: true, random_shades: true });
    advance(w, 299);
    expect(w.snapshot().motes).toHaveLength(0);
    w.step();
    expect(w.snapshot().motes).toHaveLength(1);
    advance(w, 2399);
    expect(w.snapshot().shades).toHaveLength(0);
    expect(w.step().map((e) => e.name)).toContain('shade_spawned');

    const off = world();
    advance(off, 2700);
    expect(off.snapshot().shades).toHaveLength(0);
    expect(off.snapshot().motes).toHaveLength(0);

    const capped = world({
      random_shades: true,
      lanterns: [{ id: 'L1', pos: pos(0), lit: true }],
      shades: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, pos: pos(30) }))
    });
    advance(capped, 2700);
    expect(capped.snapshot().tick).toBe(2700);
    expect(capped.snapshot().shades).toHaveLength(4);
  });

  it('scenario construction has no score or implicit pickup/lit reward, and preserves unmentioned lanterns', () => {
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

  it('all_lit wins before dawn and adds exact floor-time and flame bonus; terminal frozen', () => {
    const w = world({ player: { carried: 3 }, lanterns: allLitExceptL1(), time_left_s: 1 / 60 });
    expect(w.step({ interact: true })).toEqual([
      { type: 'event', tick: 1, name: 'deposit', data: { lantern_id: 'L1', amount: 3, deposited: 3 } },
      { type: 'event', tick: 1, name: 'lantern_lit', data: { lantern_id: 'L1' } },
      { type: 'event', tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } }
    ]);
    expect(w.snapshot()).toMatchObject({ state: 'won', score: 250 });
    expect(w.hudState().reason).toBe('all_lit');

    const before = w.snapshot();
    expect(w.step({ move: [1, 0] })).toEqual([]);
    expect(w.snapshot()).toEqual(before);

    const full = world({ lanterns: allLitExceptL1({ lit: true, deposited: 3 }) });
    full.step();
    expect(full.snapshot().score).toBe(179 * 5 + 150);
  });

  it('no_flames precedes dawn; dawn triggers at 10800 ticks', () => {
    const dead = world({ player: { flames: 1 }, time_left_s: 1 / 60, shades: [{ id: 's', pos: pos() }] });
    expect(dead.step().map((e) => e.name)).toEqual(['player_hit', 'game_over']);
    expect(dead.hudState().reason).toBe('no_flames');

    const dawn = world();
    advance(dawn, 10799);
    expect(dawn.snapshot().state).toBe('playing');
    expect(dawn.step()[0]).toMatchObject({
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' }
    });
    expect(dawn.snapshot().time_left_s).toBe(0);
  });
});

describe('strict validation', () => {
  it.each([
    null,
    [],
    { oops: 1 },
    { seed: -1 },
    { night: 2 },
    { player: { carried: 6 } },
    { player: { pos: pos(36) } },
    { player: { flames: 0 } },
    { time_left_s: 0 },
    { lanterns: [{ id: 'INVALID' }] },
    { lanterns: [{ id: 'L1', deposited: 0, lit: true }] },
    { shades: [{ id: 'a', pos: pos() }, { id: 'a', pos: pos() }] },
    { shades: [{ pos: pos(), stun_left_s: 3 }] },
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
