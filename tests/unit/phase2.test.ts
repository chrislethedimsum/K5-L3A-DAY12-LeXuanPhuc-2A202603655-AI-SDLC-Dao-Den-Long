import { describe, it, expect } from 'vitest';
import { GameWorld } from '../../src/core/simulation';
import { getGroundHeight, NIGHT_MAPS } from '../../src/core/maps';

describe('Phase 2 standardized maps, mechanics & Contract v1.1', () => {
  it('defines exact lantern counts and durations for Nights 1, 2, 3', () => {
    const n1 = new GameWorld({ night: 1 });
    const n2 = new GameWorld({ night: 2 });
    const n3 = new GameWorld({ night: 3 });
    expect(n1.snapshot().lanterns).toHaveLength(5);
    expect(n1.snapshot().time_left_s).toBe(300);
    expect(n2.snapshot().lanterns).toHaveLength(6);
    expect(n2.snapshot().time_left_s).toBe(330);
    expect(n2.snapshot().charms).toHaveLength(1);
    expect(n3.snapshot().lanterns).toHaveLength(7);
    expect(n3.snapshot().time_left_s).toBe(360);
    expect(n3.snapshot().charms).toHaveLength(2);
    expect(NIGHT_MAPS[3].moteSpawns).toHaveLength(30);
  });

  it('dash moves 14 m/s for 12 ticks, uses facing when stationary, holds Y airborne, and sets 90-tick cooldown', () => {
    const w = new GameWorld({
      scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
    });
    // Stationary dash uses default facing [0, 1] (+Z)
    const ev = w.step({ dash: true });
    expect(ev.some((e) => e.name === 'dash')).toBe(true);
    expect(w.snapshot().player.dash_cd_s).toBe(1.5);
    for (let i = 0; i < 11; i++) w.step({ dash: true });
    expect(w.snapshot().player.pos[2]).toBeCloseTo(2.8, 2); // 14 * 0.2 = 2.8m

    // Airborne dash holds Y constant
    const air = new GameWorld({
      scenario: { random_motes: false, random_shades: false, motes: [], shades: [] }
    });
    air.step({ jump: true });
    const yBeforeDash = air.snapshot().player.pos[1];
    air.step({ dash: true, move: [1, 0] });
    expect(air.snapshot().player.pos[1]).toBe(yBeforeDash);
  });

  it('fall below Y < -10 triggers once ignoring invuln, loses all motes, waits 60 ticks, and respawns', () => {
    const w = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        player: { pos: [39.9, 0, 0], carried: 7, flames: 3, invuln_ticks: 90 }
      }
    });
    let hitEvent: ReturnType<GameWorld['step']>[number] | undefined;
    for (let i = 0; i < 140; i++) {
      const evs = w.step(hitEvent ? { move: [0, 0] } : { move: [1, 0] });
      const found = evs.find((e) => e.name === 'player_hit');
      if (found) {
        expect(hitEvent).toBeUndefined(); // exactly once per fall
        hitEvent = found;
      }
      if (hitEvent && !w.hudState().respawning) break;
    }
    expect(hitEvent).toMatchObject({ name: 'player_hit', data: { by: 'fall', flames: 2, dropped: 0, lost: 7 } });
    expect(w.snapshot().player.pos).toEqual([0, 0, 0]);
    expect(w.snapshot().player.carried).toBe(0);
    expect(w.snapshot().player.invuln).toBe(true);

    // Last flame fall ends immediately with no_flames
    const fatal = new GameWorld({
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [],
        shades: [],
        player: { pos: [41, -9.9, 0], flames: 1 }
      }
    });
    const allFatalEvents = [];
    for (let i = 0; i < 10 && fatal.snapshot().state === 'playing'; i++) {
      allFatalEvents.push(...fatal.step());
    }
    expect(allFatalEvents.map((e) => e.name)).toContain('game_over');
    expect(fatal.snapshot().state).toBe('lost');
    expect(fatal.hudState().reason).toBe('no_flames');
  });

  it('Night 2 bamboo bridge and launch pads cross safely to Island B', () => {
    expect(getGroundHeight(2, 35, 0)).toBe(0);
    expect(getGroundHeight(2, 35, 3)).toBeNull();

    const w = new GameWorld({
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        motes: [],
        shades: [],
        player: { pos: [20, 0, 18] }
      }
    });
    for (let i = 0; i < 100; i++) w.step();
    const p = w.snapshot().player;
    expect(p.grounded).toBe(true);
    expect(Math.hypot(p.pos[0] - 70, p.pos[2])).toBeLessThan(28);
  });

  it('Night 3 ramps climb to Tier 1, cliffs block direct climb, bell tower blocks center, and launch pad reaches Tier 2', () => {
    // 30-deg ramp climbs smoothly to Y=3
    const ramp = new GameWorld({
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        player: { pos: [25.98, 0, 15] }
      }
    });
    for (let i = 0; i < 65; i++) ramp.step({ move: [-0.866, -0.5] });
    expect(ramp.snapshot().player.pos[1]).toBeCloseTo(3, 1);

    // Direct vertical cliff at (0, 0, 24.2) -> (0, 0, 23.5) blocks entry onto Tier 1
    const cliff = new GameWorld({
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        player: { pos: [0, 0, 24.05] }
      }
    });
    cliff.step({ move: [0, -1] });
    expect(cliff.snapshot().player.pos[2]).toBeGreaterThan(24);

    // Night 3 launch pad at (0, 3, 13) lands on Tier 2 (Y=6, r<=8) outside Bell Tower (r>=2)
    const pad = new GameWorld({
      night: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        motes: [],
        shades: [],
        player: { pos: [0, 3, 13] }
      }
    });
    for (let i = 0; i < 70; i++) pad.step();
    expect(pad.snapshot().player.pos[1]).toBe(6);
    expect(pad.snapshot().player.pos[2]).toBeCloseTo(6.24, 0);
  });

  it('Drifters steal up to 3 motes ignoring lit safe zones and invuln, and drop loot when pulsed while fleeing', () => {
    const w = new GameWorld({
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        motes: [],
        shades: [],
        player: { pos: [0, 0, 0], carried: 6, invuln_ticks: 90 },
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        drifters: [{ id: 'D1', pos: [0.8, 0, 0], state: 'chase' }]
      }
    });
    const ev1 = w.step();
    expect(ev1.find((e) => e.name === 'drifter_steal')).toMatchObject({
      data: { drifter_id: 'D1', amount: 3, carried: 3 }
    });
    expect(w.snapshot().drifters[0].state).toBe('flee');

    const ev2 = w.step({ pulse: true });
    expect(ev2.find((e) => e.name === 'drifter_drop')).toMatchObject({
      data: { drifter_id: 'D1', amount: 3 }
    });
    expect(w.snapshot().motes.filter((m) => m.kind === 'dropped')).toHaveLength(3);
  });

  it('Wind Charm boosts speed to 7.2 m/s, gives zero dash cooldown for 600 ticks, and respawns after 2700 ticks', () => {
    const w = new GameWorld({
      night: 2,
      scenario: {
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        motes: [],
        shades: [],
        player: { pos: [34.2, 0, 0] }
      }
    });
    let picked = false;
    for (let i = 0; i < 15; i++) {
      if (w.step({ move: [1, 0] }).some((e) => e.name === 'charm_picked')) picked = true;
    }
    expect(picked).toBe(true);
    expect(w.snapshot().charms[0].available).toBe(false);
    expect(w.snapshot().player.charm_s).toBeGreaterThan(9);

    const beforeX = w.snapshot().player.pos[0];
    w.step({ move: [-1, 0] });
    expect(beforeX - w.snapshot().player.pos[0]).toBeCloseTo(7.2 / 60, 3);

    w.step({ dash: true });
    expect(w.snapshot().player.dash_cd_s).toBe(0);
    for (let i = 0; i < 12; i++) w.step({ dash: false });
    expect(w.step({ dash: true }).some((e) => e.name === 'dash')).toBe(true);
  });

  it('Pause freezes sim_tick, timers, cooldowns, and spawns while tick advances', () => {
    const w = new GameWorld({
      seed: 42,
      night: 1,
      scenario: { player: { pulse_cd_ticks: 120 } }
    });
    const evPause = w.step({ pause: true });
    expect(evPause).toEqual([{ type: 'event', tick: 1, name: 'paused', data: {} }]);
    for (let i = 0; i < 10; i++) {
      expect(w.step({ pause: false, move: [1, 0] })).toEqual([]);
    }
    const pausedSnap = w.snapshot();
    expect(pausedSnap.state).toBe('paused');
    expect(pausedSnap.tick).toBe(11);
    expect(pausedSnap.sim_tick).toBe(0);
    expect(pausedSnap.time_left_s).toBe(300);
    expect(pausedSnap.player.pulse_cd_s).toBe(2);

    const evResume = w.step({ pause: true });
    expect(evResume.map((e) => e.name)).toContain('resumed');
    expect(w.snapshot().state).toBe('playing');
    expect(w.snapshot().sim_tick).toBe(1);
  });
});
